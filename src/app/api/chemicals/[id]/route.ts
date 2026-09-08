import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const b = await body<{
      name?: string;
      labId?: string;
      casNumber?: string | null;
      quantity?: number | string;
      unit?: string;
      hazardClass?: string;
      expiryDate?: string | null;
      storageLocation?: string | null;
    }>(req);

    const chemical = await db.chemical.findFirst({ where: { id, organizationId: session.orgId } });
    if (!chemical) return fail("Chemical not found", 404);

    if (b.labId) {
      const lab = await db.lab.findFirst({ where: { id: b.labId, organizationId: session.orgId } });
      if (!lab) return fail("Lab not found in your organization", 404);
    }

    const data: Prisma.ChemicalUncheckedUpdateInput = {};
    if (b.name !== undefined) data.name = b.name.trim();
    if (b.labId !== undefined) data.labId = b.labId;
    if (b.casNumber !== undefined) data.casNumber = b.casNumber;
    if (b.quantity !== undefined) {
      const quantity = Number(b.quantity);
      if (Number.isNaN(quantity) || quantity < 0) return fail("Quantity must be a non-negative number");
      data.quantity = quantity;
    }
    if (b.unit !== undefined) data.unit = b.unit;
    if (b.hazardClass !== undefined) data.hazardClass = b.hazardClass;
    if (b.expiryDate !== undefined) {
      if (b.expiryDate === null) {
        data.expiryDate = null;
      } else {
        const d = new Date(b.expiryDate);
        if (Number.isNaN(d.getTime())) return fail("Invalid expiryDate", 400);
        data.expiryDate = d;
      }
    }
    if (b.storageLocation !== undefined) data.storageLocation = b.storageLocation;

    const updated = await db.chemical.update({
      where: { id },
      data,
      include: { lab: { select: { id: true, name: true, code: true } } },
    });
    await audit(session.orgId, session.userId, "CHEMICAL_UPDATED", "Chemical", id, {
      name: updated.name,
    });
    return ok(updated);
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const chemical = await db.chemical.findFirst({ where: { id, organizationId: session.orgId } });
    if (!chemical) return fail("Chemical not found", 404);

    await db.chemical.delete({ where: { id } });
    await audit(session.orgId, session.userId, "CHEMICAL_DELETED", "Chemical", id, {
      name: chemical.name,
    });
    return ok({ success: true });
  });
}
