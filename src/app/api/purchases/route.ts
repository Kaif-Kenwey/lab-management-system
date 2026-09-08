import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

export async function GET(req: NextRequest) {
  return withAuth(async (session) => {
    const status = req.nextUrl.searchParams.get("status")?.trim() ?? "";

    const requests = await db.purchaseRequest.findMany({
      where: {
        organizationId: session.orgId,
        ...(status ? { status } : {}),
      },
      include: {
        vendor: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return ok(requests);
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async (session) => {
    const b = await body<{
      itemName?: string;
      quantity?: number | string;
      estimatedCost?: number | string;
      vendorId?: string;
      justification?: string;
    }>(req);

    if (!b.itemName?.trim()) return fail("Item name is required");

    if (b.vendorId) {
      const vendor = await db.vendor.findFirst({
        where: { id: b.vendorId, organizationId: session.orgId },
      });
      if (!vendor) return fail("Vendor not found in your organization", 404);
    }

    let quantity = 1;
    if (b.quantity !== undefined && b.quantity !== null && b.quantity !== "") {
      quantity = Number(b.quantity);
      if (Number.isNaN(quantity) || quantity < 1) return fail("Quantity must be at least 1");
      quantity = Math.trunc(quantity);
    }

    let estimatedCost = 0;
    if (b.estimatedCost !== undefined && b.estimatedCost !== null && b.estimatedCost !== "") {
      estimatedCost = Number(b.estimatedCost);
      if (Number.isNaN(estimatedCost) || estimatedCost < 0) {
        return fail("Estimated cost must be a non-negative number");
      }
    }

    const request = await db.purchaseRequest.create({
      data: {
        organizationId: session.orgId,
        itemName: b.itemName.trim(),
        quantity,
        estimatedCost,
        vendorId: b.vendorId ?? null,
        justification: b.justification ?? null,
        status: "SUBMITTED",
        requestedById: session.userId,
      },
      include: {
        vendor: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
      },
    });
    await audit(session.orgId, session.userId, "PURCHASE_CREATED", "PurchaseRequest", request.id, {
      itemName: request.itemName,
      quantity: request.quantity,
    });
    return ok(request, 201);
  });
}
