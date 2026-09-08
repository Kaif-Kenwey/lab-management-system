import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody, optionalId } from "@/lib/validation";
import { SESSION_STATUS } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { NotFoundError, ConflictError, ForbiddenError } from "@/lib/errors";

// SCHEDULED → IN_PROGRESS → COMPLETED, either of the first two → CANCELLED
const SESSION_TRANSITIONS: Record<string, string[]> = {
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

const updateSessionSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  scheduledAt: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid scheduledAt date")
    .optional(),
  durationMin: z.coerce.number().int().positive("durationMin must be a positive number").optional(),
  room: z.string().trim().max(120).nullish(),
  status: z.enum(SESSION_STATUS).optional(),
  remarks: z.string().max(1000).nullish(),
  labId: optionalId,
  instructorId: optionalId,
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const labSession = await db.labSession.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      include: {
        experiment: { select: { id: true, title: true, code: true } },
        lab: { select: { id: true, name: true } },
        instructor: { select: { id: true, name: true, email: true } },
        attendance: { orderBy: { markedAt: "asc" } },
        grades: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!labSession) throw NotFoundError("Session not found");
    return ok(labSession);
  }, "academics.read");
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, updateSessionSchema);

    const labSession = await db.labSession.findFirst({ where: { id, organizationId: ctx.session.orgId } });
    if (!labSession) throw NotFoundError("Session not found");

    // academics.manage OR the session's own instructor
    const isManager = can(ctx.session.role, "academics.manage");
    const isInstructor = labSession.instructorId === ctx.session.userId;
    if (!isManager && !isInstructor) {
      throw ForbiddenError("Forbidden — requires academics.manage or session instructor");
    }

    if (data.labId) {
      const lab = await db.lab.findFirst({
        where: { id: data.labId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!lab) throw NotFoundError("Lab not found in your organization");
    }
    if (data.instructorId) {
      const instructor = await db.user.findFirst({
        where: { id: data.instructorId, organizationId: ctx.session.orgId },
        select: { id: true },
      });
      if (!instructor) throw NotFoundError("Instructor not found in your organization");
    }

    if (data.status && data.status !== labSession.status) {
      const allowed = SESSION_TRANSITIONS[labSession.status] ?? [];
      if (!allowed.includes(data.status)) {
        throw ConflictError(`Invalid session transition: ${labSession.status} → ${data.status}`);
      }
    }

    const updated = await db.labSession.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.scheduledAt !== undefined ? { scheduledAt: new Date(data.scheduledAt) } : {}),
        ...(data.durationMin !== undefined ? { durationMin: data.durationMin } : {}),
        ...(data.room !== undefined ? { room: data.room ?? null } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.remarks !== undefined ? { remarks: data.remarks ?? null } : {}),
        ...(data.labId !== undefined ? { labId: data.labId ?? null } : {}),
        ...(data.instructorId !== undefined ? { instructorId: data.instructorId ?? null } : {}),
      },
      include: {
        experiment: { select: { id: true, title: true, code: true } },
        lab: { select: { id: true, name: true } },
        instructor: { select: { id: true, name: true, email: true } },
        attendance: { orderBy: { markedAt: "asc" } },
        grades: { orderBy: { createdAt: "asc" } },
      },
    });
    await audit(ctx.session.orgId, ctx.session.userId, "SESSION_UPDATED", "LabSession", id, {
      title: updated.title,
      status: updated.status,
    });
    return ok(updated);
  });
}
