import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { parseBody, mapPrismaError, dateString } from "@/lib/validation";
import { recordEquipmentEvent } from "@/lib/lifecycle";
import { EQUIPMENT_STATUS, EQUIPMENT_CATEGORY, EQUIPMENT_CONDITION } from "@/lib/constants";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  code: z.string().trim().min(1, "Code is required").max(60),
  labId: z.string().min(1, "Lab is required"),
  category: z.enum(EQUIPMENT_CATEGORY).optional(),
  status: z.enum(EQUIPMENT_STATUS).optional(),
  condition: z.enum(EQUIPMENT_CONDITION).optional(),
  manufacturer: z.string().trim().max(200).optional().nullable(),
  serialNumber: z.string().trim().max(200).optional().nullable(),
  price: z.coerce.number().min(0).optional(),
  purchaseDate: dateString.optional().nullable(),
  warrantyUntil: dateString.optional().nullable(),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const sp = ctx.searchParams;
    const q = sp.get("q")?.trim() ?? "";
    const labId = sp.get("labId")?.trim() ?? "";
    const status = sp.get("status")?.trim() ?? "";
    const category = sp.get("category")?.trim() ?? "";

    const where: Prisma.EquipmentWhereInput = {
      organizationId: ctx.session.orgId,
      ...(labId ? { labId } : {}),
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { code: { contains: q } },
              { serialNumber: { contains: q } },
              { manufacturer: { contains: q } },
            ],
          }
        : {}),
    };

    const equipment = await db.equipment.findMany({
      where,
      include: { lab: { select: { id: true, name: true, code: true } } },
      orderBy: { createdAt: "desc" },
    });
    return ok(equipment);
  }, "equipment.read");
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, createSchema);

    const lab = await db.lab.findFirst({
      where: { id: data.labId, organizationId: ctx.session.orgId },
    });
    if (!lab) throw NotFoundError("Lab not found in your organization");

    try {
      const equipment = await db.$transaction(async (tx) => {
        const created = await tx.equipment.create({
          data: {
            organizationId: ctx.session.orgId,
            labId: data.labId,
            name: data.name,
            code: data.code,
            category: data.category ?? "GENERAL",
            status: data.status ?? "AVAILABLE",
            condition: data.condition ?? "GOOD",
            manufacturer: data.manufacturer ?? null,
            serialNumber: data.serialNumber ?? null,
            price: data.price ?? 0,
            purchaseDate: data.purchaseDate ?? null,
            warrantyUntil: data.warrantyUntil ?? null,
          },
          include: { lab: { select: { id: true, name: true, code: true } } },
        });
        await recordEquipmentEvent(tx, {
          organizationId: ctx.session.orgId,
          equipmentId: created.id,
          type: "CREATED",
          newStatus: created.status,
          notes: `Asset registered in ${lab.name}`,
          actorId: ctx.session.userId,
        });
        return created;
      });

      await audit(ctx.session.orgId, ctx.session.userId, "EQUIPMENT_CREATED", "Equipment", equipment.id, {
        name: equipment.name,
        code: equipment.code,
      });
      return ok(equipment, 201);
    } catch (e) {
      mapPrismaError(e, "Equipment with this code already exists in your organization");
    }
  }, "equipment.manage");
}
