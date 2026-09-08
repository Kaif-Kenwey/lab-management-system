import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

export async function GET(req: NextRequest) {
  return withAuth(async (session) => {
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status")?.trim() ?? "";
    const equipmentId = sp.get("equipmentId")?.trim() ?? "";

    const where: Prisma.CheckoutWhereInput = {
      organizationId: session.orgId,
      ...(status ? { status } : {}),
      ...(equipmentId ? { equipmentId } : {}),
    };

    const checkouts = await db.checkout.findMany({
      where,
      include: {
        equipment: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { checkedOutAt: "desc" },
    });
    return ok(checkouts);
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async (session) => {
    const b = await body<{
      equipmentId?: string;
      userId?: string;
      dueAt?: string;
      conditionOut?: string;
      notes?: string;
    }>(req);

    if (!b.equipmentId || !b.dueAt) return fail("Equipment and dueAt are required");

    const dueAt = new Date(b.dueAt);
    if (Number.isNaN(dueAt.getTime())) return fail("Invalid dueAt date", 400);

    const equipment = await db.equipment.findFirst({
      where: { id: b.equipmentId, organizationId: session.orgId },
    });
    if (!equipment) return fail("Equipment not found in your organization", 404);
    if (equipment.status !== "AVAILABLE") {
      return fail("Equipment is not available for checkout", 409);
    }

    const userId = b.userId ?? session.userId;
    const borrower = await db.user.findFirst({ where: { id: userId, organizationId: session.orgId } });
    if (!borrower) return fail("User not found in your organization", 404);

    const [checkout] = await db.$transaction([
      db.checkout.create({
        data: {
          organizationId: session.orgId,
          equipmentId: b.equipmentId,
          userId,
          dueAt,
          conditionOut: b.conditionOut ?? null,
          notes: b.notes ?? null,
          status: "ACTIVE",
        },
        include: {
          equipment: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, name: true } },
        },
      }),
      db.equipment.update({ where: { id: b.equipmentId }, data: { status: "IN_USE" } }),
    ]);

    await audit(session.orgId, session.userId, "CHECKOUT_CREATED", "Checkout", checkout.id, {
      equipment: equipment.name,
      dueAt: dueAt.toISOString(),
    });
    return ok(checkout, 201);
  });
}
