import { NextRequest } from "next/server";
import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { ok, fail, withAuth, audit } from "@/lib/api";
import { parseBody } from "@/lib/validation";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { can } from "@/lib/permissions";

const assistantSchema = z.object({
  question: z.string().trim().min(3, "Ask a question (min 3 characters)").max(500),
});

interface Source {
  label: string;
  href: string;
}

/**
 * AI LAB ASSISTANT (Phase 22)
 *
 * Architecture: user question → permission check → gather ONLY authorized,
 * org-scoped, role-appropriate data as compact structured context → LLM →
 * answer + sources. The database is NEVER sent wholesale; context is a
 * curated digest (counts + top rows) derived server-side from the session's
 * organization. The LLM cannot reach data the caller couldn't read.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "ai:assistant"), 10, 60_000);
  if (!rl.allowed) {
    return fail("RATE_LIMITED", `Too many requests — retry in ${rl.retryAfterSec}s`, 429);
  }

  return withAuth(req, async (ctx) => {
    const { question } = await parseBody(req, assistantSchema);
    const orgId = ctx.session.orgId;
    const role = ctx.session.role;
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const sources: Source[] = [];

    // ---- Permission-scoped context pack (never the whole DB) ----
    const lines: string[] = [];
    lines.push(`Organization: ${ctx.session.orgSlug}`);
    lines.push(`Viewer role: ${role}`);
    lines.push(`Today: ${now.toISOString().slice(0, 10)}`);

    const [labCount, equipmentByStatus, members] = await Promise.all([
      db.lab.count({ where: { organizationId: orgId } }),
      db.equipment.groupBy({
        by: ["status"],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
      db.user.count({ where: { organizationId: orgId } }),
    ]);
    lines.push(`Labs: ${labCount}; Team members: ${members}`);
    lines.push(
      `Equipment: ${equipmentByStatus.map((e) => `${e._count._all} ${e.status}`).join(", ") || "none"}`
    );

    // Overdue checkouts
    const overdueCheckouts = await db.checkout.findMany({
      where: { organizationId: orgId, status: "ACTIVE", dueAt: { lt: now } },
      select: {
        dueAt: true,
        equipment: { select: { name: true, code: true } },
        user: { select: { name: true } },
      },
      take: 5,
      orderBy: { dueAt: "asc" },
    });
    if (overdueCheckouts.length > 0) {
      lines.push(
        `Overdue checkouts (${overdueCheckouts.length}): ` +
          overdueCheckouts
            .map((c) => `${c.equipment.name} [${c.equipment.code}] from ${c.user?.name ?? "?"}, due ${c.dueAt.toISOString().slice(0, 10)}`)
            .join("; ")
      );
      sources.push({ label: "Overdue checkouts", href: "/checkouts?status=OVERDUE" });
    }

    // Low stock
    const lowStock = await db.inventoryItem.findMany({
      where: { organizationId: orgId, quantity: { lte: db.inventoryItem.fields.minQuantity } },
      select: { name: true, sku: true, quantity: true, minQuantity: true, unit: true },
      take: 8,
      orderBy: { quantity: "asc" },
    });
    if (lowStock.length > 0) {
      lines.push(
        `Low-stock items (${lowStock.length}): ` +
          lowStock.map((i) => `${i.name} [${i.sku}] ${i.quantity}/${i.minQuantity} ${i.unit}`).join("; ")
      );
      sources.push({ label: "Low stock", href: "/inventory?lowStock=true" });
    }

    // Maintenance pressure (maintenance.read roles only)
    if (can(role, "maintenance.read")) {
      const activeOrders = await db.maintenanceRecord.findMany({
        where: {
          organizationId: orgId,
          status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_PARTS"] },
        },
        select: {
          title: true,
          priority: true,
          status: true,
          equipment: { select: { name: true, code: true } },
        },
        take: 6,
        orderBy: [{ priority: "asc" }, { scheduledAt: "asc" }],
      });
      if (activeOrders.length > 0) {
        lines.push(
          `Active maintenance work orders: ` +
            activeOrders.map((m) => `${m.title} on ${m.equipment.name} (${m.priority}/${m.status})`).join("; ")
        );
        sources.push({ label: "Maintenance", href: "/maintenance" });
      }

      // Downtime leaderboard (90d)
      const downtime = await db.maintenanceRecord.groupBy({
        by: ["equipmentId"],
        where: {
          organizationId: orgId,
          status: "COMPLETED",
          completedAt: { gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) },
          downtimeHours: { gt: 0 },
        },
        _sum: { downtimeHours: true, cost: true },
        orderBy: { _sum: { downtimeHours: "desc" } },
        take: 5,
      });
      if (downtime.length > 0) {
        const ids = downtime.map((d) => d.equipmentId);
        const eqs = await db.equipment.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, code: true },
        });
        const nameOf = (id: string) => eqs.find((e) => e.id === id)?.name ?? "Unknown";
        lines.push(
          `Highest downtime (90d): ` +
            downtime
              .map((d) => `${nameOf(d.equipmentId)} ${d._sum.downtimeHours ?? 0}h (cost ₹${d._sum.cost ?? 0})`)
              .join("; ")
        );
        sources.push({ label: "Reports", href: "/reports" });
      }

      // Calibration compliance
      const cals = await db.calibrationRecord.findMany({
        where: { organizationId: orgId },
        select: { result: true, nextDueAt: true },
      });
      if (cals.length > 0) {
        let v = 0, d = 0, o = 0, f = 0;
        for (const c of cals) {
          if (c.result === "FAIL") f += 1;
          else if (c.nextDueAt.getTime() < now.getTime()) o += 1;
          else if (c.nextDueAt.getTime() < soon.getTime()) d += 1;
          else v += 1;
        }
        const pct = Math.round(((v + d) / cals.length) * 100);
        lines.push(`Calibration: compliance ${pct}% (valid ${v}, due-soon ${d}, overdue ${o}, failed ${f} of ${cals.length})`);
        sources.push({ label: "Calibration", href: "/maintenance?tab=calibration" });
      }
    }

    // Incidents
    const incidentCounts = await db.incident.groupBy({
      by: ["status"],
      where: { organizationId: orgId },
      _count: { _all: true },
    });
    lines.push(
      `Incidents by status: ${incidentCounts.map((i) => `${i._count._all} ${i.status}`).join(", ") || "none"}`
    );
    const criticalIncidents = await db.incident.findMany({
      where: { organizationId: orgId, severity: { in: ["CRITICAL", "HIGH"] }, status: { in: ["OPEN", "INVESTIGATING"] } },
      select: { title: true, severity: true, status: true },
      take: 5,
    });
    if (criticalIncidents.length > 0) {
      lines.push(
        `High-severity unresolved incidents: ` +
          criticalIncidents.map((i) => `${i.title} (${i.severity}/${i.status})`).join("; ")
      );
      sources.push({ label: "Incidents", href: "/incidents?severity=CRITICAL" });
    }

    // Procurement approvals pending (approvers only)
    if (can(role, "procurement.approve")) {
      const pending = await db.purchaseRequest.count({
        where: { organizationId: orgId, status: "SUBMITTED" },
      });
      if (pending > 0) {
        lines.push(`Purchase requests awaiting approval: ${pending}`);
        sources.push({ label: "Procurement", href: "/procurement" });
      }
    }

    // Upcoming sessions
    const upcoming = await db.labSession.findMany({
      where: { organizationId: orgId, status: "SCHEDULED", scheduledAt: { gte: now } },
      select: { title: true, scheduledAt: true, room: true },
      take: 4,
      orderBy: { scheduledAt: "asc" },
    });
    if (upcoming.length > 0) {
      lines.push(
        `Upcoming sessions: ` +
          upcoming
            .map((s) => `${s.title} at ${s.scheduledAt.toISOString().slice(0, 16).replace("T", " ")} ${s.room ?? ""}`)
            .join("; ")
      );
      sources.push({ label: "Academics", href: "/academics" });
    }

    const context = lines.join("\n");

    const systemPrompt = [
      "You are the LabVault Operations Assistant for a laboratory management platform.",
      "Answer the user's question using ONLY the structured context provided below.",
      "Rules:",
      "1. Cite concrete numbers and names from the context. Never invent data.",
      "2. If the context lacks the answer, say exactly what data you would need.",
      "3. Be concise and operational: lead with the answer, then 2-4 bullet takeaways,",
      "   then one recommended action. Max ~180 words.",
      "4. Plain text only (no markdown headers). Use '-' for bullets.",
      "5. You are an insight layer over real data — you cannot mutate anything.",
      "",
      "=== AUTHORIZED CONTEXT ===",
      context,
      "=== END CONTEXT ===",
    ].join("\n");

    let answer: string;
    try {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "assistant", content: systemPrompt },
          { role: "user", content: question },
        ],
        thinking: { type: "disabled" },
      });
      answer = completion.choices[0]?.message?.content?.trim() || "";
      if (!answer) throw new Error("Empty LLM response");
    } catch (e) {
      console.error("[assistant] LLM call failed:", e instanceof Error ? e.message : e);
      return fail("INTERNAL_ERROR", "The AI service is temporarily unavailable. Please try again.", 503);
    }

    await audit(orgId, ctx.session.userId, "AI_ASSISTANT_QUERY", "Assistant", undefined, {
      question: question.slice(0, 200),
    });

    return ok({
      answer,
      sources,
      disclaimer: "AI-generated insight — verify against live data before acting.",
    });
  }, "assistant.use");
}
