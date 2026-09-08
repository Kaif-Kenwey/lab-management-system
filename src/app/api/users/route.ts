import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { ROLES } from "@/lib/constants";

export async function GET(req: NextRequest) {
  return withAuth(async (session) => {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const where: Prisma.UserWhereInput = {
      organizationId: session.orgId,
      ...(q
        ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, { department: { contains: q } }] }
        : {}),
    };
    const users = await db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    return ok(users);
  }, ["ADMIN", "LAB_MANAGER"]);
}

export async function POST(req: NextRequest) {
  return withAuth(async (session) => {
    const b = await body<{
      name?: string;
      email?: string;
      password?: string;
      role?: string;
      department?: string;
    }>(req);

    if (!b.name?.trim() || !b.email?.trim() || !b.password) {
      return fail("Name, email and password are required");
    }
    if (b.password.length < 8) return fail("Password must be at least 8 characters");
    if (b.role && !(ROLES as readonly string[]).includes(b.role)) {
      return fail(`Invalid role — must be one of: ${ROLES.join(", ")}`);
    }

    const email = b.email.toLowerCase().trim();
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) return fail("A user with this email already exists", 409);

    const passwordHash = await hashPassword(b.password);

    try {
      const user = await db.user.create({
        data: {
          organizationId: session.orgId,
          name: b.name.trim(),
          email,
          passwordHash,
          role: b.role ?? "STUDENT",
          department: b.department ?? null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          department: true,
          status: true,
          createdAt: true,
        },
      });
      await audit(session.orgId, session.userId, "USER_CREATED", "User", user.id, {
        name: user.name,
        role: user.role,
      });
      return ok(user, 201);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return fail("A user with this email already exists", 409);
      }
      throw e;
    }
  }, ["ADMIN"]);
}
