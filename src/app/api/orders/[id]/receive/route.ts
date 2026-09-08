import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody } from "@/lib/validation";
import { applyInventoryTransaction } from "@/lib/ledger";
import { notify } from "@/lib/notify";
import { NotFoundError, ConflictError } from "@/lib/errors";

const RECEIPT_CONDITIONS = ["EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"] as const;

const receiveSchema = z.object({
  invoiceNumber: z.string().trim().max(120).nullish(),
  notes: z.string().max(1000).nullish(),
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1, "orderItemId is required"),
        quantity: z.coerce.number().int("Quantity must be a whole number").positive("Quantity must be greater than 0"),
        condition: z.enum(RECEIPT_CONDITIONS).optional().default("GOOD"),
        notes: z.string().max(500).nullish(),
      })
    )
    .min(1, "items must contain at least one entry"),
});

// Goods receipt: increments received quantities, writes ledger stock-in for
// linked inventory items, creates a GoodsReceipt and recomputes the PO status.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, receiveSchema);
    const orgId = ctx.session.orgId;

    const order = await db.purchaseOrder.findFirst({
      where: { id, organizationId: orgId },
      include: {
        items: true,
        purchaseRequest: { select: { id: true, requestedById: true } },
      },
    });
    if (!order) throw NotFoundError("Purchase order not found");

    if (order.status !== "ORDERED" && order.status !== "PARTIALLY_RECEIVED") {
      throw ConflictError(`Order cannot be received while ${order.status} — only ORDERED or PARTIALLY_RECEIVED`);
    }

    // Pre-validate every line against the remaining open quantity
    const itemsById = new Map(order.items.map((i) => [i.id, i]));
    for (const line of data.items) {
      const orderItem = itemsById.get(line.orderItemId);
      if (!orderItem) throw NotFoundError(`Order item ${line.orderItemId} not found on this order`);
      const remaining = orderItem.quantity - orderItem.receivedQuantity;
      if (line.quantity > remaining) {
        throw ConflictError(
          `Cannot receive ${line.quantity} of ${orderItem.name} — only ${remaining} remaining`
        );
      }
    }

    const receiptId = await db.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.create({
        data: {
          organizationId: orgId,
          orderId: id,
          receivedById: ctx.session.userId,
          invoiceNumber: data.invoiceNumber ?? null,
          notes: data.notes ?? null,
        },
      });

      for (const line of data.items) {
        const orderItem = itemsById.get(line.orderItemId)!;

        await tx.purchaseOrderItem.update({
          where: { id: orderItem.id },
          data: { receivedQuantity: { increment: line.quantity } },
        });

        await tx.goodsReceiptItem.create({
          data: {
            organizationId: orgId,
            receiptId: receipt.id,
            orderItemId: orderItem.id,
            quantity: line.quantity,
            condition: line.condition,
            notes: line.notes ?? null,
          },
        });

        // Stock-in through the ledger for items linked to inventory
        if (orderItem.inventoryItemId) {
          await applyInventoryTransaction(tx, {
            organizationId: orgId,
            itemId: orderItem.inventoryItemId,
            type: "RECEIPT",
            quantity: line.quantity,
            reason: `Goods receipt ${order.poNumber}`,
            referenceType: "GoodsReceipt",
            referenceId: receipt.id,
            performedById: ctx.session.userId,
          });
        }
      }

      // Recompute PO status from the fresh line quantities
      const freshItems = await tx.purchaseOrderItem.findMany({
        where: { orderId: id },
        select: { quantity: true, receivedQuantity: true },
      });
      const allReceived = freshItems.every((i) => i.receivedQuantity >= i.quantity);
      const someReceived = freshItems.some((i) => i.receivedQuantity > 0);
      const newStatus = allReceived ? "RECEIVED" : someReceived ? "PARTIALLY_RECEIVED" : order.status;

      await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: newStatus,
          ...(allReceived ? { receivedAt: new Date() } : {}),
        },
      });

      // Linked purchase request is RECEIVED once the whole PO is received
      if (order.purchaseRequestId && newStatus === "RECEIVED") {
        await tx.purchaseRequest.updateMany({
          where: { id: order.purchaseRequestId, organizationId: orgId },
          data: { status: "RECEIVED" },
        });
      }

      return receipt.id;
    });

    const receipt = await db.goodsReceipt.findUnique({
      where: { id: receiptId },
      include: {
        items: true,
        receivedBy: { select: { id: true, name: true } },
        order: { select: { id: true, poNumber: true, status: true } },
      },
    });

    await audit(ctx.session.orgId, ctx.session.userId, "ORDER_RECEIVED", "PurchaseOrder", id, {
      poNumber: order.poNumber,
      receiptId,
      lines: data.items.length,
    });

    // Notify the requester (best-effort, outside the transaction)
    const requesterId = order.purchaseRequest?.requestedById;
    if (requesterId) {
      await notify(db, {
        organizationId: orgId,
        userId: requesterId,
        title: "Goods received",
        body: `Items for ${order.poNumber} were received and checked in.`,
        type: "SUCCESS",
        entityType: "PurchaseOrder",
        entityId: id,
      });
    }

    return ok(receipt, 201);
  }, "procurement.receive");
}
