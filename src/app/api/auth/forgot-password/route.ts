import { NextRequest } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/request-context";

const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email("A valid email is required"),
});

// Always 202 — never reveals whether the account exists. When no email
// provider is configured the demo token is returned so the flow is testable.
export async function POST(req: NextRequest) {
  const pre = rateLimit(clientKey(req, "auth:forgot"), 3, 60_000);
  if (!pre.allowed) {
    return fail("RATE_LIMITED", `Too many requests — retry in ${pre.retryAfterSec}s`, 429);
  }

  try {
    const raw = await req.json();
    const parsed = forgotSchema.safeParse(raw);
    if (!parsed.success) {
      // Do not leak validity details — same response either way
      return ok({ message: "If the account exists, a reset link has been sent" }, 202);
    }

    const user = await db.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, organizationId: true },
    });

    let payload: Record<string, unknown> = {
      message: "If the account exists, a reset link has been sent",
    };

    if (user) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await db.passwordResetToken.create({
        data: { organizationId: user.organizationId, userId: user.id, tokenHash, expiresAt },
      });

      if (!process.env.EMAIL_PROVIDER) {
        console.log(`[forgot-password] DEMO reset token for ${parsed.data.email}: ${token}`);
        payload = {
          ...payload,
          demoResetToken: token,
          expiresAt: expiresAt.toISOString(),
          note: "DEMO MODE — email provider not configured",
        };
      }
    }

    return ok(payload, 202);
  } catch (error) {
    logError("forgot_password_failed", error);
    return ok({ message: "If the account exists, a reset link has been sent" }, 202);
  }
}
