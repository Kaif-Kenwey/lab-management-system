import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const lab = await db.lab.findFirst({
      where: { id, organizationId: session.orgId },
      include: {
        manager: { select: { id: true, name: true, email: true } },
        equipment: { orderBy: { createdAt: "desc" } },
        inventoryItems: { orderBy: { name: "asc" } },
        chemicals: { orderBy: { name: "asc" } },
        sessions: {
          include: { experiment: { select: { title: true, code: true } } },
          orderBy: { scheduledAt: "desc" },
          take: 50,
        },
      },
    });
    if (!lab) return fail("Lab not found", 404);
    return ok(lab);
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const b = await body<{
      name?: string;
      code?: string;
      location?: string | null;
      capacity?: number | string;
      status?: string;
      description?: string | null;
      managerId?: string | null;
    }>(req);

    if (b.status && !["ACTIVE", "MAINTENANCE", "CLOSED"].includes(b.status)) {
      return fail("Invalid status — must be ACTIVE, MAINTENANCE or CLOSED");
    }

    const lab = await db.lab.findFirst({ where: { id, organizationId: session.orgId } });
    if (!lab) return fail("Lab not found", 404);

    if (b.managerId) {
      const manager = await db.user.findFirst({
        where: { id: b.managerId, organizationId: session.orgId },
      });
      if (!manager) return fail("Manager not found in your organization", 404);
    }

    const data: Prisma.LabUncheckedUpdateInput = {};
    if (b.name !== undefined) data.name = b.name.trim();
    if (b.code !== undefined) data.code = b.code.trim();
    if (b.location !== undefined) data.location = b.location;
    if (b.capacity !== undefined) {
      const capacity = Number(b.capacity);
      if (Number.isNaN(capacity) || capacity < 0) return fail("Capacity must be a non-negative number");
      data.capacity = capacity;
    }
    if (b.status !== undefined) data.status = b.status;
    if (b.description !== undefined) data.description = b.description;
    if (b.managerId !== undefined) data.managerId = b.managerId;

    try {
      const updated = await db.lab.update({
        where: { id },
        data,
        include: {
          manager: { select: { id: true, name: true, email: true } },
          _count: { select: { equipment: true } },
        },
      });
      await audit(session.orgId, session.userId, "LAB_UPDATED", "Lab", id, {
        name: updated.name,
      });
      return ok(updated);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return fail("A lab with this code already exists in your organization", 409);
      }
      throw e;
    }
  }, ["ADMIN", "LAB_MANAGER"]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const lab = await db.lab.findFirst({ where: { id, organizationId: session.orgId } });
    if (!lab) return fail("Lab not found", 404);

    try {
      await db.lab.delete({ where: { id } });
      await audit(session.orgId, session.userId, "LAB_DELETED", "Lab", id, {
        name: lab.name,
        code: lab.code,
      });
      return ok({ success: true });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        return fail("Cannot delete a lab that still has equipment, inventory, chemicals or sessions", 409);
      }
      throw e;
    }
  }, ["ADMIN"]);
}
