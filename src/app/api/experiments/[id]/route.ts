import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, body, withAuth, audit } from "@/lib/api";

const EXPERIMENT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const b = await body<{
      title?: string;
      code?: string;
      labId?: string;
      description?: string | null;
      instructorId?: string | null;
      status?: string;
    }>(req);

    if (b.status && !EXPERIMENT_STATUSES.includes(b.status)) {
      return fail(`Invalid status — must be one of: ${EXPERIMENT_STATUSES.join(", ")}`);
    }

    const experiment = await db.experiment.findFirst({
      where: { id, organizationId: session.orgId },
    });
    if (!experiment) return fail("Experiment not found", 404);

    if (b.labId) {
      const lab = await db.lab.findFirst({ where: { id: b.labId, organizationId: session.orgId } });
      if (!lab) return fail("Lab not found in your organization", 404);
    }
    if (b.instructorId) {
      const instructor = await db.user.findFirst({
        where: { id: b.instructorId, organizationId: session.orgId },
      });
      if (!instructor) return fail("Instructor not found in your organization", 404);
    }

    const data: Prisma.ExperimentUncheckedUpdateInput = {};
    if (b.title !== undefined) data.title = b.title.trim();
    if (b.code !== undefined) data.code = b.code.trim();
    if (b.labId !== undefined) data.labId = b.labId;
    if (b.description !== undefined) data.description = b.description;
    if (b.instructorId !== undefined) data.instructorId = b.instructorId;
    if (b.status !== undefined) data.status = b.status;

    try {
      const updated = await db.experiment.update({
        where: { id },
        data,
        include: {
          lab: { select: { id: true, name: true, code: true } },
          instructor: { select: { id: true, name: true } },
          _count: { select: { sessions: true } },
        },
      });
      await audit(session.orgId, session.userId, "EXPERIMENT_UPDATED", "Experiment", id, {
        title: updated.title,
      });
      return ok(updated);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return fail("An experiment with this code already exists in your organization", 409);
      }
      throw e;
    }
  }, ["ADMIN", "LAB_MANAGER", "INSTRUCTOR"]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(async (session) => {
    const experiment = await db.experiment.findFirst({
      where: { id, organizationId: session.orgId },
    });
    if (!experiment) return fail("Experiment not found", 404);

    try {
      await db.experiment.delete({ where: { id } });
      await audit(session.orgId, session.userId, "EXPERIMENT_DELETED", "Experiment", id, {
        title: experiment.title,
      });
      return ok({ success: true });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        return fail("This experiment has sessions and cannot be deleted", 409);
      }
      throw e;
    }
  }, ["ADMIN", "LAB_MANAGER", "INSTRUCTOR"]);
}
