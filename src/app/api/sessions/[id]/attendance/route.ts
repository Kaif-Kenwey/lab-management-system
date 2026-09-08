import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody } from "@/lib/validation";
import { NotFoundError } from "@/lib/errors";
import { ATTENDANCE_STATUS } from "@/lib/constants";

const attendanceSchema = z.object({
  records: z
    .array(
      z.object({
        studentName: z.string().trim().min(1, "Each record requires a studentName").max(120),
        userId: z.string().max(64).nullish(),
        status: z.enum(ATTENDANCE_STATUS).optional().default("PRESENT"),
      })
    )
    .min(1, "records array is required"),
});

// Replace-all semantics: an update wipes and re-creates the session's attendance.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, attendanceSchema);

    const labSession = await db.labSession.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true, title: true },
    });
    if (!labSession) throw NotFoundError("Session not found");

    const count = await db.$transaction(async (tx) => {
      await tx.attendance.deleteMany({ where: { sessionId: id } });
      const res = await tx.attendance.createMany({
        data: data.records.map((r) => ({
          organizationId: ctx.session.orgId,
          sessionId: id,
          studentName: r.studentName,
          userId: r.userId ?? null,
          status: r.status,
        })),
      });
      return res.count;
    });

    const attendance = await db.attendance.findMany({
      where: { sessionId: id },
      orderBy: { markedAt: "asc" },
    });

    await audit(ctx.session.orgId, ctx.session.userId, "ATTENDANCE_MARKED", "LabSession", id, {
      count,
      session: labSession.title,
    });
    return ok({ success: true, count, attendance }, 201);
  }, "academics.manage");
}
