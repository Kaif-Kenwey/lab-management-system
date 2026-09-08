import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { parseBody, dateString } from "@/lib/validation";
import { recordEquipmentEvent } from "@/lib/lifecycle";
import { deriveCalibrationStatus } from "@/lib/business-rules";
import { CALIBRATION_RESULT } from "@/lib/constants";

const createSchema = z.object({
  equipmentId: z.string().min(1, "Equipment is required"),
  standard: z.string().trim().max(200).optional().nullable(),
  provider: z.string().trim().max(200).optional().nullable(),
  lastCalibratedAt: dateString.optional(),
  nextDueAt: dateString,
  certificateNumber: z.string().trim().max(120).optional().nullable(),
  result: z.enum(CALIBRATION_RESULT).optional(),
  deviation: z.coerce.number().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const sp = ctx.searchParams;
    const status = sp.get("status")?.trim() ?? "";
    const equipmentId = sp.get("equipmentId")?.trim() ?? "";
    const q = sp.get("q")?.trim() ?? "";
    const now = new Date();

    const where: Prisma.CalibrationRecordWhereInput = {
      organizationId: ctx.session.orgId,
      ...(equipmentId ? { equipmentId } : {}),
      ...(q
        ? {
            OR: [
              { certificateNumber: { contains: q } },
              { provider: { contains: q } },
              { standard: { contains: q } },
              { equipment: { is: { OR: [{ name: { contains: q } }, { code: { contains: q } }] } } },
            ],
          }
        : {}),
    };

    const records = await db.calibrationRecord.findMany({
      where,
      include: {
        equipment: { select: { id: true, name: true, code: true, status: true } },
      },
      orderBy: { nextDueAt: "asc" },
    });

    // Status is always derived live from result + nextDueAt.
    const derived = records.map((r) => ({
      ...r,
      status: deriveCalibrationStatus(r.result, r.nextDueAt, now),
    }));

    return ok(status ? derived.filter((r) => r.status === status) : derived);
  }, "calibration.read");
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, createSchema);

    const equipment = await db.equipment.findFirst({
      where: { id: data.equipmentId, organizationId: ctx.session.orgId },
    });
    if (!equipment) throw NotFoundError("Equipment not found in your organization");

    const lastCalibratedAt = data.lastCalibratedAt ?? new Date();
    const status = deriveCalibrationStatus(data.result ?? "PENDING", data.nextDueAt);

    const record = await db.calibrationRecord.create({
      data: {
        organizationId: ctx.session.orgId,
        equipmentId: data.equipmentId,
        standard: data.standard ?? "Reference standard",
        provider: data.provider ?? null,
        lastCalibratedAt,
        nextDueAt: data.nextDueAt,
        certificateNumber: data.certificateNumber ?? null,
        result: data.result ?? "PENDING",
        deviation: data.deviation ?? null,
        status,
        notes: data.notes ?? null,
      },
      include: {
        equipment: { select: { id: true, name: true, code: true, status: true } },
      },
    });

    if (data.result === "PASS") {
      await recordEquipmentEvent(db, {
        organizationId: ctx.session.orgId,
        equipmentId: data.equipmentId,
        type: "CALIBRATION_COMPLETED",
        notes: `Calibration passed${data.certificateNumber ? ` (certificate ${data.certificateNumber})` : ""}`,
        actorId: ctx.session.userId,
      });
    }

    await audit(ctx.session.orgId, ctx.session.userId, "CALIBRATION_CREATED", "CalibrationRecord", record.id, {
      equipment: equipment.name,
      result: record.result,
      status,
      certificateNumber: record.certificateNumber,
    });
    return ok(record, 201);
  }, "calibration.manage");
}
