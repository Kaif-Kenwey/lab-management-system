import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody, mapPrismaError, optionalId } from "@/lib/validation";
import { LAB_STATUS } from "@/lib/constants";
import { NotFoundError, ConflictError } from "@/lib/errors";

const labDetailInclude = {
  department: { select: { id: true, name: true, code: true } },
  manager: { select: { id: true, name: true, email: true } },
  equipment: { orderBy: { createdAt: "desc" } },
  inventoryItems: { orderBy: { name: "asc" } },
  chemicals: { orderBy: { name: "asc" } },
  sessions: {
    include: { experiment: { select: { id: true, title: true, code: true } } },
    orderBy: { scheduledAt: "desc" as const },
    take: 50,
  },
  _count: { select: { equipment: true } },
} satisfies Prisma.LabInclude;

const updateLabSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  code: z.string().trim().min(1).max(40).optional(),
  location: z.string().trim().max(200).nullish(),
  capacity: z.coerce.number().int().min(0).optional(),
  status: z.enum(LAB_STATUS).optional(),
  description: z.string().max(1000).nullish(),
  managerId: optionalId,
  departmentId: optionalId,
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const lab = await db.lab.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      include: labDetailInclude,
    });
    if (!lab) throw NotFoundError("Lab not found");
    return ok(lab);
  }, "labs.read");
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, updateLabSchema);

    const lab = await db.lab.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true, name: true },
    });
    if (!lab) throw NotFoundError("Lab not found");

    if (data.managerId) {
      const manager = await db.user.findFirst({
        where: { id: data.managerId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!manager) throw NotFoundError("Manager not found in your organization");
    }
    if (data.departmentId) {
      const department = await db.department.findFirst({
        where: { id: data.departmentId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!department) throw NotFoundError("Department not found in your organization");
    }

    try {
      const updated = await db.lab.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.code !== undefined ? { code: data.code } : {}),
          ...(data.location !== undefined ? { location: data.location ?? null } : {}),
          ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.description !== undefined ? { description: data.description ?? null } : {}),
          ...(data.managerId !== undefined ? { managerId: data.managerId ?? null } : {}),
          ...(data.departmentId !== undefined ? { departmentId: data.departmentId ?? null } : {}),
        },
        include: {
          department: { select: { id: true, name: true, code: true } },
          manager: { select: { id: true, name: true, email: true } },
          _count: { select: { equipment: true } },
        },
      });
      await audit(ctx.session.orgId, ctx.session.userId, "LAB_UPDATED", "Lab", id, {
        name: updated.name,
      });
      return ok(updated);
    } catch (e) {
      mapPrismaError(e, "A lab with this code already exists in your organization");
    }
  }, "labs.manage");
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const lab = await db.lab.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true, name: true, code: true, _count: { select: { equipment: true } } },
    });
    if (!lab) throw NotFoundError("Lab not found");

    if (lab._count.equipment > 0) {
      throw ConflictError("Lab has equipment and cannot be deleted — reassign or remove its equipment first");
    }

    try {
      await db.lab.delete({ where: { id } });
      await audit(ctx.session.orgId, ctx.session.userId, "LAB_DELETED", "Lab", id, {
        name: lab.name,
        code: lab.code,
      });
      return ok({ success: true });
    } catch (e) {
      mapPrismaError(e, "Lab is still referenced by other records and cannot be deleted");
    }
  }, "labs.manage");
}
