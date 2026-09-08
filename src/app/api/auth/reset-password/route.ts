import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { audit } from "@/lib/api";
import { logError } from "@/lib/request-context";

const resetSchema = z.object({
  token: z.string().min(10, "Reset token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Za-z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

// Consumes a reset token and sets the new password.
export async function POST(req: NextRequest) {
  const pre = rateLimit(clientKey(req, "auth:reset"), 5, 60_000);
  if (!pre.allowed) {
    return fail("RATE_LIMITED", `Too many requests — retry in ${pre.retryAfterSec}s`, 429);
  }

  try {
    const parsed = resetSchema.safeParse(await req.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return fail("VALIDATION_ERROR", first?.message ?? "Invalid request body", 400);
    }

    const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
    const resetToken = await db.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() < Date.now()) {
      return fail("VALIDATION_ERROR", "Invalid or expired reset token", 400);
    }

    const passwordHash = await hashPassword(parsed.data.password);

    const user = await db.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
        select: { id: true, organizationId: true },
      });
      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });
      return updated;
    });

    await audit(user.organizationId, user.id, "PASSWORD_RESET", "User", user.id, {});
    return ok({ success: true });
  } catch (error) {
    logError("reset_password_failed", error);
    return fail("VALIDATION_ERROR", "Invalid or expired reset token", 400);
  }
}
