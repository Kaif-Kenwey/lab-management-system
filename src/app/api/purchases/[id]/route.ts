import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody, optionalId } from "@/lib/validation";
import { PURCHASE_STATUS } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { NotFoundError, ForbiddenError } from "@/lib/errors";

const requestInclude = {
  vendor: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.PurchaseRequestInclude;

const updatePurchaseSchema = z.object({
  status: z.enum(PURCHASE_STATUS).optional(),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").optional(),
  estimatedCost: z.coerce.number().min(0, "Estimated cost must be non-negative").optional(),
  justification: z.string().max(1000).nullish(),
  vendorId: optionalId,
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, updatePurchaseSchema);

    // Permission depends on the transition being performed
    if (data.status === "APPROVED" || data.status === "REJECTED") {
      if (!can(ctx.session.role, "procurement.approve")) {
        throw ForbiddenError("Forbidden — requires permission: procurement.approve");
      }
    } else if (data.status === "ORDERED" || data.status === "RECEIVED") {
      if (!can(ctx.session.role, "procurement.receive")) {
        throw ForbiddenError("Forbidden — requires permission: procurement.receive");
      }
    } else if (!can(ctx.session.role, "procurement.create")) {
      throw ForbiddenError("Forbidden — requires permission: procurement.create");
    }

    const request = await db.purchaseRequest.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true, itemName: true },
    });
    if (!request) throw NotFoundError("Purchase request not found");

    if (data.vendorId) {
      const vendor = await db.vendor.findFirst({
        where: { id: data.vendorId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!vendor) throw NotFoundError("Vendor not found in your organization");
    }

    const updated = await db.purchaseRequest.update({
      where: { id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
        ...(data.estimatedCost !== undefined ? { estimatedCost: data.estimatedCost } : {}),
        ...(data.justification !== undefined ? { justification: data.justification ?? null } : {}),
        ...(data.vendorId !== undefined ? { vendorId: data.vendorId ?? null } : {}),
      },
      include: requestInclude,
    });
    await audit(ctx.session.orgId, ctx.session.userId, "PURCHASE_UPDATED", "PurchaseRequest", id, {
      status: updated.status,
      itemName: updated.itemName,
    });
    return ok(updated);
  });
}
