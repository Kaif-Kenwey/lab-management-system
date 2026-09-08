import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

export async function GET(req: NextRequest) {
  return withAuth(async (session) => {
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status")?.trim() ?? "";
    const equipmentId = sp.get("equipmentId")?.trim() ?? "";

    const where: Prisma.MaintenanceRecordWhereInput = {
      organizationId: session.orgId,
      ...(status ? { status } : {}),
      ...(equipmentId ? { equipmentId } : {}),
    };

    const records = await db.maintenanceRecord.findMany({
      where,
      include: {
        equipment: { select: { id: true, name: true, code: true } },
        technician: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: "desc" },
    });
    return ok(records);
  }, ["ADMIN", "LAB_MANAGER", "TECHNICIAN"]);
}

export async function POST(req: NextRequest) {
  return withAuth(async (session) => {
    const b = await body<{
      equipmentId?: string;
      type?: string;
      scheduledAt?: string;
      technicianId?: string;
      cost?: number | string;
      notes?: string;
    }>(req);

    if (!b.equipmentId || !b.scheduledAt) return fail("Equipment and scheduledAt are required");

    const equipment = await db.equipment.findFirst({
      where: { id: b.equipmentId, organizationId: session.orgId },
    });
    if (!equipment) return fail("Equipment not found in your organization", 404);

    const scheduledAt = new Date(b.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) return fail("Invalid scheduledAt date", 400);

    if (b.technicianId) {
      const technician = await db.user.findFirst({
        where: { id: b.technicianId, organizationId: session.orgId },
      });
      if (!technician) return fail("Technician not found in your organization", 404);
    }

    const cost = b.cost === undefined || b.cost === null || b.cost === "" ? 0 : Number(b.cost);
    if (Number.isNaN(cost) || cost < 0) return fail("Cost must be a non-negative number");

    // NOTE: equipment status is intentionally NOT changed on create —
    // only when PATCH moves the record to IN_PROGRESS / COMPLETED.
    const record = await db.maintenanceRecord.create({
      data: {
        organizationId: session.orgId,
        equipmentId: b.equipmentId,
        type: b.type ?? "PREVENTIVE",
        status: "SCHEDULED",
        scheduledAt,
        technicianId: b.technicianId ?? null,
        cost,
        notes: b.notes ?? null,
      },
      include: {
        equipment: { select: { id: true, name: true, code: true } },
        technician: { select: { id: true, name: true } },
      },
    });
    await audit(session.orgId, session.userId, "MAINTENANCE_SCHEDULED", "MaintenanceRecord", record.id, {
      equipment: equipment.name,
      type: record.type,
    });
    return ok(record, 201);
  }, ["ADMIN", "LAB_MANAGER", "TECHNICIAN"]);
}
