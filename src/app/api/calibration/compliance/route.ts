import { db } from "@/lib/db";
import { ok, withAuth } from "@/lib/api";

/**
 * Calibration compliance KPIs (Phase 11).
 * Statuses are recomputed live from result + nextDueAt so the metric can
 * never drift from the underlying records.
 */
export async function GET(req: Request) {
  return withAuth(req, async (ctx) => {
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const records = await db.calibrationRecord.findMany({
      where: { organizationId: ctx.session.orgId },
      select: { result: true, nextDueAt: true },
    });

    let valid = 0;
    let dueSoon = 0;
    let overdue = 0;
    let failed = 0;

    for (const r of records) {
      if (r.result === "PENDING") {
        // Not yet performed — count as overdue if the due date passed
        if (r.nextDueAt.getTime() < now.getTime()) overdue += 1;
        else dueSoon += 1;
        continue;
      }
      if (r.result === "FAIL") {
        failed += 1;
      } else if (r.nextDueAt.getTime() < now.getTime()) {
        overdue += 1;
      } else if (r.nextDueAt.getTime() < soon.getTime()) {
        dueSoon += 1;
      } else {
        valid += 1;
      }
    }

    const total = records.length;
    const compliancePct = total === 0 ? 100 : Math.round(((valid + dueSoon) / total) * 100);

    return ok({ total, valid, dueSoon, overdue, failed, compliancePct });
  }, "calibration.read");
}
