import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, withAuth } from "@/lib/api";

export async function GET(req: NextRequest) {
  return withAuth(async (session) => {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

    // NOTE: SQLite does not support mode: "insensitive" — plain contains only
    const where: Prisma.AuditLogWhereInput = {
      organizationId: session.orgId,
      ...(q ? { OR: [{ action: { contains: q } }, { entityType: { contains: q } }] } : {}),
    };

    const logs = await db.auditLog.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok(logs);
  }, ["ADMIN", "LAB_MANAGER"]);
}
