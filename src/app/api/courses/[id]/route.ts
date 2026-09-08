import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody, mapPrismaError, optionalId } from "@/lib/validation";
import { NotFoundError } from "@/lib/errors";

const updateCourseSchema = z.object({
  code: z.string().trim().min(1).max(40).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(1000).nullish(),
  departmentId: optionalId,
  instructorId: optionalId,
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, updateCourseSchema);

    const course = await db.course.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true, title: true },
    });
    if (!course) throw NotFoundError("Course not found");

    if (data.departmentId) {
      const department = await db.department.findFirst({
        where: { id: data.departmentId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!department) throw NotFoundError("Department not found in your organization");
    }
    if (data.instructorId) {
      const instructor = await db.user.findFirst({
        where: { id: data.instructorId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!instructor) throw NotFoundError("Instructor not found in your organization");
    }

    try {
      const updated = await db.course.update({
        where: { id },
        data: {
          ...(data.code !== undefined ? { code: data.code } : {}),
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.description !== undefined ? { description: data.description ?? null } : {}),
          ...(data.departmentId !== undefined ? { departmentId: data.departmentId ?? null } : {}),
          ...(data.instructorId !== undefined ? { instructorId: data.instructorId ?? null } : {}),
        },
        include: {
          department: { select: { id: true, name: true, code: true } },
          instructor: { select: { id: true, name: true, email: true } },
          _count: { select: { experiments: true } },
        },
      });
      await audit(ctx.session.orgId, ctx.session.userId, "COURSE_UPDATED", "Course", id, {
        title: updated.title,
      });
      return ok(updated);
    } catch (e) {
      mapPrismaError(e, "A course with this code already exists in your organization");
    }
  }, "academics.manage");
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const course = await db.course.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true, title: true },
    });
    if (!course) throw NotFoundError("Course not found");

    // Experiments keep a nullable courseId — Prisma SetNull unlinks them
    await db.course.delete({ where: { id } });
    await audit(ctx.session.orgId, ctx.session.userId, "COURSE_DELETED", "Course", id, {
      title: course.title,
    });
    return ok({ success: true });
  }, "academics.manage");
}
