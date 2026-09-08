import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

const RESERVATION_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const b = await body<{ status?: string }>(req);
    if (!b.status) return fail("status is required");
    if (!RESERVATION_STATUSES.includes(b.status)) {
      return fail(`Invalid status — must be one of: ${RESERVATION_STATUSES.join(", ")}`);
    }

    const reservation = await db.reservation.findFirst({
      where: { id, organizationId: session.orgId },
    });
    if (!reservation) return fail("Reservation not found", 404);

    const isApprover = session.role === "ADMIN" || session.role === "LAB_MANAGER";
    if (b.status === "CANCELLED") {
      const isOwner = reservation.userId === session.userId;
      if (!isOwner && !isApprover) {
        return fail("Forbidden — only the reservation owner or an approver can cancel it", 403);
      }
    } else {
      // Approve / reject / complete / reopen require approver roles
      if (!isApprover) {
        return fail("Forbidden — requires role: ADMIN or LAB_MANAGER", 403);
      }
    }

    const updated = await db.reservation.update({
      where: { id },
      data: { status: b.status },
      include: {
        equipment: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true } },
      },
    });
    await audit(session.orgId, session.userId, "RESERVATION_UPDATED", "Reservation", id, {
      status: b.status,
      equipment: updated.equipment.name,
    });
    return ok(updated);
  });
}
