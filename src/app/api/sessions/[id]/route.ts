import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

const SESSION_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const b = await body<{
      title?: string;
      scheduledAt?: string;
      durationMin?: number | string;
      room?: string | null;
      status?: string;
      labId?: string | null;
      instructorId?: string | null;
    }>(req);

    if (b.status && !SESSION_STATUSES.includes(b.status)) {
      return fail(`Invalid status — must be one of: ${SESSION_STATUSES.join(", ")}`);
    }

    const labSession = await db.labSession.findFirst({ where: { id, organizationId: session.orgId } });
    if (!labSession) return fail("Session not found", 404);

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

    const data: Prisma.LabSessionUncheckedUpdateInput = {};
    if (b.title !== undefined) data.title = b.title.trim();
    if (b.scheduledAt !== undefined) {
      const scheduledAt = new Date(b.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) return fail("Invalid scheduledAt date", 400);
      data.scheduledAt = scheduledAt;
    }
    if (b.durationMin !== undefined) {
      const durationMin = Number(b.durationMin);
      if (Number.isNaN(durationMin) || durationMin <= 0) {
        return fail("durationMin must be a positive number");
      }
      data.durationMin = Math.trunc(durationMin);
    }
    if (b.room !== undefined) data.room = b.room;
    if (b.status !== undefined) data.status = b.status;
    if (b.labId !== undefined) data.labId = b.labId;
    if (b.instructorId !== undefined) data.instructorId = b.instructorId;

    const updated = await db.labSession.update({
      where: { id },
      data,
      include: {
        experiment: { select: { id: true, title: true, code: true } },
        lab: { select: { id: true, name: true } },
        instructor: { select: { id: true, name: true } },
        attendance: { orderBy: { markedAt: "asc" } },
      },
    });
    await audit(session.orgId, session.userId, "SESSION_UPDATED", "LabSession", id, {
      title: updated.title,
      status: updated.status,
    });
    return ok(updated);
  });
}
