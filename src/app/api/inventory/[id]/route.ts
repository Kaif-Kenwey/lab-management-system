import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { NotFoundError, ConflictError, ValidationError } from "@/lib/errors";
import { parseBody, mapPrismaError } from "@/lib/validation";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  sku: z.string().trim().min(1).max(60).optional(),
  labId: z.string().min(1).optional(),
  category: z.enum(["CONSUMABLE", "SPARE", "STATIONERY", "SAFETY"]).optional(),
  unit: z.string().trim().max(30).optional(),
  minQuantity: z.coerce.number().int().min(0).optional(),
  location: z.string().trim().max(200).optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    // Stock levels are LEDGER-ONLY — reject direct quantity edits.
    const raw = (await req.clone().json().catch(() => ({}))) as Record<string, unknown>;
    if ("quantity" in raw) {
      throw ValidationError("Stock changes must go through inventory transactions");
    }

    const data = await parseBody(req, updateSchema);

    const item = await db.inventoryItem.findFirst({
      where: { id, organizationId: ctx.session.orgId },
    });
    if (!item) throw NotFoundError("Inventory item not found");

    if (data.labId && data.labId !== item.labId) {
      const lab = await db.lab.findFirst({
        where: { id: data.labId, organizationId: ctx.session.orgId },
      });
      if (!lab) throw NotFoundError("Lab not found in your organization");
    }

    try {
      const updated = await db.inventoryItem.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.sku !== undefined ? { sku: data.sku } : {}),
          ...(data.labId !== undefined ? { labId: data.labId } : {}),
          ...(data.category !== undefined ? { category: data.category } : {}),
          ...(data.unit !== undefined ? { unit: data.unit } : {}),
          ...(data.minQuantity !== undefined ? { minQuantity: data.minQuantity } : {}),
          ...(data.location !== undefined ? { location: data.location } : {}),
        },
        include: { lab: { select: { id: true, name: true, code: true } } },
      });
      await audit(ctx.session.orgId, ctx.session.userId, "INVENTORY_UPDATED", "InventoryItem", id, {
        name: updated.name,
        sku: updated.sku,
      });
      return ok(updated);
    } catch (e) {
      mapPrismaError(e, "An inventory item with this SKU already exists in your organization");
    }
  }, "inventory.adjust");
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(_req, async (ctx) => {
    const item = await db.inventoryItem.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      include: { _count: { select: { transactions: true } } },
    });
    if (!item) throw NotFoundError("Inventory item not found");

    if (item._count.transactions > 0) {
      throw ConflictError("Item has ledger history; retire via stock write-off instead");
    }

    await db.inventoryItem.delete({ where: { id } });
    await audit(ctx.session.orgId, ctx.session.userId, "INVENTORY_DELETED", "InventoryItem", id, {
      name: item.name,
      sku: item.sku,
    });
    return ok({ success: true });
  }, "labs.manage");
}
