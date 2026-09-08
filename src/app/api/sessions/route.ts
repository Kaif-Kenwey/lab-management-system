import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody, optionalId } from "@/lib/validation";
import { NotFoundError } from "@/lib/errors";

const sessionInclude = {
  experiment: { select: { id: true, title: true, code: true } },
  lab: { select: { id: true, name: true } },
  instructor: { select: { id: true, name: true, email: true } },
  attendance: { orderBy: { markedAt: "asc" as const } },
  grades: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.LabSessionInclude;

export const createSessionSchema = z.object({
  experimentId: z.string().min(1, "Experiment is required"),
  title: z.string().trim().max(200).optional(),
  scheduledAt: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid scheduledAt date"),
  durationMin: z.coerce.number().int().positive("durationMin must be a positive number").optional().default(90),
  room: z.string().trim().max(120).nullish(),
  labId: optionalId,
  instructorId: optionalId,
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const experimentId = ctx.searchParams.get("experimentId")?.trim() ?? "";
    const status = ctx.searchParams.get("status")?.trim() ?? "";
    const labId = ctx.searchParams.get("labId")?.trim() ?? "";
    const q = ctx.searchParams.get("q")?.trim() ?? "";

    const sessions = await db.labSession.findMany({
      where: {
        organizationId: ctx.session.orgId,
        ...(experimentId ? { experimentId } : {}),
        ...(status ? { status } : {}),
        ...(labId ? { labId } : {}),
        ...(q ? { OR: [{ title: { contains: q } }, { room: { contains: q } }] } : {}),
      },
      include: sessionInclude,
      orderBy: { scheduledAt: "desc" },
    });
    return ok(sessions);
  }, "academics.read");
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, createSessionSchema);

    const experiment = await db.experiment.findFirst({
      where: { id: data.experimentId, organizationId: ctx.session.orgId },
    });
    if (!experiment) throw NotFoundError("Experiment not found in your organization");

    if (data.labId) {
      const lab = await db.lab.findFirst({
        where: { id: data.labId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!lab) throw NotFoundError("Lab not found in your organization");
    }
    if (data.instructorId) {
      const instructor = await db.user.findFirst({
        where: { id: data.instructorId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!instructor) throw NotFoundError("Instructor not found in your organization");
    }

    const labSession = await db.labSession.create({
      data: {
        organizationId: ctx.session.orgId,
        experimentId: data.experimentId,
        title: data.title ?? experiment.title,
        scheduledAt: new Date(data.scheduledAt),
        durationMin: data.durationMin,
        room: data.room ?? null,
        labId: data.labId ?? experiment.labId,
        instructorId: data.instructorId ?? experiment.instructorId,
      },
      include: sessionInclude,
    });
    await audit(ctx.session.orgId, ctx.session.userId, "SESSION_CREATED", "LabSession", labSession.id, {
      title: labSession.title,
      experiment: experiment.title,
    });
    return ok(labSession, 201);
  }, "academics.manage");
}
