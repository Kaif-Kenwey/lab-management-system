import { NextRequest } from "next/server";
import { Prisma, PrismaPromise } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

const MAINTENANCE_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const b = await body<{
      status?: string;
      type?: string;
      scheduledAt?: string;
      technicianId?: string | null;
      cost?: number | string;
      notes?: string | null;
    }>(req);

    if (b.status && !MAINTENANCE_STATUSES.includes(b.status)) {
      return fail(`Invalid status — must be one of: ${MAINTENANCE_STATUSES.join(", ")}`);
    }

    const record = await db.maintenanceRecord.findFirst({
      where: { id, organizationId: session.orgId },
    });
    if (!record) return fail("Maintenance record not found", 404);

    if (b.technicianId) {
      const technician = await db.user.findFirst({
        where: { id: b.technicianId, organizationId: session.orgId },
      });
      if (!technician) return fail("Technician not found in your organization", 404);
    }

    const data: Prisma.MaintenanceRecordUncheckedUpdateInput = {};
    if (b.status !== undefined) data.status = b.status;
    if (b.type !== undefined) data.type = b.type;
    if (b.scheduledAt !== undefined) {
      const scheduledAt = new Date(b.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) return fail("Invalid scheduledAt date", 400);
      data.scheduledAt = scheduledAt;
    }
    if (b.technicianId !== undefined) data.technicianId = b.technicianId;
    if (b.cost !== undefined) {
      const cost = Number(b.cost);
      if (Number.isNaN(cost) || cost < 0) return fail("Cost must be a non-negative number");
      data.cost = cost;
    }
    if (b.notes !== undefined) data.notes = b.notes;
    if (b.status === "COMPLETED") data.completedAt = new Date();

    // Sync equipment status with maintenance progress
    const ops: PrismaPromise<unknown>[] = [db.maintenanceRecord.update({ where: { id }, data })];
    if (b.status === "IN_PROGRESS") {
      ops.push(
        db.equipment.update({ where: { id: record.equipmentId }, data: { status: "UNDER_MAINTENANCE" } })
      );
    } else if (b.status === "COMPLETED") {
      ops.push(
        db.equipment.update({ where: { id: record.equipmentId }, data: { status: "AVAILABLE" } })
      );
    }
    await db.$transaction(ops);

    const updated = await db.maintenanceRecord.findUnique({
      where: { id },
      include: {
        equipment: { select: { id: true, name: true, code: true } },
        technician: { select: { id: true, name: true } },
      },
    });

    await audit(session.orgId, session.userId, "MAINTENANCE_UPDATED", "MaintenanceRecord", id, {
      status: updated?.status ?? b.status,
      equipment: updated?.equipment.name,
    });
    return ok(updated);
  }, ["ADMIN", "LAB_MANAGER", "TECHNICIAN"]);
}
