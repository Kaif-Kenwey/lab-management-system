import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody } from "@/lib/validation";
import { VENDOR_CATEGORY } from "@/lib/constants";

export const createVendorSchema = z.object({
  name: z.string().trim().min(1, "Vendor name is required").max(200),
  contactEmail: z.string().trim().email("A valid contact email is required").nullish(),
  phone: z.string().trim().max(40).nullish(),
  address: z.string().trim().max(300).nullish(),
  category: z.enum(VENDOR_CATEGORY).optional().default("EQUIPMENT"),
  rating: z.coerce.number().min(0, "Rating must be between 0 and 5").max(5, "Rating must be between 0 and 5").optional().default(4.0),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const q = ctx.searchParams.get("q")?.trim() ?? "";
    const vendors = await db.vendor.findMany({
      where: {
        organizationId: ctx.session.orgId,
        ...(q
          ? { OR: [{ name: { contains: q } }, { contactEmail: { contains: q } }, { category: { contains: q } }] }
          : {}),
      },
      include: { _count: { select: { purchaseRequests: true, purchaseOrders: true } } },
      orderBy: { name: "asc" },
    });
    return ok(vendors);
  }, "procurement.read");
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, createVendorSchema);

    const vendor = await db.vendor.create({
      data: {
        organizationId: ctx.session.orgId,
        name: data.name,
        contactEmail: data.contactEmail ?? null,
        phone: data.phone ?? null,
        address: data.address ?? null,
        category: data.category,
        rating: data.rating,
      },
    });
    await audit(ctx.session.orgId, ctx.session.userId, "VENDOR_CREATED", "Vendor", vendor.id, {
      name: vendor.name,
    });
    return ok(vendor, 201);
  }, "procurement.approve");
}
