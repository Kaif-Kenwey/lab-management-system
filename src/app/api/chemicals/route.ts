import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

export async function GET(req: NextRequest) {
  return withAuth(async (session) => {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const hazardClass = req.nextUrl.searchParams.get("hazardClass")?.trim() ?? "";

    const chemicals = await db.chemical.findMany({
      where: {
        organizationId: session.orgId,
        ...(hazardClass ? { hazardClass } : {}),
        ...(q ? { OR: [{ name: { contains: q } }, { casNumber: { contains: q } }] } : {}),
      },
      include: { lab: { select: { id: true, name: true, code: true } } },
      orderBy: { name: "asc" },
    });
    return ok(chemicals);
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async (session) => {
    const b = await body<{
      name?: string;
      labId?: string;
      casNumber?: string;
      quantity?: number | string;
      unit?: string;
      hazardClass?: string;
      expiryDate?: string | null;
      storageLocation?: string;
    }>(req);

    if (!b.name?.trim() || !b.labId) return fail("Name and lab are required");

    const lab = await db.lab.findFirst({ where: { id: b.labId, organizationId: session.orgId } });
    if (!lab) return fail("Lab not found in your organization", 404);

    const quantity =
      b.quantity === undefined || b.quantity === null || b.quantity === ""
        ? 0
        : Number(b.quantity);
    if (Number.isNaN(quantity) || quantity < 0) return fail("Quantity must be a non-negative number");

    let expiryDate: Date | null = null;
    if (b.expiryDate) {
      expiryDate = new Date(b.expiryDate);
      if (Number.isNaN(expiryDate.getTime())) return fail("Invalid expiryDate", 400);
    }

    const chemical = await db.chemical.create({
      data: {
        organizationId: session.orgId,
        labId: b.labId,
        name: b.name.trim(),
        casNumber: b.casNumber ?? null,
        quantity,
        unit: b.unit ?? "mL",
        hazardClass: b.hazardClass ?? "LOW",
        expiryDate,
        storageLocation: b.storageLocation ?? null,
      },
      include: { lab: { select: { id: true, name: true, code: true } } },
    });
    await audit(session.orgId, session.userId, "CHEMICAL_CREATED", "Chemical", chemical.id, {
      name: chemical.name,
      hazardClass: chemical.hazardClass,
    });
    return ok(chemical, 201);
  });
}
