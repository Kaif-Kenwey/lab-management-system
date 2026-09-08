import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

const INCIDENT_STATUSES = ["OPEN", "INVESTIGATING", "RESOLVED"];
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const b = await body<{
      status?: string;
      severity?: string;
      description?: string | null;
    }>(req);

    if (b.status && !INCIDENT_STATUSES.includes(b.status)) {
      return fail(`Invalid status — must be one of: ${INCIDENT_STATUSES.join(", ")}`);
    }
    if (b.severity && !SEVERITIES.includes(b.severity)) {
      return fail(`Invalid severity — must be one of: ${SEVERITIES.join(", ")}`);
    }

    const incident = await db.incident.findFirst({ where: { id, organizationId: session.orgId } });
    if (!incident) return fail("Incident not found", 404);

    const data: Prisma.IncidentUncheckedUpdateInput = {};
    if (b.status !== undefined) data.status = b.status;
    if (b.severity !== undefined) data.severity = b.severity;
    if (b.description !== undefined) data.description = b.description;

    const updated = await db.incident.update({
      where: { id },
      data,
      include: {
        lab: { select: { id: true, name: true, code: true } },
        reportedBy: { select: { id: true, name: true } },
      },
    });
    await audit(session.orgId, session.userId, "INCIDENT_UPDATED", "Incident", id, {
      status: updated.status,
      severity: updated.severity,
    });
    return ok(updated);
  }, ["ADMIN", "LAB_MANAGER", "TECHNICIAN", "INSTRUCTOR"]);
}
