import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const b = await body<{
      name?: string;
      sku?: string;
      labId?: string;
      category?: string;
      quantity?: number | string;
      unit?: string;
      minQuantity?: number | string;
      location?: string | null;
    }>(req);

    const item = await db.inventoryItem.findFirst({ where: { id, organizationId: session.orgId } });
    if (!item) return fail("Inventory item not found", 404);

    if (b.labId) {
      const lab = await db.lab.findFirst({ where: { id: b.labId, organizationId: session.orgId } });
      if (!lab) return fail("Lab not found in your organization", 404);
    }

    const data: Prisma.InventoryItemUncheckedUpdateInput = {};
    if (b.name !== undefined) data.name = b.name.trim();
    if (b.sku !== undefined) data.sku = b.sku.trim();
    if (b.labId !== undefined) data.labId = b.labId;
    if (b.category !== undefined) data.category = b.category;
    if (b.quantity !== undefined) {
      const quantity = Number(b.quantity);
      if (Number.isNaN(quantity) || quantity < 0) return fail("Quantity must be a non-negative number");
      data.quantity = Math.trunc(quantity);
    }
    if (b.unit !== undefined) data.unit = b.unit;
    if (b.minQuantity !== undefined) {
      const minQuantity = Number(b.minQuantity);
      if (Number.isNaN(minQuantity) || minQuantity < 0) {
        return fail("minQuantity must be a non-negative number");
      }
      data.minQuantity = Math.trunc(minQuantity);
    }
    if (b.location !== undefined) data.location = b.location;

    try {
      const updated = await db.inventoryItem.update({
        where: { id },
        data,
        include: { lab: { select: { id: true, name: true, code: true } } },
      });
      await audit(session.orgId, session.userId, "INVENTORY_UPDATED", "InventoryItem", id, {
        name: updated.name,
        quantity: updated.quantity,
      });
      return ok(updated);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return fail("An inventory item with this SKU already exists in your organization", 409);
      }
      throw e;
    }
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const item = await db.inventoryItem.findFirst({ where: { id, organizationId: session.orgId } });
    if (!item) return fail("Inventory item not found", 404);

    await db.inventoryItem.delete({ where: { id } });
    await audit(session.orgId, session.userId, "INVENTORY_DELETED", "InventoryItem", id, {
      name: item.name,
      sku: item.sku,
    });
    return ok({ success: true });
  });
}
