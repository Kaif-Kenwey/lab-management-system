import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, withAuth } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";

/**
 * GET /api/inventory/transactions?itemId=&type=&page=&pageSize=
 * Org-wide ledger view (newest first) with item, performer and transfer target.
 * A cross-tenant itemId yields 404 — never leak another organization's data.
 */
export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const sp = ctx.searchParams;
    const itemId = sp.get("itemId")?.trim() ?? "";
    const type = sp.get("type")?.trim() ?? "";
    const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
    const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize") ?? "50") || 50));

    // Tenant-isolation: an itemId that exists but belongs to another org must
    // be indistinguishable from a missing one.
    if (itemId) {
      const item = await db.inventoryItem.findFirst({
        where: { id: itemId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!item) throw NotFoundError("Inventory item not found");
    }

    const where: Prisma.InventoryTransactionWhereInput = {
      organizationId: ctx.session.orgId,
      ...(itemId ? { itemId } : {}),
      ...(type ? { type } : {}),
    };

    const [total, rows] = await Promise.all([
      db.inventoryTransaction.count({ where }),
      db.inventoryTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          item: { select: { id: true, name: true, sku: true, unit: true } },
          performedBy: { select: { id: true, name: true } },
          transferToLab: { select: { id: true, name: true, code: true } },
        },
      }),
    ]);

    return ok({ items: rows, page, pageSize, total });
  }, "inventory.read");
}
