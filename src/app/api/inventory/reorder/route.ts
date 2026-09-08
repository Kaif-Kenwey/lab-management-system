import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, withAuth } from "@/lib/api";

/**
 * GET /api/inventory/reorder — items at or below their reorder level with a
 * suggested order quantity: max(minQuantity*2 - quantity, minQuantity).
 */
export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const items = await db.inventoryItem.findMany({
      where: { organizationId: ctx.session.orgId },
      include: { lab: { select: { id: true, name: true, code: true } } },
      orderBy: [{ quantity: "asc" }, { name: "asc" }],
    });

    const lowStock = items.filter((i) => i.quantity <= i.minQuantity);
    const suggestions = lowStock.map((i) => ({
      id: i.id,
      name: i.name,
      sku: i.sku,
      category: i.category,
      unit: i.unit,
      quantity: i.quantity,
      minQuantity: i.minQuantity,
      lab: i.lab,
      suggestedOrderQty: Math.max(i.minQuantity * 2 - i.quantity, i.minQuantity),
    }));

    const byLab = new Map<string, { labId: string; labName: string; labCode: string; count: number; suggestedQty: number }>();
    for (const s of suggestions) {
      const entry = byLab.get(s.lab.id) ?? {
        labId: s.lab.id,
        labName: s.lab.name,
        labCode: s.lab.code,
        count: 0,
        suggestedQty: 0,
      };
      entry.count += 1;
      entry.suggestedQty += s.suggestedOrderQty;
      byLab.set(s.lab.id, entry);
    }

    return ok({
      items: suggestions,
      stats: {
        totalLowStock: suggestions.length,
        totalSuggestedQty: suggestions.reduce((sum, s) => sum + s.suggestedOrderQty, 0),
        byLab: [...byLab.values()].sort((a, b) => b.count - a.count),
      },
    });
  }, "inventory.read");
}
