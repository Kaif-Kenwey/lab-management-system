import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody, mapPrismaError } from "@/lib/validation";
import { ROLES } from "@/lib/constants";
import { NotFoundError, ValidationError } from "@/lib/errors";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  department: true,
  status: true,
  phone: true,
  createdAt: true,
} as const;

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  department: z.string().trim().max(120).nullish(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, updateUserSchema);

    const user = await db.user.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true, name: true },
    });
    if (!user) throw NotFoundError("User not found");

    const updated = await db.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.department !== undefined ? { department: data.department ?? null } : {}),
      },
      select: userSelect,
    });
    await audit(ctx.session.orgId, ctx.session.userId, "USER_UPDATED", "User", id, {
      name: updated.name,
      role: updated.role,
      status: updated.status,
    });
    return ok(updated);
  }, "users.manage");
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    if (id === ctx.session.userId) {
      throw ValidationError("You cannot delete your own account");
    }
    const user = await db.user.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true, name: true },
    });
    if (!user) throw NotFoundError("User not found");

    try {
      await db.user.delete({ where: { id } });
      await audit(ctx.session.orgId, ctx.session.userId, "USER_DELETED", "User", id, {
        name: user.name,
      });
      return ok({ success: true });
    } catch (e) {
      mapPrismaError(e, "User is still referenced by other records");
    }
  }, "users.manage");
}
