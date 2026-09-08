import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

export async function GET(req: NextRequest) {
  return withAuth(async (session) => {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const where: Prisma.LabWhereInput = {
      organizationId: session.orgId,
      ...(q ? { OR: [{ name: { contains: q } }, { code: { contains: q } }] } : {}),
    };
    const labs = await db.lab.findMany({
      where,
      include: {
        manager: { select: { id: true, name: true, email: true } },
        _count: { select: { equipment: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return ok(labs);
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async (session) => {
    const b = await body<{
      name?: string;
      code?: string;
      location?: string;
      capacity?: number | string;
      description?: string;
      managerId?: string;
    }>(req);

    if (!b.name?.trim() || !b.code?.trim()) return fail("Lab name and code are required");

    const capacity =
      b.capacity === undefined || b.capacity === null || b.capacity === ""
        ? 0
        : Number(b.capacity);
    if (Number.isNaN(capacity) || capacity < 0) return fail("Capacity must be a non-negative number");

    if (b.managerId) {
      const manager = await db.user.findFirst({
        where: { id: b.managerId, organizationId: session.orgId },
      });
      if (!manager) return fail("Manager not found in your organization", 404);
    }

    try {
      const lab = await db.lab.create({
        data: {
          organizationId: session.orgId,
          name: b.name.trim(),
          code: b.code.trim(),
          location: b.location ?? null,
          capacity,
          description: b.description ?? null,
          managerId: b.managerId ?? null,
        },
        include: {
          manager: { select: { id: true, name: true, email: true } },
          _count: { select: { equipment: true } },
        },
      });
      await audit(session.orgId, session.userId, "LAB_CREATED", "Lab", lab.id, {
        name: lab.name,
        code: lab.code,
      });
      return ok(lab, 201);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return fail("A lab with this code already exists in your organization", 409);
      }
      throw e;
    }
  }, ["ADMIN", "LAB_MANAGER"]);
}
