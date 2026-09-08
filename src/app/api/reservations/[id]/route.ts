import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { NotFoundError, ForbiddenError, ConflictError } from "@/lib/errors";
import { parseBody } from "@/lib/validation";
import { notify } from "@/lib/notify";
import { can } from "@/lib/permissions";

/**
 * Reservation lifecycle (v2):
 *   PENDING   → APPROVED | REJECTED | CANCELLED
 *   APPROVED  → ACTIVE | COMPLETED | CANCELLED | NO_SHOW
 *   ACTIVE    → COMPLETED | CANCELLED
 *   terminal: COMPLETED, REJECTED, CANCELLED, NO_SHOW
 */
const TRANSITIONS: Record<string, string[]> = {
  PENDING: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["ACTIVE", "COMPLETED", "CANCELLED", "NO_SHOW"],
  ACTIVE: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const patchSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "CANCELLED", "ACTIVE", "COMPLETED", "NO_SHOW"], {
    message: "Invalid reservation status",
  }),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const { status } = await parseBody(req, patchSchema);

    const reservation = await db.reservation.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      include: {
        equipment: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true } },
      },
    });
    if (!reservation) throw NotFoundError("Reservation not found");

    const allowed = TRANSITIONS[reservation.status] ?? [];
    if (!allowed.includes(status)) {
      throw ConflictError(`Invalid reservation transition: ${reservation.status} → ${status}`);
    }

    const hasApprovePerm = can(ctx.session.role, "reservations.approve");
    const isOwner = reservation.userId === ctx.session.userId;

    if (status === "APPROVED" || status === "REJECTED" || status === "NO_SHOW") {
      if (!hasApprovePerm) throw ForbiddenError("Approving reservations requires permission: reservations.approve");
    } else if (status === "CANCELLED") {
      if (!isOwner && !hasApprovePerm) {
        throw ForbiddenError("Only the reservation owner or an approver can cancel it");
      }
    } else if (status === "ACTIVE" || status === "COMPLETED") {
      if (!hasApprovePerm && !isOwner) {
        throw ForbiddenError("Starting or completing a reservation requires the owner or an approver");
      }
    }

    const now = new Date();
    const updated = await db.reservation.update({
      where: { id },
      data: {
        status,
        ...(status === "ACTIVE" ? { activatedAt: now, checkedInAt: now } : {}),
        ...(status === "COMPLETED" ? { completedAt: now } : {}),
      },
      include: {
        equipment: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true } },
      },
    });

    // Notify the owner on approve/reject (and cancellations by staff)
    if (status === "APPROVED" || status === "REJECTED" || (status === "CANCELLED" && !isOwner)) {
      const verb =
        status === "APPROVED" ? "approved" : status === "REJECTED" ? "rejected" : "cancelled by staff";
      await notify(db, {
        organizationId: ctx.session.orgId,
        userId: reservation.userId,
        title: `Your reservation was ${verb}`,
        body: `${reservation.equipment.name} · ${reservation.startAt.toLocaleString()} — ${status.toLowerCase()}.`,
        type: status === "APPROVED" ? "SUCCESS" : "WARNING",
        entityType: "Reservation",
        entityId: reservation.id,
      });
    }

    await audit(ctx.session.orgId, ctx.session.userId, `RESERVATION_${status}`, "Reservation", id, {
      from: reservation.status,
      to: status,
      equipment: reservation.equipment.name,
    });
    return ok(updated);
  }, "reservations.read");
}
