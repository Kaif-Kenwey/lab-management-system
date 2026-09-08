import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, withAuth } from "@/lib/api";

const SEVERITY_WEIGHT: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

interface AttentionItem {
  key: string;
  label: string;
  count: number;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  href: string;
}

// Real-time "needs attention" feed for operations dashboards.
export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const orgId = ctx.session.orgId;
    const now = new Date();
    const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [
      overdueCheckouts,
      lowStockRows,
      calibrationDue,
      criticalIncidents,
      maintenanceActive,
      pendingReservations,
      pendingPurchases,
      expiringChemicals,
    ] = await Promise.all([
      db.checkout.count({
        where: { organizationId: orgId, OR: [{ status: "OVERDUE" }, { status: "ACTIVE", dueAt: { lt: now } }] },
      }),
      // field-to-field comparison not portable on SQLite — filter in JS
      db.inventoryItem.findMany({
        where: { organizationId: orgId },
        select: { quantity: true, minQuantity: true },
      }),
      db.calibrationRecord.count({
        where: { organizationId: orgId, nextDueAt: { lt: in30d }, result: { not: "FAIL" } },
      }),
      db.incident.count({
        where: {
          organizationId: orgId,
          status: { in: ["OPEN", "INVESTIGATING"] },
          severity: { in: ["CRITICAL", "HIGH"] },
        },
      }),
      db.maintenanceRecord.count({
        where: { organizationId: orgId, status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_PARTS"] } },
      }),
      db.reservation.count({ where: { organizationId: orgId, status: "PENDING" } }),
      db.purchaseRequest.count({ where: { organizationId: orgId, status: "SUBMITTED" } }),
      db.chemical.count({ where: { organizationId: orgId, expiryDate: { lte: in30d } } }),
    ]);

    const lowStock = lowStockRows.filter((i) => i.quantity <= i.minQuantity).length;

    const items: AttentionItem[] = [
      { key: "overdueCheckouts", label: "Overdue equipment checkouts", count: overdueCheckouts, severity: "HIGH", href: "/checkouts?status=OVERDUE" },
      { key: "lowStock", label: "Low stock items", count: lowStock, severity: "MEDIUM", href: "/inventory?lowStock=true" },
      { key: "calibrationDue", label: "Calibrations due or overdue", count: calibrationDue, severity: "HIGH", href: "/maintenance?tab=calibration" },
      { key: "criticalIncidents", label: "Critical open incidents", count: criticalIncidents, severity: "CRITICAL", href: "/incidents?severity=CRITICAL" },
      { key: "maintenanceActive", label: "Active maintenance work orders", count: maintenanceActive, severity: "MEDIUM", href: "/maintenance" },
      { key: "pendingReservations", label: "Reservations awaiting approval", count: pendingReservations, severity: "MEDIUM", href: "/reservations?status=PENDING" },
      { key: "pendingPurchases", label: "Purchase requests awaiting approval", count: pendingPurchases, severity: "LOW", href: "/procurement?tab=requests" },
      { key: "expiringChemicals", label: "Chemicals expiring within 30 days", count: expiringChemicals, severity: "MEDIUM", href: "/chemicals?expiring=true" },
    ];

    return ok({
      items: items
        .filter((i) => i.count > 0)
        .sort((a, b) => SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity]),
      generatedAt: now.toISOString(),
    });
  });
}
