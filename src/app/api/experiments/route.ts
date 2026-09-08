import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody, mapPrismaError, optionalId } from "@/lib/validation";
import { EXPERIMENT_STATUS } from "@/lib/constants";
import { NotFoundError } from "@/lib/errors";

const experimentInclude = {
  course: { select: { id: true, title: true, code: true } },
  lab: { select: { id: true, name: true, code: true } },
  instructor: { select: { id: true, name: true, email: true } },
  _count: { select: { sessions: true } },
} satisfies Prisma.ExperimentInclude;

export const createExperimentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  code: z.string().trim().min(1, "Code is required").max(40),
  labId: z.string().min(1, "Lab is required"),
  courseId: optionalId,
  instructorId: optionalId,
  description: z.string().max(1000).nullish(),
  status: z.enum(EXPERIMENT_STATUS).optional().default("ACTIVE"),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const q = ctx.searchParams.get("q")?.trim() ?? "";
    const labId = ctx.searchParams.get("labId")?.trim() ?? "";
    const courseId = ctx.searchParams.get("courseId")?.trim() ?? "";
    const status = ctx.searchParams.get("status")?.trim() ?? "";

    const experiments = await db.experiment.findMany({
      where: {
        organizationId: ctx.session.orgId,
        ...(labId ? { labId } : {}),
        ...(courseId ? { courseId } : {}),
        ...(status ? { status } : {}),
        ...(q ? { OR: [{ title: { contains: q } }, { code: { contains: q } }] } : {}),
      },
      include: experimentInclude,
      orderBy: { createdAt: "desc" },
    });
    return ok(experiments);
  }, "academics.read");
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, createExperimentSchema);

    const lab = await db.lab.findFirst({
      where: { id: data.labId, organizationId: ctx.session.orgId },
      select: { id: true },
    });
    if (!lab) throw NotFoundError("Lab not found in your organization");

    if (data.courseId) {
      const course = await db.course.findFirst({
        where: { id: data.courseId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!course) throw NotFoundError("Course not found in your organization");
    }
    if (data.instructorId) {
      const instructor = await db.user.findFirst({
        where: { id: data.instructorId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!instructor) throw NotFoundError("Instructor not found in your organization");
    }

    try {
      const experiment = await db.experiment.create({
        data: {
          organizationId: ctx.session.orgId,
          title: data.title,
          code: data.code,
          labId: data.labId,
          courseId: data.courseId ?? null,
          instructorId: data.instructorId ?? null,
          description: data.description ?? null,
          status: data.status,
        },
        include: experimentInclude,
      });
      await audit(ctx.session.orgId, ctx.session.userId, "EXPERIMENT_CREATED", "Experiment", experiment.id, {
        title: experiment.title,
        code: experiment.code,
      });
      return ok(experiment, 201);
    } catch (e) {
      mapPrismaError(e, "An experiment with this code already exists in your organization");
    }
  }, "academics.manage");
}
