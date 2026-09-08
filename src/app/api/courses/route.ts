import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody, mapPrismaError, optionalId } from "@/lib/validation";
import { NotFoundError } from "@/lib/errors";

const courseInclude = {
  department: { select: { id: true, name: true, code: true } },
  instructor: { select: { id: true, name: true, email: true } },
  _count: { select: { experiments: true } },
} satisfies Prisma.CourseInclude;

export const createCourseSchema = z.object({
  code: z.string().trim().min(1, "Course code is required").max(40),
  title: z.string().trim().min(1, "Course title is required").max(200),
  description: z.string().max(1000).nullish(),
  departmentId: optionalId,
  instructorId: optionalId,
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const q = ctx.searchParams.get("q")?.trim() ?? "";
    const departmentId = ctx.searchParams.get("departmentId")?.trim() ?? "";
    const courses = await db.course.findMany({
      where: {
        organizationId: ctx.session.orgId,
        ...(departmentId ? { departmentId } : {}),
        ...(q ? { OR: [{ title: { contains: q } }, { code: { contains: q } }] } : {}),
      },
      include: courseInclude,
      orderBy: { createdAt: "desc" },
    });
    return ok(courses);
  }, "academics.read");
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, createCourseSchema);

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
      const course = await db.course.create({
        data: {
          organizationId: ctx.session.orgId,
          code: data.code,
          title: data.title,
          description: data.description ?? null,
          departmentId: data.departmentId ?? null,
          instructorId: data.instructorId ?? null,
        },
        include: courseInclude,
      });
      await audit(ctx.session.orgId, ctx.session.userId, "COURSE_CREATED", "Course", course.id, {
        title: course.title,
        code: course.code,
      });
      return ok(course, 201);
    } catch (e) {
      mapPrismaError(e, "A course with this code already exists in your organization");
    }
  }, "academics.manage");
}
