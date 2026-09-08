import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const equipment = await db.equipment.findFirst({
      where: { id, organizationId: session.orgId },
      include: {
        lab: { select: { id: true, name: true, code: true } },
        reservations: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { startAt: "desc" },
        },
        checkouts: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { checkedOutAt: "desc" },
        },
        maintenanceRecords: {
          include: { technician: { select: { id: true, name: true } } },
          orderBy: { scheduledAt: "desc" },
        },
      },
    });
    if (!equipment) return fail("Equipment not found", 404);
    return ok(equipment);
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const b = await body<{
      name?: string;
      code?: string;
      labId?: string;
      category?: string;
      status?: string;
      condition?: string;
      manufacturer?: string | null;
      serialNumber?: string | null;
      price?: number | string;
      purchaseDate?: string | null;
    }>(req);

    if (b.status && !["AVAILABLE", "IN_USE", "UNDER_MAINTENANCE", "RETIRED"].includes(b.status)) {
      return fail("Invalid status — must be AVAILABLE, IN_USE, UNDER_MAINTENANCE or RETIRED");
    }
    if (b.condition && !["EXCELLENT", "GOOD", "FAIR", "POOR"].includes(b.condition)) {
      return fail("Invalid condition — must be EXCELLENT, GOOD, FAIR or POOR");
    }

    const equipment = await db.equipment.findFirst({ where: { id, organizationId: session.orgId } });
    if (!equipment) return fail("Equipment not found", 404);

    if (b.labId) {
      const lab = await db.lab.findFirst({ where: { id: b.labId, organizationId: session.orgId } });
      if (!lab) return fail("Lab not found in your organization", 404);
    }

    const data: Prisma.EquipmentUncheckedUpdateInput = {};
    if (b.name !== undefined) data.name = b.name.trim();
    if (b.code !== undefined) data.code = b.code.trim();
    if (b.labId !== undefined) data.labId = b.labId;
    if (b.category !== undefined) data.category = b.category;
    if (b.status !== undefined) data.status = b.status;
    if (b.condition !== undefined) data.condition = b.condition;
    if (b.manufacturer !== undefined) data.manufacturer = b.manufacturer;
    if (b.serialNumber !== undefined) data.serialNumber = b.serialNumber;
    if (b.price !== undefined) {
      const price = Number(b.price);
      if (Number.isNaN(price) || price < 0) return fail("Price must be a non-negative number");
      data.price = price;
    }
    if (b.purchaseDate !== undefined) {
      if (b.purchaseDate === null) {
        data.purchaseDate = null;
      } else {
        const d = new Date(b.purchaseDate);
        if (Number.isNaN(d.getTime())) return fail("Invalid purchaseDate", 400);
        data.purchaseDate = d;
      }
    }

    try {
      const updated = await db.equipment.update({
        where: { id },
        data,
        include: { lab: { select: { id: true, name: true, code: true } } },
      });
      await audit(session.orgId, session.userId, "EQUIPMENT_UPDATED", "Equipment", id, {
        name: updated.name,
        status: updated.status,
      });
      return ok(updated);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return fail("Equipment with this code already exists in your organization", 409);
      }
      throw e;
    }
  }, ["ADMIN", "LAB_MANAGER", "TECHNICIAN"]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const equipment = await db.equipment.findFirst({ where: { id, organizationId: session.orgId } });
    if (!equipment) return fail("Equipment not found", 404);

    try {
      await db.equipment.delete({ where: { id } });
      await audit(session.orgId, session.userId, "EQUIPMENT_DELETED", "Equipment", id, {
        name: equipment.name,
        code: equipment.code,
      });
      return ok({ success: true });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        return fail("Equipment has reservations, checkouts or maintenance records and cannot be deleted", 409);
      }
      throw e;
    }
  }, ["ADMIN"]);
}
