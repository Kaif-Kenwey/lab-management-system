import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody } from "@/lib/validation";
import { VENDOR_CATEGORY } from "@/lib/constants";
import { NotFoundError, ConflictError, ForbiddenError } from "@/lib/errors";

const updateVendorSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  contactEmail: z.string().trim().email("A valid contact email is required").nullish(),
  phone: z.string().trim().max(40).nullish(),
  address: z.string().trim().max(300).nullish(),
  category: z.enum(VENDOR_CATEGORY).optional(),
  rating: z.coerce.number().min(0, "Rating must be between 0 and 5").max(5, "Rating must be between 0 and 5").optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, updateVendorSchema);

    const vendor = await db.vendor.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true, name: true },
    });
    if (!vendor) throw NotFoundError("Vendor not found");

    const updated = await db.vendor.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.contactEmail !== undefined ? { contactEmail: data.contactEmail ?? null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone ?? null } : {}),
        ...(data.address !== undefined ? { address: data.address ?? null } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.rating !== undefined ? { rating: data.rating } : {}),
      },
    });
    await audit(ctx.session.orgId, ctx.session.userId, "VENDOR_UPDATED", "Vendor", id, {
      name: updated.name,
    });
    return ok(updated);
  }, "procurement.approve");
}

// Vendor deletion is an ADMIN-only action (checked by role, not permission)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    if (ctx.session.role !== "ADMIN") {
      throw ForbiddenError("Forbidden — vendor deletion requires an administrator");
    }

    const vendor = await db.vendor.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: {
        id: true,
        name: true,
        _count: { select: { purchaseRequests: true, purchaseOrders: true } },
      },
    });
    if (!vendor) throw NotFoundError("Vendor not found");

    if (vendor._count.purchaseRequests > 0 || vendor._count.purchaseOrders > 0) {
      throw ConflictError("Vendor has purchase requests or orders and cannot be deleted");
    }

    await db.vendor.delete({ where: { id } });
    await audit(ctx.session.orgId, ctx.session.userId, "VENDOR_DELETED", "Vendor", id, {
      name: vendor.name,
    });
    return ok({ success: true });
  });
}
