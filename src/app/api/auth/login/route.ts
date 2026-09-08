import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, body } from "@/lib/api";
import { verifyPassword, signSession, TOKEN_COOKIE } from "@/lib/auth";
import { sessionCookieOptions } from "@/lib/cookies";

export async function POST(req: NextRequest) {
  const { email, password } = await body<{ email?: string; password?: string }>(req);
  if (!email || !password) return fail("Email and password are required");

  const user = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { organization: true },
  });
  if (!user) return fail("Invalid email or password", 401);
  if (user.status !== "ACTIVE") return fail("Account is suspended. Contact your administrator.", 403);

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return fail("Invalid email or password", 401);

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
  return res;
}
