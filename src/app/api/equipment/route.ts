import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

export async function GET(req: NextRequest) {
  return withAuth(async (session) => {
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim() ?? "";
    const labId = sp.get("labId")?.trim() ?? "";
    const status = sp.get("status")?.trim() ?? "";

    const where: Prisma.EquipmentWhereInput = {
      organizationId: session.orgId,
      ...(labId ? { labId } : {}),
      ...(status ? { status } : {}),
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
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async (session) => {
    const b = await body<{
      name?: string;
      code?: string;
      labId?: string;
      category?: string;
      manufacturer?: string;
      serialNumber?: string;
      price?: number | string;
      purchaseDate?: string | null;
      condition?: string;
    }>(req);

    if (!b.name?.trim() || !b.code?.trim() || !b.labId) {
      return fail("Name, code and lab are required");
    }

    const lab = await db.lab.findFirst({ where: { id: b.labId, organizationId: session.orgId } });
    if (!lab) return fail("Lab not found in your organization", 404);

    const price =
      b.price === undefined || b.price === null || b.price === "" ? 0 : Number(b.price);
    if (Number.isNaN(price) || price < 0) return fail("Price must be a non-negative number");

    let purchaseDate: Date | null = null;
    if (b.purchaseDate) {
      purchaseDate = new Date(b.purchaseDate);
      if (Number.isNaN(purchaseDate.getTime())) return fail("Invalid purchaseDate", 400);
    }

    try {
      const equipment = await db.equipment.create({
        data: {
          organizationId: session.orgId,
          labId: b.labId,
          name: b.name.trim(),
          code: b.code.trim(),
          category: b.category ?? "GENERAL",
          manufacturer: b.manufacturer ?? null,
          serialNumber: b.serialNumber ?? null,
          price,
          purchaseDate,
          condition: b.condition ?? "GOOD",
        },
        include: { lab: { select: { id: true, name: true, code: true } } },
      });
      await audit(session.orgId, session.userId, "EQUIPMENT_CREATED", "Equipment", equipment.id, {
        name: equipment.name,
        code: equipment.code,
      });
      return ok(equipment, 201);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return fail("Equipment with this code already exists in your organization", 409);
      }
      throw e;
    }
  });
}
