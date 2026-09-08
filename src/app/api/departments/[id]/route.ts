import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody, mapPrismaError } from "@/lib/validation";
import { NotFoundError, ConflictError } from "@/lib/errors";

const updateDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  code: z.string().trim().min(1).max(40).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, updateDepartmentSchema);

    const department = await db.department.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true, name: true },
    });
    if (!department) throw NotFoundError("Department not found");

    try {
      const updated = await db.department.update({
        where: { id },
        data,
        include: { _count: { select: { labs: true, courses: true } } },
      });
      await audit(ctx.session.orgId, ctx.session.userId, "DEPARTMENT_UPDATED", "Department", id, {
        name: updated.name,
      });
      return ok(updated);
    } catch (e) {
      mapPrismaError(e, "A department with this code already exists in your organization");
    }
  }, "labs.manage");
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const department = await db.department.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true, name: true, _count: { select: { labs: true, courses: true } } },
    });
    if (!department) throw NotFoundError("Department not found");

    if (department._count.labs > 0 || department._count.courses > 0) {
      throw ConflictError("Department is referenced by labs or courses and cannot be deleted");
    }

    await db.department.delete({ where: { id } });
    await audit(ctx.session.orgId, ctx.session.userId, "DEPARTMENT_DELETED", "Department", id, {
      name: department.name,
    });
    return ok({ success: true });
  }, "labs.manage");
}
