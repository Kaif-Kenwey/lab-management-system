import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { parseBody, optionalDateString } from "@/lib/validation";
import { INCIDENT_TYPE, INCIDENT_SEVERITY } from "@/lib/constants";
import { notifyMany } from "@/lib/notify";
import { NotFoundError } from "@/lib/errors";

const incidentInclude = {
  lab: { select: { id: true, name: true, code: true } },
  reportedBy: { select: { id: true, name: true } },
} satisfies Prisma.IncidentInclude;

export const reportIncidentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  labId: z.string().min(1, "Lab is required"),
  type: z.enum(INCIDENT_TYPE).optional().default("OTHER"),
  severity: z.enum(INCIDENT_SEVERITY).optional().default("MEDIUM"),
  description: z.string().max(2000).nullish(),
  occurredAt: optionalDateString,
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const status = ctx.searchParams.get("status")?.trim() ?? "";
    const severity = ctx.searchParams.get("severity")?.trim() ?? "";
    const type = ctx.searchParams.get("type")?.trim() ?? "";
    const q = ctx.searchParams.get("q")?.trim() ?? "";

    const incidents = await db.incident.findMany({
      where: {
        organizationId: ctx.session.orgId,
        ...(status ? { status } : {}),
        ...(severity ? { severity } : {}),
        ...(type ? { type } : {}),
        ...(q ? { OR: [{ title: { contains: q } }, { description: { contains: q } }] } : {}),
      },
      include: incidentInclude,
      orderBy: { createdAt: "desc" },
    });
    return ok(incidents);
  }, "incidents.read");
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const data = await parseBody(req, reportIncidentSchema);

    const lab = await db.lab.findFirst({
      where: { id: data.labId, organizationId: ctx.session.orgId },
      select: { id: true, name: true },
    });
    if (!lab) throw NotFoundError("Lab not found in your organization");

    const incident = await db.incident.create({
      data: {
        organizationId: ctx.session.orgId,
        labId: data.labId,
        reportedById: ctx.session.userId,
        type: data.type,
        title: data.title,
        description: data.description ?? null,
        severity: data.severity,
        occurredAt: data.occurredAt ?? new Date(),
      },
      include: incidentInclude,
    });
    await audit(ctx.session.orgId, ctx.session.userId, "INCIDENT_REPORTED", "Incident", incident.id, {
      title: incident.title,
      severity: incident.severity,
      type: incident.type,
    });

    // CRITICAL incidents fan out to all admins + lab managers
    if (incident.severity === "CRITICAL") {
      const managers = await db.user.findMany({
        where: { organizationId: ctx.session.orgId, role: { in: ["ADMIN", "LAB_MANAGER"] } },
        select: { id: true },
      });
      await notifyMany(
        db,
        ctx.session.orgId,
        managers.map((m) => m.id),
        {
          title: "Critical incident reported",
          body: `${incident.title} in ${lab.name}`,
          type: "ERROR",
          entityType: "Incident",
          entityId: incident.id,
        }
      );
    }

    return ok(incident, 201);
  }, "incidents.report");
}
