import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const b = await body<{ checkedIn?: boolean; conditionIn?: string }>(req);
    if (!b.checkedIn) return fail("checkedIn must be true to check in this equipment", 400);

    const checkout = await db.checkout.findFirst({
      where: { id, organizationId: session.orgId },
    });
    if (!checkout) return fail("Checkout not found", 404);

    const now = new Date();
    const [updated] = await db.$transaction([
      db.checkout.update({
        where: { id },
        data: {
          checkedInAt: now,
          status: "RETURNED",
          conditionIn: b.conditionIn ?? null,
        },
        include: {
          equipment: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, name: true } },
        },
      }),
      db.equipment.update({ where: { id: checkout.equipmentId }, data: { status: "AVAILABLE" } }),
    ]);

    await audit(session.orgId, session.userId, "CHECKOUT_RETURNED", "Checkout", id, {
      equipment: updated.equipment.name,
    });
    return ok(updated);
  });
}
