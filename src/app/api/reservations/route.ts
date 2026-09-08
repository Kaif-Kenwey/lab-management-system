import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { NotFoundError, ValidationError, ConflictError } from "@/lib/errors";
import { parseBody, dateString } from "@/lib/validation";
import { recordEquipmentEvent } from "@/lib/lifecycle";
import { assertCanReserve, findOverlap, ACTIVE_RESERVATION_STATUSES } from "@/lib/business-rules";

const createSchema = z.object({
  equipmentId: z.string().min(1, "Equipment is required"),
  startAt: dateString,
  endAt: dateString,
  purpose: z.string().trim().max(500).optional().nullable(),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const sp = ctx.searchParams;
    const status = sp.get("status")?.trim() ?? "";
    const equipmentId = sp.get("equipmentId")?.trim() ?? "";
    const q = sp.get("q")?.trim() ?? "";

    const where: Prisma.ReservationWhereInput = {
      organizationId: ctx.session.orgId,
      ...(status ? { status } : {}),
      ...(equipmentId ? { equipmentId } : {}),
      ...(q
        ? {
            OR: [
              { purpose: { contains: q } },
              { equipment: { is: { OR: [{ name: { contains: q } }, { code: { contains: q } }] } } },
              { user: { is: { name: { contains: q } } } },
            ],
          }
        : {}),
    };

    const reservations = await db.reservation.findMany({
      where,
      include: {
        equipment: { select: { id: true, name: true, code: true, status: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { startAt: "desc" },
    });
    return ok(reservations);
  }, "reservations.read");
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, createSchema);
    if (data.endAt.getTime() <= data.startAt.getTime()) {
      throw ValidationError("endAt must be after startAt");
    }

    const reservation = await db.$transaction(async (tx) => {
      const equipment = await tx.equipment.findFirst({
        where: { id: data.equipmentId, organizationId: ctx.session.orgId },
      });
      assertCanReserve(equipment); // 404 / 409 for retired / under-maintenance

      const existing = await tx.reservation.findMany({
        where: {
          organizationId: ctx.session.orgId,
          equipmentId: data.equipmentId,
          status: { in: [...ACTIVE_RESERVATION_STATUSES] },
        },
        select: { startAt: true, endAt: true },
      });
      if (findOverlap(existing, { startAt: data.startAt, endAt: data.endAt })) {
        throw ConflictError(
          "This equipment already has a reservation overlapping the selected time slot"
        );
      }

      const created = await tx.reservation.create({
        data: {
          organizationId: ctx.session.orgId,
          equipmentId: data.equipmentId,
          userId: ctx.session.userId,
          startAt: data.startAt,
          endAt: data.endAt,
          purpose: data.purpose ?? null,
          status: "PENDING",
        },
        include: {
          equipment: { select: { id: true, name: true, code: true, status: true } },
          user: { select: { id: true, name: true } },
        },
      });

      await recordEquipmentEvent(tx, {
        organizationId: ctx.session.orgId,
        equipmentId: data.equipmentId,
        type: "RESERVED",
        notes: `Reserved ${created.startAt.toISOString()} → ${created.endAt.toISOString()}${
          created.purpose ? ` — ${created.purpose}` : ""
        }`,
        actorId: ctx.session.userId,
      });

      return created;
    });

    await audit(ctx.session.orgId, ctx.session.userId, "RESERVATION_CREATED", "Reservation", reservation.id, {
      equipment: reservation.equipment.name,
      startAt: reservation.startAt.toISOString(),
      endAt: reservation.endAt.toISOString(),
    });
    return ok(reservation, 201);
  }, "reservations.create");
}
