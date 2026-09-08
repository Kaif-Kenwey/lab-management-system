import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";
import { ROLES } from "@/lib/constants";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const b = await body<{
      role?: string;
      status?: string;
      name?: string;
      department?: string;
    }>(req);

    if (b.role && !(ROLES as readonly string[]).includes(b.role)) {
      return fail(`Invalid role — must be one of: ${ROLES.join(", ")}`);
    }
    if (b.status && !["ACTIVE", "SUSPENDED"].includes(b.status)) {
      return fail("Invalid status — must be ACTIVE or SUSPENDED");
    }

    const user = await db.user.findFirst({ where: { id, organizationId: session.orgId } });
    if (!user) return fail("User not found", 404);

    const data: Prisma.UserUncheckedUpdateInput = {};
    if (b.role !== undefined) data.role = b.role;
    if (b.status !== undefined) data.status = b.status;
    if (b.name !== undefined) data.name = b.name.trim();
    if (b.department !== undefined) data.department = b.department ?? null;

    const updated = await db.user.update({
      where: { id },
      data,
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
    await audit(session.orgId, session.userId, "USER_UPDATED", "User", id, {
      role: updated.role,
      status: updated.status,
    });
    return ok(updated);
  }, ["ADMIN"]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    if (session.userId === id) return fail("You cannot delete your own account", 400);

    const user = await db.user.findFirst({ where: { id, organizationId: session.orgId } });
    if (!user) return fail("User not found", 404);

    try {
      await db.user.delete({ where: { id } });
      await audit(session.orgId, session.userId, "USER_DELETED", "User", id, {
        name: user.name,
        email: user.email,
      });
      return ok({ success: true });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        return fail(
          "This user has related records (reservations, checkouts, incidents, etc.) and cannot be deleted",
          409
        );
      }
      throw e;
    }
  }, ["ADMIN"]);
}
