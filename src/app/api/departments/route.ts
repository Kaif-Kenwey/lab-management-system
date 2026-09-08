import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody, mapPrismaError } from "@/lib/validation";

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1, "Department name is required").max(120),
  code: z.string().trim().min(1, "Department code is required").max(40),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const q = ctx.searchParams.get("q")?.trim() ?? "";
    const departments = await db.department.findMany({
      where: {
        organizationId: ctx.session.orgId,
        ...(q ? { OR: [{ name: { contains: q } }, { code: { contains: q } }] } : {}),
      },
      include: { _count: { select: { labs: true, courses: true } } },
      orderBy: { createdAt: "asc" },
    });
    return ok(departments);
  }, "academics.read");
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, createDepartmentSchema);
    try {
      const department = await db.department.create({
        data: { organizationId: ctx.session.orgId, name: data.name, code: data.code },
        include: { _count: { select: { labs: true, courses: true } } },
      });
      await audit(ctx.session.orgId, ctx.session.userId, "DEPARTMENT_CREATED", "Department", department.id, {
        name: department.name,
        code: department.code,
      });
      return ok(department, 201);
    } catch (e) {
      mapPrismaError(e, "A department with this code already exists in your organization");
    }
  }, "labs.manage");
}
