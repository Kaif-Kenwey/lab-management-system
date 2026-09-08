import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, withAuth } from "@/lib/api";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { ACTIVE_RESERVATION_STATUSES } from "@/lib/business-rules";

/**
 * GET /api/equipment/lookup?qrToken=LABVAULT:<token>
 * Full context for the QR scan flow: equipment + lab + availability +
 * active reservation/checkout.
 */
export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const qrToken = ctx.searchParams.get("qrToken")?.trim() ?? "";
    if (!qrToken) throw ValidationError("qrToken query parameter is required");
    // Accept both the raw token and the prefixed "LABVAULT:<token>" payload
    const token = qrToken.startsWith("LABVAULT:") ? qrToken.slice("LABVAULT:".length) : qrToken;

    const equipment = await db.equipment.findFirst({
      where: {
        organizationId: ctx.session.orgId,
        OR: [{ qrToken: token }, { qrToken: qrToken }],
      },
      include: {
        lab: { select: { id: true, name: true, code: true, location: true } },
      },
    });
    if (!equipment) throw NotFoundError("No equipment matches this QR code");

    const [activeReservation, activeCheckout] = await Promise.all([
      db.reservation.findFirst({
        where: {
          organizationId: ctx.session.orgId,
          equipmentId: equipment.id,
          status: { in: [...ACTIVE_RESERVATION_STATUSES] },
          endAt: { gt: new Date() },
        },
        orderBy: { startAt: "asc" },
        include: { user: { select: { id: true, name: true } } },
      }),
      db.checkout.findFirst({
        where: {
          organizationId: ctx.session.orgId,
          equipmentId: equipment.id,
          status: "ACTIVE",
        },
        orderBy: { checkedOutAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      }),
    ]);

    return ok({
      equipment: {
        id: equipment.id,
        name: equipment.name,
        code: equipment.code,
        category: equipment.category,
        status: equipment.status,
        condition: equipment.condition,
        manufacturer: equipment.manufacturer,
        serialNumber: equipment.serialNumber,
        qrToken: equipment.qrToken,
      },
      lab: equipment.lab,
      availability: {
        checkoutAllowed: equipment.status === "AVAILABLE",
        reserveAllowed: !["RETIRED", "UNDER_MAINTENANCE"].includes(equipment.status),
      },
      activeReservation,
      activeCheckout,
    });
  }, "equipment.read");
}
