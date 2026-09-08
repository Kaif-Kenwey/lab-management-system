import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { parseBody } from "@/lib/validation";
import { recordEquipmentEvent } from "@/lib/lifecycle";
import { MAINTENANCE_ACTIVE_STATUSES } from "@/lib/constants";

const patchSchema = z.object({
  checkedIn: z.literal(true, { message: "checkedIn must be true to check in this equipment" }),
  conditionIn: z.string().trim().max(60).optional().nullable(),
  accessoriesIn: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, patchSchema);

    const checkout = await db.checkout.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      include: {
        equipment: { select: { id: true, name: true, code: true, status: true } },
        user: { select: { id: true, name: true } },
      },
    });
    if (!checkout) throw NotFoundError("Checkout not found");
    if (checkout.status === "RETURNED") {
      throw ConflictError("This equipment has already been checked in");
    }

    const now = new Date();

    const updated = await db.$transaction(async (tx) => {
      // An active work order keeps the asset out of service after check-in.
      const activeMaintenance = await tx.maintenanceRecord.findFirst({
        where: {
          organizationId: ctx.session.orgId,
          equipmentId: checkout.equipmentId,
          status: { in: [...MAINTENANCE_ACTIVE_STATUSES] },
        },
        select: { id: true },
      });
      const equipmentStatus = activeMaintenance ? "UNDER_MAINTENANCE" : "AVAILABLE";

      const row = await tx.checkout.update({
        where: { id },
        data: {
          checkedInAt: now,
          status: "RETURNED",
          conditionIn: data.conditionIn ?? null,
          accessoriesIn: data.accessoriesIn ?? null,
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
        include: {
          equipment: { select: { id: true, name: true, code: true, status: true } },
          user: { select: { id: true, name: true } },
          issuedBy: { select: { id: true, name: true } },
        },
      });

      await tx.equipment.update({
        where: { id: checkout.equipmentId },
        data: { status: equipmentStatus },
      });

      await recordEquipmentEvent(tx, {
        organizationId: ctx.session.orgId,
        equipmentId: checkout.equipmentId,
        type: "RETURNED",
        previousStatus: checkout.equipment.status,
        newStatus: equipmentStatus,
        notes: activeMaintenance
          ? "Checked in — held for active maintenance work order"
          : "Checked in and returned to service",
        actorId: ctx.session.userId,
      });

      return { ...row, equipmentStatus };
    });

    await audit(ctx.session.orgId, ctx.session.userId, "CHECKOUT_RETURNED", "Checkout", id, {
      equipment: checkout.equipment.name,
      overdue: checkout.dueAt.getTime() < now.getTime(),
      equipmentStatus: updated.equipmentStatus,
    });
    return ok(updated);
  }, "equipment.checkout");
}
