import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth } from "@/lib/api";

export async function GET() {
  return withAuth(async (session) => {
    const notifications = await db.notification.findMany({
      // Latest 20 for this user OR org-wide notifications (userId null)
      where: {
        organizationId: session.orgId,
        OR: [{ userId: session.userId }, { userId: null }],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return ok(notifications);
  });
}

export async function PATCH(req: NextRequest) {
  return withAuth(async (session) => {
    const b = await body<{ markAllRead?: boolean }>(req);
    if (!b.markAllRead) return fail("markAllRead must be true", 400);

    // Only mark the user's own notifications as read — org-wide ones stay untouched
    const res = await db.notification.updateMany({
      where: {
        organizationId: session.orgId,
        userId: session.userId,
        read: false,
      },
      data: { read: true },
    });
    return ok({ success: true, count: res.count });
  });
}
