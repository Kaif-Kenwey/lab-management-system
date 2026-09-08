import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { hashPassword, signSession, TOKEN_COOKIE } from "@/lib/auth";
import { sessionCookieOptions } from "@/lib/cookies";
import { ApiError } from "@/lib/errors";
import { parseBody, mapPrismaError } from "@/lib/validation";
import { rateLimit, clientKey } from "@/lib/rate-limit";

const signupSchema = z.object({
  orgName: z.string().trim().min(2, "Organization name must be at least 2 characters").max(100),
  name: z.string().trim().min(2, "Your name must be at least 2 characters").max(100),
  email: z.string().trim().toLowerCase().email("A valid email is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200)
    .regex(/[A-Za-z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "auth:signup"), 5, 60_000);
  if (!rl.allowed) {
    return fail("RATE_LIMITED", `Too many attempts — retry in ${rl.retryAfterSec}s`, 429);
  }

  try {
    const { orgName, name, email, password } = await parseBody(req, signupSchema);

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiError("RESOURCE_CONFLICT", "An account with this email already exists", 409);
    }

    // Build a unique slug from the org name
    const baseSlug =
      orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 40) || "org";
    let slug = baseSlug;
    let n = 1;
    while (await db.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${n++}`;
    }

    const passwordHash = await hashPassword(password);

    const user = await db.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: orgName, slug, plan: "PRO" } });
      const created = await tx.user.create({
        data: {
          organizationId: org.id,
          name,
          email,
          passwordHash,
          role: "ADMIN",
        },
        include: { organization: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          userId: created.id,
          action: "ORG_CREATED",
          entityType: "Organization",
          entityId: org.id,
          metadata: JSON.stringify({ name: org.name }),
        },
      });
      return created;
    });

    const token = await signSession({
      userId: user.id,
      orgId: user.organizationId,
      orgSlug: user.organization.slug,
      role: user.role,
      email: user.email,
      name: user.name,
    });

    const res = ok(
      { user: { id: user.id, name: user.name, email: user.email, role: user.role, orgName: user.organization.name } },
      201
    );
    res.cookies.set(TOKEN_COOKIE, token, sessionCookieOptions(req, 60 * 60 * 24 * 7));
    return res;
  } catch (error) {
    if (error instanceof ApiError) {
      return fail(error.code, error.message, error.status);
    }
    try {
      mapPrismaError(error, "An account with this email already exists");
    } catch (mapped) {
      if (mapped instanceof ApiError) return fail(mapped.code, mapped.message, mapped.status);
    }
    return fail("INTERNAL_ERROR", "Registration failed", 500);
  }
}
