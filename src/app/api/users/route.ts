import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody, mapPrismaError } from "@/lib/validation";
import { hashPassword } from "@/lib/auth";
import { ROLES } from "@/lib/constants";

// Explicit select — NEVER expose passwordHash
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  department: true,
  status: true,
  phone: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("A valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  role: z.enum(ROLES).optional().default("STUDENT"),
  department: z.string().trim().max(120).nullish(),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const q = ctx.searchParams.get("q")?.trim() ?? "";
    const users = await db.user.findMany({
      where: {
        organizationId: ctx.session.orgId,
        ...(q
          ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, { department: { contains: q } }] }
          : {}),
      },
      select: userSelect,
      orderBy: { createdAt: "asc" },
    });
    return ok(users);
  }, "users.manage");
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, createUserSchema);
    const passwordHash = await hashPassword(data.password);

    try {
      const user = await db.user.create({
        data: {
          organizationId: ctx.session.orgId,
          name: data.name,
          email: data.email,
          passwordHash,
          role: data.role,
          department: data.department ?? null,
        },
        select: userSelect,
      });
      await audit(ctx.session.orgId, ctx.session.userId, "USER_CREATED", "User", user.id, {
        name: user.name,
        role: user.role,
      });
      return ok(user, 201);
    } catch (e) {
      mapPrismaError(e, "A user with this email already exists");
    }
  }, "users.manage");
}
