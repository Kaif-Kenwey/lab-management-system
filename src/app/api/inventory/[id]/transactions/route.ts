import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { parseBody } from "@/lib/validation";
import { recordStockMovement } from "@/lib/ledger";
import { INVENTORY_TX_TYPES } from "@/lib/constants";

const txSchema = z.object({
  type: z.enum(INVENTORY_TX_TYPES),
  quantity: z.coerce.number().int().refine((q) => q !== 0, "Quantity cannot be zero"),
  reason: z.string().trim().max(500).optional().nullable(),
  transferToLabId: z.string().min(1).optional().nullable(),
});

/**
 * GET /api/inventory/[id]/transactions — the item's ledger history
 * (newest first). Cross-tenant ids yield 404, never a leak.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const item = await db.inventoryItem.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true },
    });
    if (!item) throw NotFoundError("Inventory item not found");

    const transactions = await db.inventoryTransaction.findMany({
      where: { organizationId: ctx.session.orgId, itemId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        performedBy: { select: { id: true, name: true } },
        transferToLab: { select: { id: true, name: true, code: true } },
      },
    });
    return ok(transactions);
  }, "inventory.read");
}

/**
 * POST /api/inventory/[id]/transactions — ledger move (RECEIPT / ISSUE /
 * RETURN / TRANSFER / ADJUSTMENT / DAMAGE / EXPIRY). Stock levels change
 * ONLY through this endpoint (and the item-creation RECEIPT).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, txSchema);

    const item = await db.inventoryItem.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true, name: true, sku: true },
    });
    if (!item) throw NotFoundError("Inventory item not found");

    const transaction = await recordStockMovement({
      organizationId: ctx.session.orgId,
      itemId: id,
      type: data.type,
      quantity: data.quantity,
      reason: data.reason ?? null,
      transferToLabId: data.transferToLabId ?? null,
      performedById: ctx.session.userId,
    });

    await audit(ctx.session.orgId, ctx.session.userId, "INVENTORY_TX", "InventoryItem", id, {
      type: data.type,
      quantity: data.quantity,
      previousBalance: transaction.previousBalance,
      newBalance: transaction.newBalance,
      reason: data.reason ?? null,
    });

    return ok(
      {
        ...transaction,
        item: { id: item.id, name: item.name, sku: item.sku },
      },
      201
    );
  }, "inventory.adjust");
}
