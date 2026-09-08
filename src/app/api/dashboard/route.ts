import { db } from "@/lib/db";
import { ok, withAuth } from "@/lib/api";

export async function GET() {
  return withAuth(async (session) => {
    const now = new Date();

    const [
      labs,
      equipment,
      availableEquipment,
      underMaintenance,
      activeCheckouts,
      overdueCheckouts,
      pendingReservations,
      openIncidents,
      members,
      invItems,
      categoryGroups,
      labsForUtilization,
      upcoming,
      recentAudit,
    ] = await Promise.all([
      db.lab.count({ where: { organizationId: session.orgId } }),
      db.equipment.count({ where: { organizationId: session.orgId } }),
      db.equipment.count({ where: { organizationId: session.orgId, status: "AVAILABLE" } }),
      db.equipment.count({ where: { organizationId: session.orgId, status: "UNDER_MAINTENANCE" } }),
      db.checkout.count({ where: { organizationId: session.orgId, status: "ACTIVE" } }),
      db.checkout.count({
        where: {
          organizationId: session.orgId,
          OR: [{ status: "OVERDUE" }, { status: "ACTIVE", dueAt: { lt: now } }],
        },
      }),
      db.reservation.count({ where: { organizationId: session.orgId, status: "PENDING" } }),
      db.incident.count({ where: { organizationId: session.orgId, status: "OPEN" } }),
      db.user.count({ where: { organizationId: session.orgId } }),
      // lowStockItems needs quantity <= minQuantity — field reference not used for SQLite safety,
      // so fetch the two columns and count in JS
      db.inventoryItem.findMany({
        where: { organizationId: session.orgId },
        select: { quantity: true, minQuantity: true },
      }),
      db.equipment.groupBy({
        by: ["category"],
        where: { organizationId: session.orgId },
        _count: { _all: true },
        orderBy: { category: "asc" },
      }),
      db.lab.findMany({
        where: { organizationId: session.orgId },
        select: { name: true, _count: { select: { equipment: true } } },
      }),
      db.labSession.findMany({
        where: {
          organizationId: session.orgId,
          scheduledAt: { gte: now },
          status: "SCHEDULED",
        },
        include: {
          experiment: { select: { title: true, code: true } },
          lab: { select: { name: true } },
          instructor: { select: { name: true } },
        },
        orderBy: { scheduledAt: "asc" },
        take: 5,
      }),
      db.auditLog.findMany({
        where: { organizationId: session.orgId },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const lowStockItems = invItems.filter((i) => i.quantity <= i.minQuantity).length;

    const byCategory = categoryGroups.map((g) => ({
      category: g.category,
      count: g._count._all,
    }));

    const utilization = labsForUtilization
      .map((l) => ({ name: l.name, value: l._count.equipment }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return ok({
      stats: {
        labs,
        equipment,
        availableEquipment,
        underMaintenance,
        activeCheckouts,
        overdueCheckouts,
        pendingReservations,
        lowStockItems,
        openIncidents,
        members,
      },
      byCategory,
      utilization,
      upcoming,
      recentAudit,
    });
  });
}
