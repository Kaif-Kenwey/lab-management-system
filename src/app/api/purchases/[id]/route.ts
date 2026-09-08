import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

const PURCHASE_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "ORDERED", "RECEIVED"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const b = await body<{
      status?: string;
      quantity?: number | string;
      estimatedCost?: number | string;
      justification?: string | null;
      vendorId?: string | null;
    }>(req);

    if (!b.status) return fail("status is required");
    if (!PURCHASE_STATUSES.includes(b.status)) {
      return fail(`Invalid status — must be one of: ${PURCHASE_STATUSES.join(", ")}`);
    }

    // Role rules: APPROVED/REJECTED (and other transitions) need ADMIN or LAB_MANAGER;
    // ORDERED/RECEIVED are additionally allowed for TECHNICIAN.
    const approver = session.role === "ADMIN" || session.role === "LAB_MANAGER";
    const fulfillment = b.status === "ORDERED" || b.status === "RECEIVED";
    const allowed = fulfillment ? approver || session.role === "TECHNICIAN" : approver;
    if (!allowed) {
      return fail(
        fulfillment
          ? "Forbidden — requires role: ADMIN, LAB_MANAGER or TECHNICIAN"
          : "Forbidden — requires role: ADMIN or LAB_MANAGER",
        403
      );
    }

    const request = await db.purchaseRequest.findFirst({
      where: { id, organizationId: session.orgId },
    });
    if (!request) return fail("Purchase request not found", 404);

    if (b.vendorId) {
      const vendor = await db.vendor.findFirst({
        where: { id: b.vendorId, organizationId: session.orgId },
      });
      if (!vendor) return fail("Vendor not found in your organization", 404);
    }

    const data: Prisma.PurchaseRequestUncheckedUpdateInput = { status: b.status };
    if (b.quantity !== undefined) {
      const quantity = Number(b.quantity);
      if (Number.isNaN(quantity) || quantity < 1) return fail("Quantity must be at least 1");
      data.quantity = Math.trunc(quantity);
    }
    if (b.estimatedCost !== undefined) {
      const estimatedCost = Number(b.estimatedCost);
      if (Number.isNaN(estimatedCost) || estimatedCost < 0) {
        return fail("Estimated cost must be a non-negative number");
      }
      data.estimatedCost = estimatedCost;
    }
    if (b.justification !== undefined) data.justification = b.justification;
    if (b.vendorId !== undefined) data.vendorId = b.vendorId;

    const updated = await db.purchaseRequest.update({
      where: { id },
      data,
      include: {
        vendor: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
      },
    });
    await audit(session.orgId, session.userId, "PURCHASE_UPDATED", "PurchaseRequest", id, {
      status: updated.status,
      itemName: updated.itemName,
    });
    return ok(updated);
  });
}
