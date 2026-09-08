import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody, optionalId, optionalDateString } from "@/lib/validation";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { createOrderSchema } from "../route";

async function loadOrder(id: string, orgId: string) {
  const order = await db.purchaseOrder.findFirst({
    where: { id, organizationId: orgId },
    include: {
      vendor: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      purchaseRequest: { select: { id: true, itemName: true, status: true, requestedById: true } },
      items: { include: { inventoryItem: { select: { id: true, name: true, sku: true } } } },
      goodsReceipts: {
        include: {
          receivedBy: { select: { id: true, name: true } },
          items: true,
        },
        orderBy: { receivedAt: "desc" },
      },
      _count: { select: { goodsReceipts: true } },
    },
  });
  if (!order) throw NotFoundError("Purchase order not found");
  const totalQty = order.items.reduce((sum, i) => sum + i.quantity, 0);
  const receivedQty = order.items.reduce((sum, i) => sum + i.receivedQuantity, 0);
  return { ...order, receivedRatio: totalQty > 0 ? receivedQty / totalQty : 0 };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const order = await loadOrder(id, ctx.session.orgId);
    return ok(order);
  }, "procurement.read");
}

// Only DRAFT orders are editable; items are replaced wholesale
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, createOrderSchema.partial({ items: true }));

    const order = await db.purchaseOrder.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true, poNumber: true, status: true },
    });
    if (!order) throw NotFoundError("Purchase order not found");
    if (order.status !== "DRAFT") {
      throw ConflictError(`Only DRAFT purchase orders can be edited — current status: ${order.status}`);
    }

    if (data.vendorId) {
      const vendor = await db.vendor.findFirst({
        where: { id: data.vendorId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!vendor) throw NotFoundError("Vendor not found in your organization");
    }
    if (data.purchaseRequestId) {
      const request = await db.purchaseRequest.findFirst({
        where: { id: data.purchaseRequestId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!request) throw NotFoundError("Purchase request not found in your organization");
    }
    if (data.items) {
      const inventoryIds = data.items.map((i) => i.inventoryItemId).filter((v): v is string => Boolean(v));
      if (inventoryIds.length > 0) {
        const found = await db.inventoryItem.findMany({
          where: { id: { in: inventoryIds }, organizationId: ctx.session.orgId },
          select: { id: true },
        });
        if (found.length !== new Set(inventoryIds).size) {
          throw NotFoundError("One or more inventory items not found in your organization");
        }
      }
    }

    const totalCost = data.items ? data.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0) : undefined;

    await db.$transaction(async (tx) => {
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          ...(data.vendorId !== undefined ? { vendorId: data.vendorId ?? null } : {}),
          ...(data.purchaseRequestId !== undefined ? { purchaseRequestId: data.purchaseRequestId ?? null } : {}),
          ...(data.expectedAt !== undefined ? { expectedAt: data.expectedAt ?? null } : {}),
          ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
          ...(totalCost !== undefined ? { totalCost } : {}),
        },
      });
      if (data.items) {
        await tx.purchaseOrderItem.deleteMany({ where: { orderId: id } });
        await tx.purchaseOrderItem.createMany({
          data: data.items.map((i) => ({
            organizationId: ctx.session.orgId,
            orderId: id,
            inventoryItemId: i.inventoryItemId ?? null,
            name: i.name,
            quantity: i.quantity,
            unitCost: i.unitCost,
          })),
        });
      }
    });

    const full = await loadOrder(id, ctx.session.orgId);
    await audit(ctx.session.orgId, ctx.session.userId, "ORDER_UPDATED", "PurchaseOrder", id, {
      poNumber: order.poNumber,
      itemCount: full.items.length,
      totalCost: full.totalCost,
    });
    return ok(full);
  }, "procurement.create");
}

// Only DRAFT / CANCELLED orders may be deleted
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const order = await db.purchaseOrder.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true, poNumber: true, status: true },
    });
    if (!order) throw NotFoundError("Purchase order not found");

    if (order.status !== "DRAFT" && order.status !== "CANCELLED") {
      throw ConflictError(
        `Only DRAFT or CANCELLED purchase orders can be deleted — current status: ${order.status}`
      );
    }

    await db.purchaseOrder.delete({ where: { id } }); // items cascade
    await audit(ctx.session.orgId, ctx.session.userId, "ORDER_DELETED", "PurchaseOrder", id, {
      poNumber: order.poNumber,
    });
    return ok({ success: true });
  }, "procurement.approve");
}
