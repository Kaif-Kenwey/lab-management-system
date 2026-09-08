import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody, optionalId, optionalDateString } from "@/lib/validation";
import { PO_STATUS } from "@/lib/constants";
import { NotFoundError } from "@/lib/errors";

const orderInclude = {
  vendor: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  items: { include: { inventoryItem: { select: { id: true, name: true, sku: true } } } },
  _count: { select: { goodsReceipts: true } },
} satisfies Prisma.PurchaseOrderInclude;

export const orderItemSchema = z.object({
  name: z.string().trim().min(1, "Each item requires a name").max(200),
  quantity: z.coerce.number().int("Quantity must be a whole number").positive("Quantity must be greater than 0"),
  unitCost: z.coerce.number().min(0, "Unit cost must be zero or greater"),
  inventoryItemId: z.string().max(64).nullish(),
});

export const createOrderSchema = z.object({
  vendorId: optionalId,
  purchaseRequestId: optionalId,
  expectedAt: optionalDateString,
  notes: z.string().max(1000).nullish(),
  items: z.array(orderItemSchema).min(1, "items must contain at least one entry"),
});

/** Unique per org: PO-0001 style, auto-incrementing with collision guard */
async function nextPoNumber(tx: Prisma.TransactionClient, organizationId: string): Promise<string> {
  const count = await tx.purchaseOrder.count({ where: { organizationId } });
  for (let n = count + 1; n < count + 100; n++) {
    const candidate = `PO-${String(n).padStart(4, "0")}`;
    const existing = await tx.purchaseOrder.findFirst({
      where: { organizationId, poNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `PO-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const status = ctx.searchParams.get("status")?.trim() ?? "";
    const q = ctx.searchParams.get("q")?.trim() ?? "";

    const orders = await db.purchaseOrder.findMany({
      where: {
        organizationId: ctx.session.orgId,
        ...(status && (PO_STATUS as readonly string[]).includes(status) ? { status } : {}),
        ...(q ? { OR: [{ poNumber: { contains: q } }, { notes: { contains: q } }] } : {}),
      },
      include: orderInclude,
      orderBy: { createdAt: "desc" },
    });

    return ok(
      orders.map((order) => {
        const totalQty = order.items.reduce((sum, i) => sum + i.quantity, 0);
        const receivedQty = order.items.reduce((sum, i) => sum + i.receivedQuantity, 0);
        return { ...order, receivedRatio: totalQty > 0 ? receivedQty / totalQty : 0 };
      })
    );
  }, "procurement.read");
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, createOrderSchema);
    const orgId = ctx.session.orgId;

    if (data.vendorId) {
      const vendor = await db.vendor.findFirst({
        where: { id: data.vendorId, organizationId: orgId },
        select: { id: true },
      });
      if (!vendor) throw NotFoundError("Vendor not found in your organization");
    }
    if (data.purchaseRequestId) {
      const request = await db.purchaseRequest.findFirst({
        where: { id: data.purchaseRequestId, organizationId: orgId },
        select: { id: true },
      });
      if (!request) throw NotFoundError("Purchase request not found in your organization");
    }
    const inventoryIds = data.items.map((i) => i.inventoryItemId).filter((v): v is string => Boolean(v));
    if (inventoryIds.length > 0) {
      const found = await db.inventoryItem.findMany({
        where: { id: { in: inventoryIds }, organizationId: orgId },
        select: { id: true },
      });
      if (found.length !== new Set(inventoryIds).size) {
        throw NotFoundError("One or more inventory items not found in your organization");
      }
    }

    const totalCost = data.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);

    const order = await db.$transaction(async (tx) => {
      const poNumber = await nextPoNumber(tx, orgId);
      const created = await tx.purchaseOrder.create({
        data: {
          organizationId: orgId,
          poNumber,
          vendorId: data.vendorId ?? null,
          purchaseRequestId: data.purchaseRequestId ?? null,
          createdById: ctx.session.userId,
          status: "DRAFT",
          expectedAt: data.expectedAt ?? null,
          notes: data.notes ?? null,
          totalCost,
        },
      });
      await tx.purchaseOrderItem.createMany({
        data: data.items.map((i) => ({
          organizationId: orgId,
          orderId: created.id,
          inventoryItemId: i.inventoryItemId ?? null,
          name: i.name,
          quantity: i.quantity,
          unitCost: i.unitCost,
        })),
      });
      return created;
    });

    const full = await db.purchaseOrder.findUnique({ where: { id: order.id }, include: orderInclude });
    await audit(ctx.session.orgId, ctx.session.userId, "ORDER_CREATED", "PurchaseOrder", order.id, {
      poNumber: order.poNumber,
      totalCost,
      itemCount: data.items.length,
    });
    return ok(full, 201);
  }, "procurement.create");
}
