import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

export async function GET(req: NextRequest) {
  return withAuth(async (session) => {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const lowStock = req.nextUrl.searchParams.get("lowStock") === "true";

    const items = await db.inventoryItem.findMany({
      where: {
        organizationId: session.orgId,
        ...(q ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }] } : {}),
      },
      include: { lab: { select: { id: true, name: true, code: true } } },
      orderBy: { name: "asc" },
    });

    const filtered = lowStock ? items.filter((i) => i.quantity <= i.minQuantity) : items;
    return ok(filtered);
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async (session) => {
    const b = await body<{
      name?: string;
      sku?: string;
      labId?: string;
      category?: string;
      quantity?: number | string;
      unit?: string;
      minQuantity?: number | string;
      location?: string;
    }>(req);

    if (!b.name?.trim() || !b.sku?.trim() || !b.labId) {
      return fail("Name, SKU and lab are required");
    }

    const lab = await db.lab.findFirst({ where: { id: b.labId, organizationId: session.orgId } });
    if (!lab) return fail("Lab not found in your organization", 404);

    const quantity =
      b.quantity === undefined || b.quantity === null || b.quantity === ""
        ? 0
        : Number(b.quantity);
    if (Number.isNaN(quantity) || quantity < 0) return fail("Quantity must be a non-negative number");

    const minQuantity =
      b.minQuantity === undefined || b.minQuantity === null || b.minQuantity === ""
        ? 5
        : Number(b.minQuantity);
    if (Number.isNaN(minQuantity) || minQuantity < 0) {
      return fail("minQuantity must be a non-negative number");
    }

    try {
      const item = await db.inventoryItem.create({
        data: {
          organizationId: session.orgId,
          labId: b.labId,
          name: b.name.trim(),
          sku: b.sku.trim(),
          category: b.category ?? "CONSUMABLE",
          quantity: Math.trunc(quantity),
          unit: b.unit ?? "pcs",
          minQuantity: Math.trunc(minQuantity),
          location: b.location ?? null,
        },
        include: { lab: { select: { id: true, name: true, code: true } } },
      });
      await audit(session.orgId, session.userId, "INVENTORY_CREATED", "InventoryItem", item.id, {
        name: item.name,
        sku: item.sku,
      });
      return ok(item, 201);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return fail("An inventory item with this SKU already exists in your organization", 409);
      }
      throw e;
    }
  });
}
