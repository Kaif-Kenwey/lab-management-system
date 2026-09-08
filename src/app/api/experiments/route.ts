import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

export async function GET(req: NextRequest) {
  return withAuth(async (session) => {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

    const experiments = await db.experiment.findMany({
      where: {
        organizationId: session.orgId,
        ...(q ? { OR: [{ title: { contains: q } }, { code: { contains: q } }] } : {}),
      },
      include: {
        lab: { select: { id: true, name: true, code: true } },
        instructor: { select: { id: true, name: true } },
        _count: { select: { sessions: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return ok(experiments);
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async (session) => {
    const b = await body<{
      title?: string;
      code?: string;
      labId?: string;
      description?: string;
      instructorId?: string;
    }>(req);

    if (!b.title?.trim() || !b.code?.trim() || !b.labId) {
      return fail("Title, code and lab are required");
    }

    const lab = await db.lab.findFirst({ where: { id: b.labId, organizationId: session.orgId } });
    if (!lab) return fail("Lab not found in your organization", 404);

    if (b.instructorId) {
      const instructor = await db.user.findFirst({
        where: { id: b.instructorId, organizationId: session.orgId },
      });
      if (!instructor) return fail("Instructor not found in your organization", 404);
    }

    try {
      const experiment = await db.experiment.create({
        data: {
          organizationId: session.orgId,
          labId: b.labId,
          title: b.title.trim(),
          code: b.code.trim(),
          description: b.description ?? null,
          instructorId: b.instructorId ?? null,
        },
        include: {
          lab: { select: { id: true, name: true, code: true } },
          instructor: { select: { id: true, name: true } },
          _count: { select: { sessions: true } },
        },
      });
      await audit(session.orgId, session.userId, "EXPERIMENT_CREATED", "Experiment", experiment.id, {
        title: experiment.title,
        code: experiment.code,
      });
      return ok(experiment, 201);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return fail("An experiment with this code already exists in your organization", 409);
      }
      throw e;
    }
  }, ["ADMIN", "LAB_MANAGER", "INSTRUCTOR"]);
}
