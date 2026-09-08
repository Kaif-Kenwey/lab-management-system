import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, withAuth } from "@/lib/api";
import { deriveCalibrationStatus } from "@/lib/business-rules";

/**
 * Scans real operational data and inserts MISSING notifications (dedupe on
 * unread + title + entityId). Used by the bell refresh.
 */
export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const orgId = ctx.session.orgId;
    const now = new Date();
    const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [
      overdueCheckouts,
      inventoryItems,
      chemicals,
      calibrations,
      pendingReservations,
      pendingRequests,
      unread,
   ] = await Promise.all([
      db.checkout.findMany({
        where: { organizationId: orgId, status: "ACTIVE", dueAt: { lt: now } },
        select: { id: true, equipment: { select: { name: true } } },
        take: 200,
      }),
      db.inventoryItem.findMany({
        where: { organizationId: orgId },
        select: { id: true, name: true, sku: true, unit: true, quantity: true, minQuantity: true },
        take: 1000,
      }),
      db.chemical.findMany({
        where: { organizationId: orgId, expiryDate: { lte: in30d } },
        select: { id: true, name: true, expiryDate: true },
        take: 200,
      }),
      db.calibrationRecord.findMany({
        where: { organizationId: orgId, result: { not: "FAIL" } },
        select: { id: true, result: true, nextDueAt: true, equipmentId: true, equipment: { select: { name: true } } },
        take: 500,
      }),
      db.reservation.findMany({
        where: { organizationId: orgId, status: "PENDING" },
        select: {
          id: true,
          purpose: true,
          equipment: { select: { name: true } },
          user: { select: { name: true } },
        },
        take: 200,
      }),
      db.purchaseRequest.findMany({
        where: { organizationId: orgId, status: "SUBMITTED" },
        select: { id: true, itemName: true, requestedBy: { select: { name: true } } },
        take: 200,
      }),
      db.notification.findMany({
        where: { organizationId: orgId, read: false },
        select: { title: true, entityId: true },
        take: 1000,
      }),
    ]);

    // Dedupe set: unread notifications with the same title+entityId already exist
    const seen = new Set(unread.map((n) => `${n.title}::${n.entityId ?? ""}`));
    const candidates: {
      title: string;
      body: string;
      type: "INFO" | "WARNING" | "ERROR";
      entityType: string;
      entityId: string;
    }[] = [];

    for (const c of overdueCheckouts) {
      candidates.push({
        title: "Overdue equipment checkout",
        body: `${c.equipment.name} is past its due date and has not been checked in.`,
        type: "WARNING",
        entityType: "Checkout",
        entityId: c.id,
      });
    }

    for (const item of inventoryItems) {
      if (item.quantity <= item.minQuantity) {
        candidates.push({
          title: "Low stock alert",
          body: `${item.name} (${item.sku}) is at or below its reorder level: ${item.quantity} ${item.unit} remaining.`,
          type: "WARNING",
          entityType: "InventoryItem",
          entityId: item.id,
        });
      }
    }

    for (const chem of chemicals) {
      const expired = chem.expiryDate ? chem.expiryDate.getTime() < now.getTime() : false;
      candidates.push({
        title: expired ? "Chemical expired" : "Chemical expiring soon",
        body: `${chem.name}'s expiry date is ${chem.expiryDate?.toISOString().slice(0, 10) ?? "unknown"}.`,
        type: "WARNING",
        entityType: "Chemical",
        entityId: chem.id,
      });
    }

    for (const cal of calibrations) {
      const status = deriveCalibrationStatus(cal.result, cal.nextDueAt, now);
      if (status === "DUE_SOON" || status === "OVERDUE") {
        candidates.push({
          title: status === "OVERDUE" ? "Calibration overdue" : "Calibration due soon",
          body: `${cal.equipment.name} calibration is ${status === "OVERDUE" ? "overdue" : "due within 30 days"}.`,
          type: "WARNING",
          entityType: "Equipment",
          entityId: cal.equipmentId,
        });
      }
    }

    for (const r of pendingReservations) {
      candidates.push({
        title: "Reservation awaiting approval",
        body: `${r.user.name} requested ${r.equipment.name}${r.purpose ? ` — ${r.purpose}` : ""}.`,
        type: "INFO",
        entityType: "Reservation",
        entityId: r.id,
      });
    }

    for (const pr of pendingRequests) {
      candidates.push({
        title: "Purchase request pending approval",
        body: `${pr.requestedBy?.name ?? "Someone"} requested ${pr.itemName}.`,
        type: "INFO",
        entityType: "PurchaseRequest",
        entityId: pr.id,
      });
    }

    const missing = candidates.filter((c) => !seen.has(`${c.title}::${c.entityId}`));

    if (missing.length > 0) {
      await db.notification.createMany({
        data: missing.map((c) => ({
          organizationId: orgId,
          userId: null,
          title: c.title,
          body: c.body,
          type: c.type,
          entityType: c.entityType,
          entityId: c.entityId,
        })),
      });
    }

    return ok({ created: missing.length });
  });
}
