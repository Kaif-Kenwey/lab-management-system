import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, withAuth } from "@/lib/api";
import { can } from "@/lib/permissions";

interface SearchHit {
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const MAX_PER_GROUP = 5;

// Global search across modules. q must be >= 2 chars — otherwise every group
// comes back empty. The users group is only populated with users.manage.
export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const q = ctx.searchParams.get("q")?.trim() ?? "";
    const orgId = ctx.session.orgId;

    const empty: Record<string, SearchHit[]> = {
      labs: [],
      equipment: [],
      inventory: [],
      reservations: [],
      incidents: [],
      maintenance: [],
      experiments: [],
      users: [],
    };

    if (q.length < 2) return ok(empty);

    const [labs, equipment, inventory, reservations, incidents, maintenance, experiments, users] =
      await Promise.all([
        db.lab.findMany({
          where: { organizationId: orgId, OR: [{ name: { contains: q } }, { code: { contains: q } }] },
          select: { id: true, name: true, code: true },
          take: MAX_PER_GROUP,
        }),
        db.equipment.findMany({
          where: {
            organizationId: orgId,
            OR: [{ name: { contains: q } }, { code: { contains: q } }, { qrToken: { contains: q } }],
          },
          select: { id: true, name: true, code: true, status: true },
          take: MAX_PER_GROUP,
        }),
        db.inventoryItem.findMany({
          where: { organizationId: orgId, OR: [{ name: { contains: q } }, { sku: { contains: q } }] },
          select: { id: true, name: true, sku: true, quantity: true },
          take: MAX_PER_GROUP,
        }),
        db.reservation.findMany({
          where: { organizationId: orgId, equipment: { name: { contains: q } } },
          select: {
            id: true,
            status: true,
            equipment: { select: { name: true, code: true } },
          },
          take: MAX_PER_GROUP,
          orderBy: { startAt: "desc" },
        }),
        db.incident.findMany({
          where: { organizationId: orgId, title: { contains: q } },
          select: { id: true, title: true, severity: true, status: true },
          take: MAX_PER_GROUP,
          orderBy: { createdAt: "desc" },
        }),
        db.maintenanceRecord.findMany({
          where: {
            organizationId: orgId,
            OR: [{ title: { contains: q } }, { equipment: { name: { contains: q } } }],
          },
          select: { id: true, title: true, status: true, equipment: { select: { name: true } } },
          take: MAX_PER_GROUP,
          orderBy: { scheduledAt: "desc" },
        }),
        db.experiment.findMany({
          where: { organizationId: orgId, OR: [{ title: { contains: q } }, { code: { contains: q } }] },
          select: { id: true, title: true, code: true },
          take: MAX_PER_GROUP,
        }),
        can(ctx.session.role, "users.manage")
          ? db.user.findMany({
              where: {
                organizationId: orgId,
                OR: [{ name: { contains: q } }, { email: { contains: q } }],
              },
              select: { id: true, name: true, email: true, role: true },
              take: MAX_PER_GROUP,
            })
          : Promise.resolve([]),
      ]);

    return ok({
      labs: labs.map((l) => ({ id: l.id, title: l.name, subtitle: l.code, href: `/labs/${l.id}` })),
      equipment: equipment.map((e) => ({
        id: e.id,
        title: e.name,
        subtitle: e.code,
        href: `/equipment/${e.id}`,
      })),
      inventory: inventory.map((i) => ({
        id: i.id,
        title: i.name,
        subtitle: `${i.sku} · qty ${i.quantity}`,
        href: `/inventory?q=${encodeURIComponent(i.sku)}`,
      })),
      reservations: reservations.map((r) => ({
        id: r.id,
        title: r.equipment.name,
        subtitle: r.status,
        href: "/reservations",
      })),
      incidents: incidents.map((i) => ({
        id: i.id,
        title: i.title,
        subtitle: `${i.severity} · ${i.status}`,
        href: "/incidents",
      })),
      maintenance: maintenance.map((m) => ({
        id: m.id,
        title: m.title,
        subtitle: m.equipment.name,
        href: "/maintenance",
      })),
      experiments: experiments.map((e) => ({
        id: e.id,
        title: e.title,
        subtitle: e.code,
        href: "/academics",
      })),
      users: users.map((u) => ({
        id: u.id,
        title: u.name,
        subtitle: `${u.email} · ${u.role}`,
        href: "/settings",
      })),
    });
  });
}
