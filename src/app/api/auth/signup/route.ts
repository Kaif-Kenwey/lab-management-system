import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, body, audit } from "@/lib/api";
import { hashPassword, signSession, TOKEN_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { orgName, name, email, password } = await body<{
    orgName?: string;
    name?: string;
    email?: string;
    password?: string;
  }>(req);

  if (!orgName?.trim() || !name?.trim() || !email?.trim() || !password) {
    return fail("Organization name, your name, email and password are required");
  }
  if (password.length < 8) return fail("Password must be at least 8 characters");

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return fail("An account with this email already exists", 409);

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
    const org = await tx.organization.create({ data: { name: orgName.trim(), slug, plan: "PRO" } });
    const created = await tx.user.create({
      data: {
        organizationId: org.id,
        name: name.trim(),
        email: normalizedEmail,
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
  res.cookies.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
