import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody } from "@/lib/validation";
import { INCIDENT_STATUS, INCIDENT_SEVERITY } from "@/lib/constants";
import { NotFoundError, ConflictError, ValidationError } from "@/lib/errors";

// Strict lifecycle: OPEN → INVESTIGATING → CONTAINED → RESOLVED → CLOSED
const INCIDENT_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["INVESTIGATING"],
  INVESTIGATING: ["CONTAINED"],
  CONTAINED: ["RESOLVED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
};

const updateIncidentSchema = z.object({
  status: z.enum(INCIDENT_STATUS).optional(),
  severity: z.enum(INCIDENT_SEVERITY).optional(),
  rootCause: z.string().max(2000).nullish(),
  correctiveAction: z.string().max(2000).nullish(),
  preventiveAction: z.string().max(2000).nullish(),
  responsiblePerson: z.string().max(120).nullish(),
  closureNotes: z.string().max(2000).nullish(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, updateIncidentSchema);

    const incident = await db.incident.findFirst({ where: { id, organizationId: ctx.session.orgId } });
    if (!incident) throw NotFoundError("Incident not found");

    const data2: Record<string, unknown> = {
      ...(data.severity !== undefined ? { severity: data.severity } : {}),
      ...(data.rootCause !== undefined ? { rootCause: data.rootCause ?? null } : {}),
      ...(data.correctiveAction !== undefined ? { correctiveAction: data.correctiveAction ?? null } : {}),
      ...(data.preventiveAction !== undefined ? { preventiveAction: data.preventiveAction ?? null } : {}),
      ...(data.responsiblePerson !== undefined ? { responsiblePerson: data.responsiblePerson ?? null } : {}),
      ...(data.closureNotes !== undefined ? { closureNotes: data.closureNotes ?? null } : {}),
    };

    if (data.status && data.status !== incident.status) {
      const allowed = INCIDENT_TRANSITIONS[incident.status] ?? [];
      if (!allowed.includes(data.status)) {
        throw ConflictError(`Invalid incident transition: ${incident.status} → ${data.status}`);
      }
      data2.status = data.status;

      if (data.status === "CONTAINED") data2.containedAt = new Date();
      if (data.status === "RESOLVED") {
        const rootCause = (data.rootCause ?? incident.rootCause ?? "").trim();
        if (!rootCause) {
          throw ValidationError("rootCause is required to resolve an incident");
        }
        data2.resolvedAt = new Date();
      }
      if (data.status === "CLOSED") data2.closedAt = new Date();
    }

    const updated = await db.incident.update({
      where: { id },
      data: data2,
      include: {
        lab: { select: { id: true, name: true, code: true } },
        reportedBy: { select: { id: true, name: true } },
      },
    });
    await audit(ctx.session.orgId, ctx.session.userId, "INCIDENT_UPDATED", "Incident", id, {
      status: updated.status,
      severity: updated.severity,
    });
    return ok(updated);
  }, "incidents.manage");
}
