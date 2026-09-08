import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth } from "@/lib/api";
import { parseBody } from "@/lib/validation";
import { NotFoundError } from "@/lib/errors";

// Latest 25 notifications: the user's own + org-wide (userId null), plus the
// unread count across that same visible set.
export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const visibleWhere = {
      organizationId: ctx.session.orgId,
      OR: [{ userId: ctx.session.userId }, { userId: null }],
    };

    const [items, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: visibleWhere,
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      db.notification.count({ where: { ...visibleWhere, read: false } }),
    ]);

    return ok({ items, unreadCount });
  });
}

const patchSchema = z
  .object({
    id: z.string().min(1).optional(),
    markAllRead: z.boolean().optional(),
  })
  .refine((v) => v.id || v.markAllRead, { message: "Provide a notification id or markAllRead: true" });

export async function PATCH(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, patchSchema);
    const visibleWhere = {
      organizationId: ctx.session.orgId,
      OR: [{ userId: ctx.session.userId }, { userId: null }],
    };

    if (data.id) {
      const res = await db.notification.updateMany({
        where: { ...visibleWhere, id: data.id },
        data: { read: true },
      });
      if (res.count === 0) throw NotFoundError("Notification not found");
      return ok({ success: true, count: res.count });
    }

    // markAllRead — every notification visible to this user
    const res = await db.notification.updateMany({
      where: { ...visibleWhere, read: false },
      data: { read: true },
    });
    return ok({ success: true, count: res.count });
  });
}
