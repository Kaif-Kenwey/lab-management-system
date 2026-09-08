import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

export async function GET(req: NextRequest) {
  return withAuth(async (session) => {
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status")?.trim() ?? "";
    const experimentId = sp.get("experimentId")?.trim() ?? "";

    const where: Prisma.LabSessionWhereInput = {
      organizationId: session.orgId,
      ...(status ? { status } : {}),
      ...(experimentId ? { experimentId } : {}),
    };

    const sessions = await db.labSession.findMany({
      where,
      include: {
        experiment: { select: { id: true, title: true, code: true } },
        lab: { select: { id: true, name: true } },
        instructor: { select: { id: true, name: true } },
        attendance: { orderBy: { markedAt: "asc" } },
      },
      orderBy: { scheduledAt: "desc" },
    });
    return ok(sessions);
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async (session) => {
    const b = await body<{
      experimentId?: string;
      title?: string;
      scheduledAt?: string;
      durationMin?: number | string;
      room?: string;
      labId?: string;
      instructorId?: string;
    }>(req);

    if (!b.experimentId || !b.scheduledAt) return fail("Experiment and scheduledAt are required");

    const experiment = await db.experiment.findFirst({
      where: { id: b.experimentId, organizationId: session.orgId },
    });
    if (!experiment) return fail("Experiment not found in your organization", 404);

    const scheduledAt = new Date(b.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) return fail("Invalid scheduledAt date", 400);

    if (b.labId) {
      const lab = await db.lab.findFirst({ where: { id: b.labId, organizationId: session.orgId } });
      if (!lab) return fail("Lab not found in your organization", 404);
    }
    if (b.instructorId) {
      const instructor = await db.user.findFirst({
        where: { id: b.instructorId, organizationId: session.orgId },
      });
      if (!instructor) return fail("Instructor not found in your organization", 404);
    }

    let durationMin = 90;
    if (b.durationMin !== undefined && b.durationMin !== null && b.durationMin !== "") {
      durationMin = Number(b.durationMin);
      if (Number.isNaN(durationMin) || durationMin <= 0) return fail("durationMin must be a positive number");
      durationMin = Math.trunc(durationMin);
    }

    const labSession = await db.labSession.create({
      data: {
        organizationId: session.orgId,
        experimentId: b.experimentId,
        title: b.title?.trim() ?? experiment.title,
        scheduledAt,
        durationMin,
        room: b.room ?? null,
        labId: b.labId ?? experiment.labId,
        instructorId: b.instructorId ?? experiment.instructorId,
      },
      include: {
        experiment: { select: { id: true, title: true, code: true } },
        lab: { select: { id: true, name: true } },
        instructor: { select: { id: true, name: true } },
        attendance: { orderBy: { markedAt: "asc" } },
      },
    });
    await audit(session.orgId, session.userId, "SESSION_CREATED", "LabSession", labSession.id, {
      title: labSession.title,
      experiment: experiment.title,
    });
    return ok(labSession, 201);
  });
}
