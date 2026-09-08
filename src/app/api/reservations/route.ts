import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

export async function GET(req: NextRequest) {
  return withAuth(async (session) => {
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status")?.trim() ?? "";
    const equipmentId = sp.get("equipmentId")?.trim() ?? "";

    const where: Prisma.ReservationWhereInput = {
      organizationId: session.orgId,
      ...(status ? { status } : {}),
      ...(equipmentId ? { equipmentId } : {}),
    };

    const reservations = await db.reservation.findMany({
      where,
      include: {
        equipment: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { startAt: "desc" },
    });
    return ok(reservations);
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async (session) => {
    const b = await body<{
      equipmentId?: string;
      startAt?: string;
      endAt?: string;
      purpose?: string;
    }>(req);

    if (!b.equipmentId || !b.startAt || !b.endAt) {
      return fail("Equipment, startAt and endAt are required");
    }

    const startAt = new Date(b.startAt);
    if (Number.isNaN(startAt.getTime())) return fail("Invalid startAt date", 400);
    const endAt = new Date(b.endAt);
    if (Number.isNaN(endAt.getTime())) return fail("Invalid endAt date", 400);
    if (endAt <= startAt) return fail("endAt must be after startAt", 400);

    const equipment = await db.equipment.findFirst({
      where: { id: b.equipmentId, organizationId: session.orgId },
    });
    if (!equipment) return fail("Equipment not found in your organization", 404);

    // Overlap check: NOT (endAt <= newStart OR startAt >= newEnd)
    const overlapping = await db.reservation.count({
      where: {
        organizationId: session.orgId,
        equipmentId: b.equipmentId,
        status: { in: ["PENDING", "APPROVED"] },
        NOT: [{ OR: [{ endAt: { lte: startAt } }, { startAt: { gte: endAt } }] }],
      },
    });
    if (overlapping > 0) {
      return fail("This equipment already has a reservation overlapping the selected time slot", 409);
    }

    const reservation = await db.reservation.create({
      data: {
        organizationId: session.orgId,
        equipmentId: b.equipmentId,
        userId: session.userId,
        startAt,
        endAt,
        purpose: b.purpose ?? null,
        status: "PENDING",
      },
      include: {
        equipment: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true } },
      },
    });
    await audit(session.orgId, session.userId, "RESERVATION_CREATED", "Reservation", reservation.id, {
      equipment: equipment.name,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
    });
    return ok(reservation, 201);
  });
}
