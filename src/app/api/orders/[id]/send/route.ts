import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { notify } from "@/lib/notify";
import { NotFoundError, ConflictError } from "@/lib/errors";

// Send a DRAFT purchase order to the vendor → ORDERED
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const order = await db.purchaseOrder.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      include: {
        vendor: { select: { name: true } },
        purchaseRequest: { select: { id: true, itemName: true, requestedById: true } },
      },
    });
    if (!order) throw NotFoundError("Purchase order not found");

    if (order.status !== "DRAFT") {
      throw ConflictError(`Only DRAFT purchase orders can be sent — current status: ${order.status}`);
    }

    const updated = await db.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.update({
        where: { id },
        data: { status: "ORDERED", orderedAt: new Date() },
        include: {
          vendor: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          items: true,
          _count: { select: { goodsReceipts: true } },
        },
      });

      // Linked purchase request moves to ORDERED too
      if (order.purchaseRequestId) {
        await tx.purchaseRequest.updateMany({
          where: { id: order.purchaseRequestId, organizationId: ctx.session.orgId },
          data: { status: "ORDERED" },
        });
      }

      // Notify the requester (best-effort inside tx)
      const requesterId = order.purchaseRequest?.requestedById ?? order.createdById;
      if (requesterId) {
        await notify(tx, {
          organizationId: ctx.session.orgId,
          userId: requesterId,
          title: "Purchase order sent",
          body: `${po.poNumber} was sent to ${order.vendor?.name ?? "the vendor"}.`,
          type: "INFO",
          entityType: "PurchaseOrder",
          entityId: po.id,
        });
      }

      return po;
    });

    await audit(ctx.session.orgId, ctx.session.userId, "ORDER_SENT", "PurchaseOrder", id, {
      poNumber: updated.poNumber,
      vendor: order.vendor?.name ?? null,
    });
    return ok(updated);
  }, "procurement.approve");
}
