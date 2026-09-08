import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { parseBody, mapPrismaError } from "@/lib/validation";
import { applyInventoryTransaction } from "@/lib/ledger";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  sku: z.string().trim().min(1, "SKU is required").max(60),
  labId: z.string().min(1, "Lab is required"),
  category: z.enum(["CONSUMABLE", "SPARE", "STATIONERY", "SAFETY"]).optional(),
  /** Initial stock — recorded as the item's first RECEIPT ledger entry */
  quantity: z.coerce.number().int().min(0).optional(),
  initialQty: z.coerce.number().int().min(0).optional(),
  unit: z.string().trim().max(30).optional(),
  minQuantity: z.coerce.number().int().min(0).optional(),
  location: z.string().trim().max(200).optional().nullable(),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const sp = ctx.searchParams;
    const q = sp.get("q")?.trim() ?? "";
    const labId = sp.get("labId")?.trim() ?? "";
    const lowStock = sp.get("lowStock") === "true";

    const items = await db.inventoryItem.findMany({
      where: {
        organizationId: ctx.session.orgId,
        ...(labId ? { labId } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { sku: { contains: q } },
                { location: { contains: q } },
              ],
            }
          : {}),
      },
      include: {
        lab: { select: { id: true, name: true, code: true } },
        _count: { select: { transactions: true } },
      },
      orderBy: { name: "asc" },
    });

    const filtered = lowStock ? items.filter((i) => i.quantity <= i.minQuantity) : items;
    return ok(filtered);
  }, "inventory.read");
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, createSchema);

    const lab = await db.lab.findFirst({
      where: { id: data.labId, organizationId: ctx.session.orgId },
    });
    if (!lab) throw NotFoundError("Lab not found in your organization");

    const initialQty = Math.trunc(data.initialQty ?? data.quantity ?? 0);

    try {
      const item = await db.$transaction(async (tx) => {
        const created = await tx.inventoryItem.create({
          data: {
            organizationId: ctx.session.orgId,
            labId: data.labId,
            name: data.name,
            sku: data.sku,
            category: data.category ?? "CONSUMABLE",
            quantity: 0, // set via ledger RECEIPT below
            unit: data.unit ?? "pcs",
            minQuantity: data.minQuantity ?? 5,
            location: data.location ?? null,
          },
        });
        if (initialQty > 0) {
          await applyInventoryTransaction(tx, {
            organizationId: ctx.session.orgId,
            itemId: created.id,
            type: "RECEIPT",
            quantity: initialQty,
            reason: "Initial stock on item creation",
            performedById: ctx.session.userId,
          });
        }
        return tx.inventoryItem.findUniqueOrThrow({
          where: { id: created.id },
          include: {
            lab: { select: { id: true, name: true, code: true } },
            _count: { select: { transactions: true } },
          },
        });
      });

      await audit(ctx.session.orgId, ctx.session.userId, "INVENTORY_CREATED", "InventoryItem", item.id, {
        name: item.name,
        sku: item.sku,
        initialQty,
      });
      return ok(item, 201);
    } catch (e) {
      mapPrismaError(e, "An inventory item with this SKU already exists in your organization");
    }
  }, "inventory.adjust");
}
