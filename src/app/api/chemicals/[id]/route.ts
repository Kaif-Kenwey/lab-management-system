import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { parseBody, dateString, mapPrismaError } from "@/lib/validation";

const HAZARD = ["LOW", "FLAMMABLE", "CORROSIVE", "TOXIC", "REACTIVE"] as const;

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  labId: z.string().min(1).optional(),
  casNumber: z.string().trim().max(50).nullable().optional(),
  batchNumber: z.string().trim().max(100).nullable().optional(),
  supplier: z.string().trim().max(200).nullable().optional(),
  quantity: z.coerce.number().min(0, "Quantity must be non-negative").optional(),
  unit: z.string().trim().max(20).optional(),
  hazardClass: z.enum(HAZARD).optional(),
  expiryDate: dateString.nullable().optional(),
  storageLocation: z.string().trim().max(200).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, patchSchema);

    const chemical = await db.chemical.findFirst({
      where: { id, organizationId: ctx.session.orgId },
    });
    if (!chemical) throw NotFoundError("Chemical not found");

    if (data.labId) {
      const lab = await db.lab.findFirst({
        where: { id: data.labId, organizationId: ctx.session.orgId },
      });
      if (!lab) throw NotFoundError("Lab not found in your organization");
    }

    try {
      const updated = await db.chemical.update({
        where: { id: chemical.id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.labId !== undefined ? { labId: data.labId } : {}),
          ...(data.casNumber !== undefined ? { casNumber: data.casNumber } : {}),
          ...(data.batchNumber !== undefined ? { batchNumber: data.batchNumber } : {}),
          ...(data.supplier !== undefined ? { supplier: data.supplier } : {}),
          ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
          ...(data.unit !== undefined ? { unit: data.unit } : {}),
          ...(data.hazardClass !== undefined ? { hazardClass: data.hazardClass } : {}),
          ...(data.expiryDate !== undefined ? { expiryDate: data.expiryDate } : {}),
          ...(data.storageLocation !== undefined ? { storageLocation: data.storageLocation } : {}),
        },
        include: { lab: { select: { id: true, name: true, code: true } } },
      });
      await audit(ctx.session.orgId, ctx.session.userId, "CHEMICAL_UPDATED", "Chemical", id, {
        name: updated.name,
      });
      return ok(updated);
    } catch (e) {
      mapPrismaError(e, "Chemical update failed");
      throw e;
    }
  }, "chemicals.manage");
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const chemical = await db.chemical.findFirst({
      where: { id, organizationId: ctx.session.orgId },
    });
    if (!chemical) throw NotFoundError("Chemical not found");

    await db.chemical.delete({ where: { id: chemical.id } });
    await audit(ctx.session.orgId, ctx.session.userId, "CHEMICAL_DELETED", "Chemical", id, {
      name: chemical.name,
    });
    return ok({ success: true });
  }, "chemicals.manage");
}

export const __internal = { ValidationError };
