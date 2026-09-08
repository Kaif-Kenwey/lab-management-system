import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { parseBody, dateString } from "@/lib/validation";
import { recordEquipmentEvent } from "@/lib/lifecycle";
import { assertCanCheckout } from "@/lib/business-rules";

const createSchema = z.object({
  equipmentId: z.string().min(1, "Equipment is required"),
  userId: z.string().min(1).optional(),
  dueAt: dateString,
  conditionOut: z.string().trim().max(60).optional().nullable(),
  accessoriesOut: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const sp = ctx.searchParams;
    const status = sp.get("status")?.trim() ?? "";
    const equipmentId = sp.get("equipmentId")?.trim() ?? "";
    const q = sp.get("q")?.trim() ?? "";
    const now = new Date();

    const where: Prisma.CheckoutWhereInput = {
      organizationId: ctx.session.orgId,
      ...(status ? { status } : {}),
      ...(equipmentId ? { equipmentId } : {}),
      ...(q
        ? {
            OR: [
              { equipment: { is: { OR: [{ name: { contains: q } }, { code: { contains: q } }] } } },
              { user: { is: { name: { contains: q } } } },
            ],
          }
        : {}),
    };

    const checkouts = await db.checkout.findMany({
      where,
      include: {
        equipment: { select: { id: true, name: true, code: true, status: true } },
        user: { select: { id: true, name: true } },
        issuedBy: { select: { id: true, name: true } },
      },
      orderBy: { checkedOutAt: "desc" },
    });

    // Overdue is computed at read time: ACTIVE (or OVERDUE-marked) past dueAt.
    const enriched = checkouts.map((c) => ({
      ...c,
      overdue: c.status === "ACTIVE" ? c.dueAt.getTime() < now.getTime() : c.status === "OVERDUE",
    }));
    return ok(enriched);
  }, "equipment.read");
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, createSchema);

    const checkout = await db.$transaction(async (tx) => {
      const equipment = await tx.equipment.findFirst({
        where: { id: data.equipmentId, organizationId: ctx.session.orgId },
      });
      assertCanCheckout(equipment); // 404 / 409 (retired | under maintenance | already out)

      const borrowerId = data.userId ?? ctx.session.userId;
      const borrower = await tx.user.findFirst({
        where: { id: borrowerId, organizationId: ctx.session.orgId },
      });
      if (!borrower) throw NotFoundError("Borrower not found in your organization");

      const created = await tx.checkout.create({
        data: {
          organizationId: ctx.session.orgId,
          equipmentId: data.equipmentId,
          userId: borrowerId,
          issuedById: ctx.session.userId,
          dueAt: data.dueAt,
          conditionOut: data.conditionOut ?? null,
          accessoriesOut: data.accessoriesOut ?? null,
          notes: data.notes ?? null,
          status: "ACTIVE",
        },
        include: {
          equipment: { select: { id: true, name: true, code: true, status: true } },
          user: { select: { id: true, name: true } },
          issuedBy: { select: { id: true, name: true } },
        },
      });

      await tx.equipment.update({
        where: { id: data.equipmentId },
        data: { status: "IN_USE" },
      });

      await recordEquipmentEvent(tx, {
        organizationId: ctx.session.orgId,
        equipmentId: data.equipmentId,
        type: "CHECKED_OUT",
        previousStatus: equipment.status,
        newStatus: "IN_USE",
        notes: `Checked out to ${borrower.name}, due ${created.dueAt.toISOString()}`,
        actorId: ctx.session.userId,
      });

      return created;
    });

    await audit(ctx.session.orgId, ctx.session.userId, "CHECKOUT_CREATED", "Checkout", checkout.id, {
      equipment: checkout.equipment.name,
      borrower: checkout.user.name,
      dueAt: checkout.dueAt.toISOString(),
    });
    return ok(checkout, 201);
  }, "equipment.checkout");
}
