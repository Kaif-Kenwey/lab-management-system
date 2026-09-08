import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, body } from "@/lib/api";
import { verifyPassword, signSession, TOKEN_COOKIE } from "@/lib/auth";
import { sessionCookieOptions } from "@/lib/cookies";
import { ApiError } from "@/lib/errors";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { logError, logRequest, runWithRequestContext } from "@/lib/request-context";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("A valid email is required"),
  password: z.string().min(1, "Password is required").max(200),
});

export async function POST(req: NextRequest) {
  return runWithRequestContext(
    {
      requestId: req.headers.get("x-request-id") || randomUUID(),
      method: "POST",
      path: "/api/auth/login",
    },
    async () => {
      const startedAt = Date.now();
      try {
        // Read the body exactly once (request streams are single-consumption).
        const raw = await body<{ email?: string; password?: string }>(req);

        // Brute-force protection: 8 attempts / minute per IP+email
        const pre = rateLimit(clientKey(req, "auth:login", (raw.email ?? "anon").slice(0, 64)), 8, 60_000);
        if (!pre.allowed) {
          const res = fail("RATE_LIMITED", `Too many login attempts — retry in ${pre.retryAfterSec}s`, 429);
          logRequest({ status: res.status, durationMs: Date.now() - startedAt });
          return res;
        }

        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          const res = fail("VALIDATION_ERROR", first?.message ?? "Invalid login payload", 400);
          logRequest({ status: res.status, durationMs: Date.now() - startedAt });
          return res;
        }
        const { email, password } = parsed.data;

        const user = await db.user.findUnique({
          where: { email },
          include: { organization: true },
        });
        if (!user) {
          // Generic message — never reveal which emails exist
          throw new ApiError("UNAUTHORIZED", "Invalid email or password", 401);
        }
        if (user.status !== "ACTIVE") {
          throw new ApiError("FORBIDDEN", "Account is suspended. Contact your administrator.", 403);
        }

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) throw new ApiError("UNAUTHORIZED", "Invalid email or password", 401);

        const token = await signSession({
          userId: user.id,
          orgId: user.organizationId,
          orgSlug: user.organization.slug,
          role: user.role,
          email: user.email,
          name: user.name,
        });

        const res = ok({
          user: { id: user.id, name: user.name, email: user.email, role: user.role, orgName: user.organization.name },
        });
        res.cookies.set(TOKEN_COOKIE, token, sessionCookieOptions(req, 60 * 60 * 24 * 7));
        logRequest({ status: res.status, durationMs: Date.now() - startedAt, userId: user.id, orgId: user.organizationId });
        return res;
      } catch (error) {
        if (error instanceof ApiError) {
          const res = fail(error.code, error.message, error.status);
          logRequest({ status: res.status, durationMs: Date.now() - startedAt });
          return res;
        }
        logError("login_failed", error);
        const res = fail("VALIDATION_ERROR", "Invalid login payload", 400);
        logRequest({ status: res.status, durationMs: Date.now() - startedAt });
        return res;
      }
    }
  );
}
