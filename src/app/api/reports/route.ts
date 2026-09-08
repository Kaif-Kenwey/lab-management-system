import { NextRequest } from "next/server";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { ok, withAuth } from "@/lib/api";
import { deriveCalibrationStatus } from "@/lib/business-rules";
import { ValidationError } from "@/lib/errors";

const PERIOD_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 30, quarterly: 90 };

function monthBuckets(count: number) {
  const buckets: { label: string; start: Date; end: Date }[] = [];
  const base = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const end = new Date(base.getFullYear(), base.getMonth() - i + 1, 1);
    buckets.push({ label: format(start, "MMM"), start, end });
  }
  return buckets;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// KPI report computed from real data, scoped to the current organization.
export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const period = ctx.searchParams.get("period") ?? "monthly";
    const days = PERIOD_DAYS[period];
    if (!days) {
      throw ValidationError("Invalid period — must be daily, weekly, monthly or quarterly");
    }

    const orgId = ctx.session.orgId;
    const now = new Date();
    const windowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const last90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [
      utilizationReservations,
      maintenanceRecords,
      issueTx,
      incidents,
      calibrations,
      stockRows,
      windowReservations,
      downtimeRecords,
    ] = await Promise.all([
      db.reservation.findMany({
        where: {
          organizationId: orgId,
          status: { in: ["APPROVED", "ACTIVE", "COMPLETED"] },
          startAt: { lt: now },
          endAt: { gt: windowStart },
        },
        select: { startAt: true, endAt: true, equipment: { select: { name: true } } },
      }),
      db.maintenanceRecord.findMany({
        where: { organizationId: orgId, status: { not: "CANCELLED" }, scheduledAt: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } },
        select: { laborCost: true, partsCost: true, completedAt: true, scheduledAt: true, status: true, downtimeHours: true, equipment: { select: { name: true } } },
      }),
      db.inventoryTransaction.findMany({
        where: { organizationId: orgId, type: "ISSUE", createdAt: { gte: windowStart } },
        select: { quantity: true, createdAt: true },
      }),
      db.incident.findMany({
        where: { organizationId: orgId, occurredAt: { gte: windowStart } },
        select: { severity: true },
      }),
      db.calibrationRecord.findMany({
        where: { organizationId: orgId },
        select: { result: true, nextDueAt: true },
      }),
      db.inventoryItem.findMany({
        where: { organizationId: orgId },
        select: { quantity: true },
      }),
      db.reservation.findMany({
        where: { organizationId: orgId, createdAt: { gte: windowStart } },
        select: { status: true },
      }),
      db.maintenanceRecord.findMany({
        where: { organizationId: orgId, completedAt: { gte: last90d }, downtimeHours: { not: null } },
        select: { downtimeHours: true, equipment: { select: { name: true } } },
      }),
    ]);

    // Equipment utilization: overlap of each reservation with the window, top 8
    const hoursByEquipment = new Map<string, number>();
    for (const r of utilizationReservations) {
      const start = Math.max(r.startAt.getTime(), windowStart.getTime());
      const end = Math.min(r.endAt.getTime(), now.getTime());
      if (end <= start) continue;
      const hours = (end - start) / 3_600_000;
      hoursByEquipment.set(
        r.equipment.name,
        (hoursByEquipment.get(r.equipment.name) ?? 0) + hours
      );
    }
    const equipmentUtilization = [...hoursByEquipment.entries()]
      .map(([name, hours]) => ({ name, hours: round1(hours) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8);

    // Maintenance cost per month (last 6 buckets)
    const costBuckets = monthBuckets(6);
    const maintenanceCostByMonth = costBuckets.map((b) => ({ label: b.label, labor: 0, parts: 0 }));
    for (const m of maintenanceRecords) {
      const at = (m.completedAt ?? m.scheduledAt) as Date;
      const idx = costBuckets.findIndex((b) => at >= b.start && at < b.end);
      if (idx === -1) continue;
      maintenanceCostByMonth[idx].labor += m.laborCost;
      maintenanceCostByMonth[idx].parts += m.partsCost;
    }

    // Inventory consumption (ISSUE quantities in-window, per month bucket)
    const issuedByMonth = new Map<string, number>();
    for (const tx of issueTx) {
      const label = format(tx.createdAt, "MMM");
      issuedByMonth.set(label, (issuedByMonth.get(label) ?? 0) + tx.quantity);
    }
    const inventoryConsumption = costBuckets.map((b) => ({
      label: b.label,
      issued: issuedByMonth.get(b.label) ?? 0,
    }));

    // Incidents by severity inside the window
    const incidentsBySeverity = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const i of incidents) {
      if (i.severity in incidentsBySeverity) {
        incidentsBySeverity[i.severity as keyof typeof incidentsBySeverity] += 1;
      }
    }

    // Calibration compliance (derived statuses)
    const calibrationCompliance = { valid: 0, dueSoon: 0, overdue: 0, failed: 0, total: calibrations.length, compliancePct: 0 };
    for (const c of calibrations) {
      const status = deriveCalibrationStatus(c.result, c.nextDueAt, now);
      if (status === "VALID") calibrationCompliance.valid += 1;
      else if (status === "DUE_SOON") calibrationCompliance.dueSoon += 1;
      else if (status === "OVERDUE") calibrationCompliance.overdue += 1;
      else if (status === "FAILED") calibrationCompliance.failed += 1;
    }
    calibrationCompliance.compliancePct = calibrationCompliance.total
      ? round1((calibrationCompliance.valid / calibrationCompliance.total) * 100)
      : 0;

    // Stock-out rate
    const stockOutItems = stockRows.filter((i) => i.quantity === 0).length;
    const stockOutRate = stockRows.length ? round1((stockOutItems / stockRows.length) * 100) : 0;

    // Reservation fulfillment inside the window
    const fulfilled = { completed: 0, cancelled: 0, noShow: 0 };
    for (const r of windowReservations) {
      if (r.status === "COMPLETED") fulfilled.completed += 1;
      else if (r.status === "CANCELLED") fulfilled.cancelled += 1;
      else if (r.status === "NO_SHOW") fulfilled.noShow += 1;
    }
    const decided = fulfilled.completed + fulfilled.cancelled + fulfilled.noShow;
    const reservationFulfillment = {
      ...fulfilled,
      fulfillmentPct: decided ? round1((fulfilled.completed / decided) * 100) : 0,
    };

    // Downtime hours by equipment (last 90 days, top 8)
    const downtimeByEquipment = new Map<string, number>();
    for (const m of downtimeRecords) {
      const hours = m.downtimeHours ?? 0;
      downtimeByEquipment.set(m.equipment.name, (downtimeByEquipment.get(m.equipment.name) ?? 0) + hours);
    }
    const downtimeHoursByEquipment = [...downtimeByEquipment.entries()]
      .map(([name, hours]) => ({ name, hours: round1(hours) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8);

    return ok({
      period,
      windowStart: windowStart.toISOString(),
      equipmentUtilization,
      maintenanceCostByMonth,
      inventoryConsumption,
      incidentsBySeverity,
      calibrationCompliance,
      stockOutRate,
      reservationFulfillment,
      downtimeHoursByEquipment,
    });
  }, "reports.read");
}
