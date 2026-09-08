import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

export async function GET(req: NextRequest) {
  return withAuth(async (session) => {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

    const vendors = await db.vendor.findMany({
      where: {
        organizationId: session.orgId,
        ...(q
          ? { OR: [{ name: { contains: q } }, { contactEmail: { contains: q } }, { category: { contains: q } }] }
          : {}),
      },
      orderBy: { name: "asc" },
    });
    return ok(vendors);
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async (session) => {
    const b = await body<{
      name?: string;
      contactEmail?: string;
      phone?: string;
      address?: string;
      category?: string;
      rating?: number | string;
    }>(req);

    if (!b.name?.trim()) return fail("Vendor name is required");

    let rating = 4.0;
    if (b.rating !== undefined && b.rating !== null && b.rating !== "") {
      rating = Number(b.rating);
      if (Number.isNaN(rating) || rating < 0 || rating > 5) {
        return fail("Rating must be a number between 0 and 5");
      }
    }

    const vendor = await db.vendor.create({
      data: {
        organizationId: session.orgId,
        name: b.name.trim(),
        contactEmail: b.contactEmail ?? null,
        phone: b.phone ?? null,
        address: b.address ?? null,
        category: b.category ?? "EQUIPMENT",
        rating,
      },
    });
    await audit(session.orgId, session.userId, "VENDOR_CREATED", "Vendor", vendor.id, {
      name: vendor.name,
    });
    return ok(vendor, 201);
  }, ["ADMIN", "LAB_MANAGER"]);
}
