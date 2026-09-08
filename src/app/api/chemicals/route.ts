import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { parseBody, dateString, mapPrismaError } from "@/lib/validation";

const HAZARD = ["LOW", "FLAMMABLE", "CORROSIVE", "TOXIC", "REACTIVE"] as const;

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  labId: z.string().min(1, "Lab is required"),
  casNumber: z.string().trim().max(50).nullable().optional(),
  batchNumber: z.string().trim().max(100).nullable().optional(),
  supplier: z.string().trim().max(200).nullable().optional(),
  quantity: z.coerce.number().min(0, "Quantity must be non-negative").default(0),
  unit: z.string().trim().max(20).default("mL"),
  hazardClass: z.enum(HAZARD).default("LOW"),
  expiryDate: dateString.nullable().optional(),
  storageLocation: z.string().trim().max(200).nullable().optional(),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const q = ctx.searchParams.get("q")?.trim() ?? "";
    const hazardClass = ctx.searchParams.get("hazardClass")?.trim() ?? "";
    const labId = ctx.searchParams.get("labId")?.trim() ?? "";
    const expiring = ctx.searchParams.get("expiring") === "true";

    const soon = new Date();
    soon.setDate(soon.getDate() + 30);

    const chemicals = await db.chemical.findMany({
      where: {
        organizationId: ctx.session.orgId,
        ...(hazardClass ? { hazardClass } : {}),
        ...(labId ? { labId } : {}),
        ...(expiring ? { expiryDate: { lte: soon } } : {}),
        ...(q ? { OR: [{ name: { contains: q } }, { casNumber: { contains: q } }] } : {}),
      },
      include: { lab: { select: { id: true, name: true, code: true } } },
      orderBy: { name: "asc" },
    });
    return ok(chemicals);
  }, "chemicals.read");
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, createSchema);

    const lab = await db.lab.findFirst({
      where: { id: data.labId, organizationId: ctx.session.orgId },
    });
    if (!lab) throw NotFoundError("Lab not found in your organization");

    try {
      const chemical = await db.chemical.create({
        data: {
          organizationId: ctx.session.orgId,
          labId: data.labId,
          name: data.name,
          casNumber: data.casNumber ?? null,
          batchNumber: data.batchNumber ?? null,
          supplier: data.supplier ?? null,
          quantity: data.quantity,
          unit: data.unit,
          hazardClass: data.hazardClass,
          expiryDate: data.expiryDate ?? null,
          storageLocation: data.storageLocation ?? null,
        },
        include: { lab: { select: { id: true, name: true, code: true } } },
      });
      await audit(ctx.session.orgId, ctx.session.userId, "CHEMICAL_CREATED", "Chemical", chemical.id, {
        name: chemical.name,
        hazardClass: chemical.hazardClass,
      });
      return ok(chemical, 201);
    } catch (e) {
      mapPrismaError(e, "A chemical with these details already exists");
      throw e;
    }
  }, "chemicals.manage");
}

// keep ValidationError referenced for tests importing this module shape
export const __internal = { ValidationError };
