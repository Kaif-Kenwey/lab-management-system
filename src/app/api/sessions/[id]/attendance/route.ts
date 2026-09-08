import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

interface AttendanceRecord {
  studentName?: string;
  userId?: string;
  status?: string;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const b = await body<{ records?: AttendanceRecord[] }>(req);

    if (!Array.isArray(b.records) || b.records.length === 0) {
      return fail("records array is required", 400);
    }
    for (const r of b.records) {
      if (!r?.studentName?.trim()) return fail("Each record requires a studentName", 400);
      if (r.status && !["PRESENT", "ABSENT", "LATE"].includes(r.status)) {
        return fail("Invalid attendance status — must be PRESENT, ABSENT or LATE", 400);
      }
    }

    const labSession = await db.labSession.findFirst({ where: { id, organizationId: session.orgId } });
    if (!labSession) return fail("Session not found", 404);

    const count = await db.$transaction(async (tx) => {
      // Replace-all semantics: clear existing attendance, then insert new records
      await tx.attendance.deleteMany({ where: { sessionId: id } });
      const res = await tx.attendance.createMany({
        data: b.records!.map((r) => ({
          organizationId: session.orgId,
          sessionId: id,
          studentName: r.studentName!.trim(),
          userId: r.userId ?? null,
          status: r.status ?? "PRESENT",
        })),
      });
      return res.count;
    });

    const attendance = await db.attendance.findMany({
      where: { sessionId: id },
      orderBy: { markedAt: "asc" },
    });

    await audit(session.orgId, session.userId, "ATTENDANCE_MARKED", "LabSession", id, {
      count,
      session: labSession.title,
    });
    return ok({ success: true, count, attendance }, 201);
  }, ["ADMIN", "LAB_MANAGER", "INSTRUCTOR"]);
}
