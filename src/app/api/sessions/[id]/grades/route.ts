import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody } from "@/lib/validation";
import { can } from "@/lib/permissions";
import { NotFoundError, ForbiddenError } from "@/lib/errors";

const gradeRecordSchema = z.object({
  studentName: z.string().trim().min(1, "Each record requires a studentName").max(120),
  userId: z.string().max(64).nullish(),
  score: z.coerce.number().min(0, "Score must be zero or greater"),
  maxScore: z.coerce.number().positive("maxScore must be positive").optional().default(100),
  remarks: z.string().max(500).nullish(),
});

const gradesSchema = z.object({
  records: z.array(gradeRecordSchema).min(1, "records array is required"),
});

async function loadSession(id: string, orgId: string) {
  const labSession = await db.labSession.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, title: true, experimentId: true, instructorId: true },
  });
  if (!labSession) throw NotFoundError("Session not found");
  return labSession;
}

/** academics.manage OR the session's own instructor */
function assertCanGrade(role: string, userId: string, instructorId: string | null) {
  const isManager = can(role, "academics.manage");
  const isInstructor = instructorId !== null && instructorId === userId;
  if (!isManager && !isInstructor) {
    throw ForbiddenError("Forbidden — requires academics.manage or session instructor");
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const labSession = await loadSession(id, ctx.session.orgId);
    void labSession;

    const grades = await db.grade.findMany({
      where: { sessionId: id, organizationId: ctx.session.orgId },
      include: {
        gradedBy: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return ok(grades);
  }, "academics.read");
}

// Replace-all per session (mirrors attendance semantics)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, gradesSchema);
    const labSession = await loadSession(id, ctx.session.orgId);
    assertCanGrade(ctx.session.role, ctx.session.userId, labSession.instructorId);

    const count = await db.$transaction(async (tx) => {
      await tx.grade.deleteMany({ where: { sessionId: id } });
      const res = await tx.grade.createMany({
        data: data.records.map((r) => ({
          organizationId: ctx.session.orgId,
          sessionId: id,
          experimentId: labSession.experimentId,
          studentName: r.studentName,
          userId: r.userId ?? null,
          score: r.score,
          maxScore: r.maxScore,
          remarks: r.remarks ?? null,
          gradedById: ctx.session.userId,
        })),
      });
      return res.count;
    });

    const grades = await db.grade.findMany({
      where: { sessionId: id, organizationId: ctx.session.orgId },
      orderBy: { createdAt: "asc" },
    });

    await audit(ctx.session.orgId, ctx.session.userId, "GRADES_RECORDED", "LabSession", id, {
      count,
      session: labSession.title,
    });
    return ok({ success: true, count, grades }, 201);
  });
}
