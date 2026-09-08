import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody, mapPrismaError, optionalId } from "@/lib/validation";
import { EXPERIMENT_STATUS } from "@/lib/constants";
import { NotFoundError, ConflictError } from "@/lib/errors";

const updateExperimentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  code: z.string().trim().min(1).max(40).optional(),
  labId: z.string().min(1).optional(),
  courseId: optionalId,
  instructorId: optionalId,
  description: z.string().max(1000).nullish(),
  status: z.enum(EXPERIMENT_STATUS).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, updateExperimentSchema);

    const experiment = await db.experiment.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true, title: true },
    });
    if (!experiment) throw NotFoundError("Experiment not found");

    if (data.labId) {
      const lab = await db.lab.findFirst({
        where: { id: data.labId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!lab) throw NotFoundError("Lab not found in your organization");
    }
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
      const updated = await db.experiment.update({
        where: { id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.code !== undefined ? { code: data.code } : {}),
          ...(data.labId !== undefined ? { labId: data.labId } : {}),
          ...(data.courseId !== undefined ? { courseId: data.courseId ?? null } : {}),
          ...(data.instructorId !== undefined ? { instructorId: data.instructorId ?? null } : {}),
          ...(data.description !== undefined ? { description: data.description ?? null } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
        },
        include: {
          course: { select: { id: true, title: true, code: true } },
          lab: { select: { id: true, name: true, code: true } },
          instructor: { select: { id: true, name: true, email: true } },
          _count: { select: { sessions: true } },
        },
      });
      await audit(ctx.session.orgId, ctx.session.userId, "EXPERIMENT_UPDATED", "Experiment", id, {
        title: updated.title,
      });
      return ok(updated);
    } catch (e) {
      mapPrismaError(e, "An experiment with this code already exists in your organization");
    }
  }, "academics.manage");
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const experiment = await db.experiment.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true, title: true, _count: { select: { sessions: true } } },
    });
    if (!experiment) throw NotFoundError("Experiment not found");

    if (experiment._count.sessions > 0) {
      throw ConflictError("Experiment has sessions and cannot be deleted");
    }

    await db.experiment.delete({ where: { id } });
    await audit(ctx.session.orgId, ctx.session.userId, "EXPERIMENT_DELETED", "Experiment", id, {
      title: experiment.title,
    });
    return ok({ success: true });
  }, "academics.manage");
}
