import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export async function GET(req: NextRequest) {
  return withAuth(async (session) => {
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status")?.trim() ?? "";
    const severity = sp.get("severity")?.trim() ?? "";

    const where: Prisma.IncidentWhereInput = {
      organizationId: session.orgId,
      ...(status ? { status } : {}),
      ...(severity ? { severity } : {}),
    };

    const incidents = await db.incident.findMany({
      where,
      include: {
        lab: { select: { id: true, name: true, code: true } },
        reportedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return ok(incidents);
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async (session) => {
    const b = await body<{
      title?: string;
      labId?: string;
      description?: string;
      severity?: string;
      occurredAt?: string;
    }>(req);

    if (!b.title?.trim() || !b.labId) return fail("Title and lab are required");
    if (b.severity && !SEVERITIES.includes(b.severity)) {
      return fail(`Invalid severity — must be one of: ${SEVERITIES.join(", ")}`);
    }

    const lab = await db.lab.findFirst({ where: { id: b.labId, organizationId: session.orgId } });
    if (!lab) return fail("Lab not found in your organization", 404);

    let occurredAt = new Date();
    if (b.occurredAt) {
      occurredAt = new Date(b.occurredAt);
      if (Number.isNaN(occurredAt.getTime())) return fail("Invalid occurredAt date", 400);
    }

    const incident = await db.incident.create({
      data: {
        organizationId: session.orgId,
        labId: b.labId,
        title: b.title.trim(),
        description: b.description ?? null,
        severity: b.severity ?? "MEDIUM",
        status: "OPEN",
        occurredAt,
        reportedById: session.userId,
      },
      include: {
        lab: { select: { id: true, name: true, code: true } },
        reportedBy: { select: { id: true, name: true } },
      },
    });
    await audit(session.orgId, session.userId, "INCIDENT_REPORTED", "Incident", incident.id, {
      title: incident.title,
      lab: lab.name,
      severity: incident.severity,
    });
    return ok(incident, 201);
  });
}
