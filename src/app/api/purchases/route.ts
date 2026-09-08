import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody, optionalId } from "@/lib/validation";
import { PURCHASE_STATUS } from "@/lib/constants";
import { NotFoundError } from "@/lib/errors";

const requestInclude = {
  vendor: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.PurchaseRequestInclude;

export const createPurchaseSchema = z.object({
  itemName: z.string().trim().min(1, "Item name is required").max(200),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").optional().default(1),
  estimatedCost: z.coerce.number().min(0, "Estimated cost must be non-negative").optional().default(0),
  vendorId: optionalId,
  justification: z.string().max(1000).nullish(),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const status = ctx.searchParams.get("status")?.trim() ?? "";
    const q = ctx.searchParams.get("q")?.trim() ?? "";

    const requests = await db.purchaseRequest.findMany({
      where: {
        organizationId: ctx.session.orgId,
        ...(status && (PURCHASE_STATUS as readonly string[]).includes(status) ? { status } : {}),
        ...(q ? { OR: [{ itemName: { contains: q } }, { justification: { contains: q } }] } : {}),
      },
      include: requestInclude,
      orderBy: { createdAt: "desc" },
    });
    return ok(requests);
  }, "procurement.read");
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, createPurchaseSchema);

    if (data.vendorId) {
      const vendor = await db.vendor.findFirst({
        where: { id: data.vendorId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!vendor) throw NotFoundError("Vendor not found in your organization");
    }

    const request = await db.purchaseRequest.create({
      data: {
        organizationId: ctx.session.orgId,
        itemName: data.itemName,
        quantity: data.quantity,
        estimatedCost: data.estimatedCost,
        vendorId: data.vendorId ?? null,
        justification: data.justification ?? null,
        status: "SUBMITTED",
        requestedById: ctx.session.userId,
      },
      include: requestInclude,
    });
    await audit(ctx.session.orgId, ctx.session.userId, "PURCHASE_CREATED", "PurchaseRequest", request.id, {
      itemName: request.itemName,
      quantity: request.quantity,
    });
    return ok(request, 201);
  }, "procurement.create");
}
