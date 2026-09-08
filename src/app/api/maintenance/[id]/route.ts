import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { parseBody, dateString } from "@/lib/validation";
import { recordEquipmentEvent } from "@/lib/lifecycle";
import { notify } from "@/lib/notify";
import { assertMaintenanceTransition } from "@/lib/business-rules";
import { MAINTENANCE_STATUS, MAINTENANCE_ACTIVE_STATUSES, MAINTENANCE_TYPE, MAINTENANCE_PRIORITY } from "@/lib/constants";

const patchSchema = z.object({
  status: z.enum(MAINTENANCE_STATUS).optional(),
  technicianId: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  issue: z.string().trim().max(2000).optional().nullable(),
  type: z.enum(MAINTENANCE_TYPE).optional(),
  priority: z.enum(MAINTENANCE_PRIORITY).optional(),
  scheduledAt: dateString.optional().nullable(),
  laborCost: z.coerce.number().min(0).optional(),
  partsCost: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, patchSchema);

    const record = await db.maintenanceRecord.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      include: {
        equipment: { select: { id: true, name: true, code: true, status: true } },
        technician: { select: { id: true, name: true } },
      },
    });
    if (!record) throw NotFoundError("Maintenance work order not found");

    // Assigning a technician to an OPEN work order (without an explicit
    // status) auto-transitions OPEN → ASSIGNED, mirroring POST behaviour.
    let newStatus = data.status;
    if (!newStatus && data.technicianId && record.status === "OPEN") {
      newStatus = "ASSIGNED";
    }
    if (newStatus && newStatus !== record.status) {
      assertMaintenanceTransition(record.status, newStatus); // 409 on illegal moves
    }

    const now = new Date();
    const laborCost = data.laborCost ?? record.laborCost;
    const partsCost = data.partsCost ?? record.partsCost;

    const startedAt =
      newStatus === "IN_PROGRESS" && !record.startedAt ? now : record.startedAt;
    const completedAt = newStatus === "COMPLETED" ? now : record.completedAt;
    const downtimeHours =
      newStatus === "COMPLETED" && startedAt && completedAt
        ? Math.round(((completedAt.getTime() - startedAt.getTime()) / 3_600_000) * 100) / 100
        : record.downtimeHours;

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.maintenanceRecord.update({
        where: { id },
        data: {
          ...(newStatus ? { status: newStatus } : {}),
          ...(data.technicianId !== undefined ? { technicianId: data.technicianId } : {}),
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.issue !== undefined ? { issue: data.issue } : {}),
          ...(data.type !== undefined ? { type: data.type } : {}),
          ...(data.priority !== undefined ? { priority: data.priority } : {}),
          ...(data.scheduledAt !== undefined ? { scheduledAt: data.scheduledAt } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.laborCost !== undefined || data.partsCost !== undefined || newStatus === "COMPLETED"
            ? { laborCost, partsCost, cost: laborCost + partsCost }
            : {}),
          startedAt,
          completedAt,
          downtimeHours,
        } as Prisma.MaintenanceRecordUncheckedUpdateInput,
        include: {
          equipment: { select: { id: true, name: true, code: true, status: true } },
          technician: { select: { id: true, name: true } },
        },
      });

      const equipmentId = record.equipment.id;

      if (newStatus === "IN_PROGRESS") {
        await tx.equipment.update({
          where: { id: equipmentId },
          data: { status: "UNDER_MAINTENANCE" },
        });
        await recordEquipmentEvent(tx, {
          organizationId: ctx.session.orgId,
          equipmentId,
          type: "MAINTENANCE_STARTED",
          previousStatus: record.equipment.status,
          newStatus: "UNDER_MAINTENANCE",
          notes: `${record.title} — work started`,
          actorId: ctx.session.userId,
        });
      } else if (newStatus === "COMPLETED" || newStatus === "CANCELLED") {
        const otherActive = await tx.maintenanceRecord.count({
          where: {
            organizationId: ctx.session.orgId,
            equipmentId,
            id: { not: id },
            status: { in: [...MAINTENANCE_ACTIVE_STATUSES] },
          },
        });
        if (otherActive === 0 && record.equipment.status === "UNDER_MAINTENANCE") {
          await tx.equipment.update({
            where: { id: equipmentId },
            data: { status: "AVAILABLE" },
          });
          await recordEquipmentEvent(tx, {
            organizationId: ctx.session.orgId,
            equipmentId,
            type: newStatus === "COMPLETED" ? "MAINTENANCE_COMPLETED" : "STATUS_CHANGED",
            previousStatus: "UNDER_MAINTENANCE",
            newStatus: "AVAILABLE",
            notes:
              newStatus === "COMPLETED"
                ? `${record.title} — back in service`
                : `${record.title} — work order cancelled`,
            actorId: ctx.session.userId,
          });
        } else if (newStatus === "COMPLETED") {
          await recordEquipmentEvent(tx, {
            organizationId: ctx.session.orgId,
            equipmentId,
            type: "MAINTENANCE_COMPLETED",
            notes: `${record.title} — completed (equipment still held by other active work orders)`,
            actorId: ctx.session.userId,
          });
        }
      }

      // Assignment notifications (new assignment, reassignment, or explicit
      // ASSIGNED transition)
      const technicianId = data.technicianId !== undefined ? data.technicianId : record.technicianId;
      const assigned = newStatus === "ASSIGNED" || (!!data.technicianId && data.technicianId !== record.technicianId);
      if (assigned && technicianId) {
        await notify(tx, {
          organizationId: ctx.session.orgId,
          userId: technicianId,
          title: "Work order assigned to you",
          body: `${row.title} — ${row.equipment.name} (${row.priority.toLowerCase()} priority).`,
          type: "INFO",
          entityType: "MaintenanceRecord",
          entityId: row.id,
        });
      }

      return row;
    });

    await audit(
      ctx.session.orgId,
      ctx.session.userId,
      newStatus === "ASSIGNED" ? "MAINTENANCE_ASSIGNED" : "MAINTENANCE_UPDATED",
      "MaintenanceRecord",
      id,
      {
        from: record.status,
        to: newStatus ?? record.status,
        equipment: record.equipment.name,
        ...(newStatus === "COMPLETED" ? { downtimeHours, cost: laborCost + partsCost } : {}),
      }
    );
    return ok(updated);
  }, "maintenance.manage");
}
