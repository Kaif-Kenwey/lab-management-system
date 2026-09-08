import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody, mapPrismaError, optionalId } from "@/lib/validation";
import { NotFoundError } from "@/lib/errors";

const labInclude = {
  department: { select: { id: true, name: true, code: true } },
  manager: { select: { id: true, name: true, email: true } },
  _count: { select: { equipment: true } },
} satisfies Prisma.LabInclude;

export const createLabSchema = z.object({
  name: z.string().trim().min(1, "Lab name is required").max(120),
  code: z.string().trim().min(1, "Lab code is required").max(40),
  location: z.string().trim().max(200).nullish(),
  capacity: z.coerce.number().int("Capacity must be a whole number").min(0).optional().default(0),
  description: z.string().max(1000).nullish(),
  managerId: optionalId,
  departmentId: optionalId,
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const q = ctx.searchParams.get("q")?.trim() ?? "";
    const labs = await db.lab.findMany({
      where: {
        organizationId: ctx.session.orgId,
        ...(q ? { OR: [{ name: { contains: q } }, { code: { contains: q } }] } : {}),
      },
      include: labInclude,
      orderBy: { createdAt: "asc" },
    });
    return ok(labs);
  }, "labs.read");
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, createLabSchema);

    if (data.managerId) {
      const manager = await db.user.findFirst({
        where: { id: data.managerId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!manager) throw NotFoundError("Manager not found in your organization");
    }
    if (data.departmentId) {
      const department = await db.department.findFirst({
        where: { id: data.departmentId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!department) throw NotFoundError("Department not found in your organization");
    }

    try {
      const lab = await db.lab.create({
        data: {
          organizationId: ctx.session.orgId,
          name: data.name,
          code: data.code,
          location: data.location ?? null,
          capacity: data.capacity,
          description: data.description ?? null,
          managerId: data.managerId ?? null,
          departmentId: data.departmentId ?? null,
        },
        include: labInclude,
      });
      await audit(ctx.session.orgId, ctx.session.userId, "LAB_CREATED", "Lab", lab.id, {
        name: lab.name,
        code: lab.code,
      });
      return ok(lab, 201);
    } catch (e) {
      mapPrismaError(e, "A lab with this code already exists in your organization");
    }
  }, "labs.manage");
}
