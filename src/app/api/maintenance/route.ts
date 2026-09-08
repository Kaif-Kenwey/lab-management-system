import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { parseBody, dateString } from "@/lib/validation";
import { notify } from "@/lib/notify";
import { MAINTENANCE_TYPE, MAINTENANCE_PRIORITY } from "@/lib/constants";

const createSchema = z.object({
  equipmentId: z.string().min(1, "Equipment is required"),
  title: z.string().trim().min(1, "Title is required").max(200),
  issue: z.string().trim().max(2000).optional().nullable(),
  type: z.enum(MAINTENANCE_TYPE).optional(),
  priority: z.enum(MAINTENANCE_PRIORITY).optional(),
  scheduledAt: dateString,
  technicianId: z.string().min(1).optional().nullable(),
  laborCost: z.coerce.number().min(0).optional(),
  partsCost: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const sp = ctx.searchParams;
    const status = sp.get("status")?.trim() ?? "";
    const equipmentId = sp.get("equipmentId")?.trim() ?? "";
    const q = sp.get("q")?.trim() ?? "";

    const where: Prisma.MaintenanceRecordWhereInput = {
      organizationId: ctx.session.orgId,
      ...(status ? { status } : {}),
      ...(equipmentId ? { equipmentId } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { issue: { contains: q } },
              { equipment: { is: { OR: [{ name: { contains: q } }, { code: { contains: q } }] } } },
            ],
          }
        : {}),
    };

    const records = await db.maintenanceRecord.findMany({
      where,
      include: {
        equipment: { select: { id: true, name: true, code: true, status: true } },
        technician: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: "desc" },
    });
    return ok(records);
  }, "maintenance.read");
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, createSchema);

    const equipment = await db.equipment.findFirst({
      where: { id: data.equipmentId, organizationId: ctx.session.orgId },
    });
    if (!equipment) throw NotFoundError("Equipment not found in your organization");

    if (data.technicianId) {
      const technician = await db.user.findFirst({
        where: { id: data.technicianId, organizationId: ctx.session.orgId },
      });
      if (!technician) throw NotFoundError("Technician not found in your organization");
    }

    // OPEN until a technician is assigned, then ASSIGNED.
    const status = data.technicianId ? "ASSIGNED" : "OPEN";

    const record = await db.maintenanceRecord.create({
      data: {
        organizationId: ctx.session.orgId,
        equipmentId: data.equipmentId,
        title: data.title,
        issue: data.issue ?? null,
        type: data.type ?? "PREVENTIVE",
        priority: data.priority ?? "MEDIUM",
        status,
        scheduledAt: data.scheduledAt,
        technicianId: data.technicianId ?? null,
        laborCost: data.laborCost ?? 0,
        partsCost: data.partsCost ?? 0,
        cost: (data.laborCost ?? 0) + (data.partsCost ?? 0),
        notes: data.notes ?? null,
      },
      include: {
        equipment: { select: { id: true, name: true, code: true, status: true } },
        technician: { select: { id: true, name: true } },
      },
    });

    if (data.technicianId) {
      await notify(db, {
        organizationId: ctx.session.orgId,
        userId: data.technicianId,
        title: "New work order assigned to you",
        body: `${record.title} — ${equipment.name} (${record.priority.toLowerCase()} priority), scheduled ${record.scheduledAt.toLocaleString()}.`,
        type: "INFO",
        entityType: "MaintenanceRecord",
        entityId: record.id,
      });
    }

    await audit(ctx.session.orgId, ctx.session.userId, "MAINTENANCE_CREATED", "MaintenanceRecord", record.id, {
      title: record.title,
      equipment: equipment.name,
      status,
      priority: record.priority,
    });
    return ok(record, 201);
  }, "maintenance.manage");
}
