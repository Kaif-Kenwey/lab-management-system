import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { NotFoundError, ForbiddenError, ConflictError } from "@/lib/errors";
import { parseBody, mapPrismaError, dateString } from "@/lib/validation";
import { recordEquipmentEvent } from "@/lib/lifecycle";
import { can } from "@/lib/permissions";
import { EQUIPMENT_STATUS, EQUIPMENT_CATEGORY, EQUIPMENT_CONDITION } from "@/lib/constants";
import { ACTIVE_RESERVATION_STATUSES } from "@/lib/business-rules";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  code: z.string().trim().min(1).max(60).optional(),
  labId: z.string().min(1).optional(),
  category: z.enum(EQUIPMENT_CATEGORY).optional(),
  status: z.enum(EQUIPMENT_STATUS).optional(),
  condition: z.enum(EQUIPMENT_CONDITION).optional(),
  manufacturer: z.string().trim().max(200).optional().nullable(),
  serialNumber: z.string().trim().max(200).optional().nullable(),
  price: z.coerce.number().min(0).optional(),
  purchaseDate: dateString.optional().nullable(),
  warrantyUntil: dateString.optional().nullable(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(_req, async (ctx) => {
    const equipment = await db.equipment.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      include: {
        lab: { select: { id: true, name: true, code: true } },
        calibrationRecords: { orderBy: { nextDueAt: "desc" } },
        events: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { actor: { select: { id: true, name: true, email: true } } },
        },
        reservations: {
          orderBy: { startAt: "desc" },
          take: 10,
          include: { user: { select: { id: true, name: true } } },
        },
        checkouts: {
          orderBy: { checkedOutAt: "desc" },
          take: 10,
          include: { user: { select: { id: true, name: true } } },
        },
        maintenanceRecords: {
          orderBy: { scheduledAt: "desc" },
          take: 10,
          include: { technician: { select: { id: true, name: true } } },
        },
        _count: { select: { reservations: true, checkouts: true, maintenanceRecords: true, events: true } },
      },
    });
    if (!equipment) throw NotFoundError("Equipment not found");

    const [activeCheckouts, activeReservations] = await Promise.all([
      db.checkout.count({
        where: { organizationId: ctx.session.orgId, equipmentId: id, status: "ACTIVE" },
      }),
      db.reservation.count({
        where: {
          organizationId: ctx.session.orgId,
          equipmentId: id,
          status: { in: [...ACTIVE_RESERVATION_STATUSES] },
        },
      }),
    ]);

    return ok({ ...equipment, activeCheckoutCount: activeCheckouts, activeReservationCount: activeReservations });
  }, "equipment.read");
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, updateSchema);

    const equipment = await db.equipment.findFirst({
      where: { id, organizationId: ctx.session.orgId },
    });
    if (!equipment) throw NotFoundError("Equipment not found");

    if (data.labId && data.labId !== equipment.labId) {
      const lab = await db.lab.findFirst({
        where: { id: data.labId, organizationId: ctx.session.orgId },
      });
      if (!lab) throw NotFoundError("Lab not found in your organization");
    }

    // RETIRED requires the dedicated equipment.retire permission (double check
    // inside the handler — equipment.manage alone is not sufficient).
    if (data.status === "RETIRED" && equipment.status !== "RETIRED") {
      if (!can(ctx.session.role, "equipment.retire")) {
        throw ForbiddenError("Retiring equipment requires permission: equipment.retire");
      }
    }

    const statusChanged = data.status !== undefined && data.status !== equipment.status;

    try {
      const updated = await db.$transaction(async (tx) => {
        const row = await tx.equipment.update({
          where: { id },
          data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.code !== undefined ? { code: data.code } : {}),
            ...(data.labId !== undefined ? { labId: data.labId } : {}),
            ...(data.category !== undefined ? { category: data.category } : {}),
            ...(data.status !== undefined ? { status: data.status } : {}),
            ...(data.condition !== undefined ? { condition: data.condition } : {}),
            ...(data.manufacturer !== undefined ? { manufacturer: data.manufacturer } : {}),
            ...(data.serialNumber !== undefined ? { serialNumber: data.serialNumber } : {}),
            ...(data.price !== undefined ? { price: data.price } : {}),
            ...(data.purchaseDate !== undefined ? { purchaseDate: data.purchaseDate } : {}),
            ...(data.warrantyUntil !== undefined ? { warrantyUntil: data.warrantyUntil } : {}),
          },
          include: { lab: { select: { id: true, name: true, code: true } } },
        });
        if (statusChanged) {
          await recordEquipmentEvent(tx, {
            organizationId: ctx.session.orgId,
            equipmentId: id,
            type: data.status === "RETIRED" ? "RETIRED" : "STATUS_CHANGED",
            previousStatus: equipment.status,
            newStatus: data.status!,
            notes:
              data.status === "RETIRED"
                ? "Equipment withdrawn from service"
                : "Status updated via equipment management",
            actorId: ctx.session.userId,
          });
        }
        return row;
      });

      await audit(ctx.session.orgId, ctx.session.userId, "EQUIPMENT_UPDATED", "Equipment", id, {
        name: updated.name,
        status: updated.status,
        ...(statusChanged ? { previousStatus: equipment.status } : {}),
      });
      return ok(updated);
    } catch (e) {
      mapPrismaError(e, "Equipment with this code already exists in your organization");
    }
  }, "equipment.manage");
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(_req, async (ctx) => {
    const equipment = await db.equipment.findFirst({
      where: { id, organizationId: ctx.session.orgId },
    });
    if (!equipment) throw NotFoundError("Equipment not found");

    const [activeCheckouts, activeReservations] = await Promise.all([
      db.checkout.count({
        where: { organizationId: ctx.session.orgId, equipmentId: id, status: { in: ["ACTIVE", "OVERDUE"] } },
      }),
      db.reservation.count({
        where: {
          organizationId: ctx.session.orgId,
          equipmentId: id,
          status: { in: [...ACTIVE_RESERVATION_STATUSES] },
        },
      }),
    ]);
    if (activeCheckouts > 0 || activeReservations > 0) {
      throw ConflictError(
        "Equipment has active checkouts or reservations and cannot be deleted — resolve them first"
      );
    }

    try {
      await db.equipment.delete({ where: { id } });
      await audit(ctx.session.orgId, ctx.session.userId, "EQUIPMENT_DELETED", "Equipment", id, {
        name: equipment.name,
        code: equipment.code,
      });
      return ok({ success: true });
    } catch (e) {
      mapPrismaError(e, "Equipment is referenced by other records and cannot be deleted");
    }
  }, "labs.manage");
}
