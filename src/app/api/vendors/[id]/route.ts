import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const b = await body<{
      name?: string;
      contactEmail?: string | null;
      phone?: string | null;
      address?: string | null;
      category?: string;
      rating?: number | string;
    }>(req);

    const vendor = await db.vendor.findFirst({ where: { id, organizationId: session.orgId } });
    if (!vendor) return fail("Vendor not found", 404);

    const data: Prisma.VendorUncheckedUpdateInput = {};
    if (b.name !== undefined) data.name = b.name.trim();
    if (b.contactEmail !== undefined) data.contactEmail = b.contactEmail;
    if (b.phone !== undefined) data.phone = b.phone;
    if (b.address !== undefined) data.address = b.address;
    if (b.category !== undefined) data.category = b.category;
    if (b.rating !== undefined) {
      const rating = Number(b.rating);
      if (Number.isNaN(rating) || rating < 0 || rating > 5) {
        return fail("Rating must be a number between 0 and 5");
      }
      data.rating = rating;
    }

    const updated = await db.vendor.update({ where: { id }, data });
    await audit(session.orgId, session.userId, "VENDOR_UPDATED", "Vendor", id, {
      name: updated.name,
    });
    return ok(updated);
  }, ["ADMIN", "LAB_MANAGER"]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const vendor = await db.vendor.findFirst({ where: { id, organizationId: session.orgId } });
    if (!vendor) return fail("Vendor not found", 404);

    try {
      await db.vendor.delete({ where: { id } });
      await audit(session.orgId, session.userId, "VENDOR_DELETED", "Vendor", id, {
        name: vendor.name,
      });
      return ok({ success: true });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        return fail("This vendor has purchase requests and cannot be deleted", 409);
      }
      throw e;
    }
  }, ["ADMIN"]);
}
