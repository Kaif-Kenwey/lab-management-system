import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { parseBody, dateString, mapPrismaError } from "@/lib/validation";
import { deriveCalibrationStatus } from "@/lib/business-rules";
import { recordEquipmentEvent } from "@/lib/lifecycle";

const CALIBRATION_RESULT = ["PASS", "FAIL", "PENDING"] as const;

const patchSchema = z.object({
  standard: z.string().trim().min(1).max(200).optional(),
  provider: z.string().trim().max(200).nullable().optional(),
  lastCalibratedAt: dateString.optional(),
  nextDueAt: dateString.optional(),
  certificateNumber: z.string().trim().max(100).nullable().optional(),
  result: z.enum(CALIBRATION_RESULT).optional(),
  deviation: z.coerce.number().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, patchSchema);

    const record = await db.calibrationRecord.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      include: { equipment: { select: { id: true, name: true, code: true, status: true } } },
    });
    if (!record) throw NotFoundError("Calibration record not found");

    const result = data.result ?? record.result;
    const lastCalibratedAt = data.lastCalibratedAt ?? record.lastCalibratedAt;
    const nextDueAt = data.nextDueAt ?? record.nextDueAt;
    const status = deriveCalibrationStatus(result, nextDueAt);

    try {
      const updated = await db.$transaction(async (tx) => {
        const row = await tx.calibrationRecord.update({
          where: { id: record.id },
          data: {
            ...(data.standard !== undefined ? { standard: data.standard } : {}),
            ...(data.provider !== undefined ? { provider: data.provider } : {}),
            ...(data.lastCalibratedAt !== undefined ? { lastCalibratedAt: data.lastCalibratedAt } : {}),
            ...(data.nextDueAt !== undefined ? { nextDueAt: data.nextDueAt } : {}),
            ...(data.certificateNumber !== undefined ? { certificateNumber: data.certificateNumber } : {}),
            ...(data.result !== undefined ? { result: data.result } : {}),
            ...(data.deviation !== undefined ? { deviation: data.deviation } : {}),
            ...(data.notes !== undefined ? { notes: data.notes } : {}),
            status,
          },
          include: { equipment: { select: { id: true, name: true, code: true } } },
        });

        // A completed calibration is a lifecycle event on the equipment
        if (data.result === "PASS" || data.result === "FAIL") {
          await recordEquipmentEvent(tx, {
            organizationId: ctx.session.orgId,
            equipmentId: record.equipment.id,
            type: "CALIBRATION_COMPLETED",
            newStatus: record.equipment.status,
            notes: `Calibration ${result}${data.certificateNumber ? ` — cert ${data.certificateNumber}` : ""}`,
            actorId: ctx.session.userId,
          });
        }

        return row;
      });

      await audit(ctx.session.orgId, ctx.session.userId, "CALIBRATION_UPDATED", "CalibrationRecord", id, {
        equipment: record.equipment.name,
        result,
        status,
      });
      return ok(updated);
    } catch (e) {
      mapPrismaError(e, "Calibration update failed");
      throw e;
    }
  }, "calibration.manage");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const record = await db.calibrationRecord.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      include: { equipment: { select: { id: true, name: true, code: true } } },
    });
    if (!record) throw NotFoundError("Calibration record not found");
    return ok(record);
  }, "calibration.read");
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const record = await db.calibrationRecord.findFirst({
      where: { id, organizationId: ctx.session.orgId },
    });
    if (!record) throw NotFoundError("Calibration record not found");

    await db.calibrationRecord.delete({ where: { id: record.id } });
    await audit(ctx.session.orgId, ctx.session.userId, "CALIBRATION_DELETED", "CalibrationRecord", id, {});
    return ok({ success: true });
  }, "calibration.manage");
}
