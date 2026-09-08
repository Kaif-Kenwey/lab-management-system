import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, login, uniq, futureDate, startTestServer, stopTestServer } from "./setup";

/**
 * Business rules exercised end-to-end: reservation conflicts, checkout
 * lifecycle, ledger integrity, maintenance state machine, incident
 * resolution and audit logging.
 */

interface Equipment {
  id: string;
  status: string;
}

beforeAll(startTestServer);
afterAll(stopTestServer);

describe("business rules (admin)", () => {
  let adminCookie: string;
  let labId: string;
  let availableId: string;
  let retiredId: string;
  let maintenanceId: string;

  beforeAll(async () => {
    adminCookie = await login("admin@labvault.io");

    const lab = await api<{ id: string }>("POST", "/api/labs", {
      token: adminCookie,
      body: { name: `Rules Lab ${uniq("lab")}`, code: uniq("RUL").toUpperCase() },
    });
    expect(lab.status).toBe(201);
    labId = lab.data.id;

    const mk = async (prefix: string, status?: string) => {
      const res = await api<{ id: string }>("POST", "/api/equipment", {
        token: adminCookie,
        body: {
          name: `Rules Rig ${uniq(prefix)}`,
          code: uniq(prefix).toUpperCase(),
          labId,
          ...(status ? { status } : {}),
        },
      });
      expect(res.status).toBe(201);
      return res.data.id;
    };
    availableId = await mk("AVA");
    retiredId = await mk("RET", "RETIRED");
    maintenanceId = await mk("MNT", "UNDER_MAINTENANCE");
  });

  describe("reservations", () => {
    it("creates a valid slot with 201 (status PENDING)", async () => {
      const res = await api<{ id: string; status: string }>("POST", "/api/reservations", {
        token: adminCookie,
        body: {
          equipmentId: availableId,
          startAt: futureDate(1),
          endAt: futureDate(2),
          purpose: "integration test slot A",
        },
      });
      expect(res.status).toBe(201);
      expect(res.data.status).toBe("PENDING");
    });

    it("rejects an overlapping slot with 409 RESOURCE_CONFLICT", async () => {
      const res = await api("POST", "/api/reservations", {
        token: adminCookie,
        body: {
          equipmentId: availableId,
          startAt: futureDate(1, 12),
          endAt: futureDate(2, 12), // overlaps slot A
          purpose: "conflicting booking",
        },
      });
      expect(res.status).toBe(409);
      expect(res.error?.code).toBe("RESOURCE_CONFLICT");
    });

    it("rejects reservations on RETIRED equipment with 409", async () => {
      const res = await api("POST", "/api/reservations", {
        token: adminCookie,
        body: { equipmentId: retiredId, startAt: futureDate(5), endAt: futureDate(6) },
      });
      expect(res.status).toBe(409);
      expect(res.error?.code).toBe("RESOURCE_CONFLICT");
    });
  });

  describe("checkouts", () => {
    it("rejects checkout of UNDER_MAINTENANCE equipment with 409", async () => {
      const res = await api("POST", "/api/checkouts", {
        token: adminCookie,
        body: { equipmentId: maintenanceId, dueAt: futureDate(3) },
      });
      expect(res.status).toBe(409);
      expect(res.error?.code).toBe("RESOURCE_CONFLICT");
    });

    it("checkout AVAILABLE → 201, equipment IN_USE; second checkout → 409; check-in → AVAILABLE", async () => {
      const checkout = await api<{ id: string; status: string }>("POST", "/api/checkouts", {
        token: adminCookie,
        body: { equipmentId: availableId, dueAt: futureDate(3) },
      });
      expect(checkout.status).toBe(201);
      expect(checkout.data.status).toBe("ACTIVE");

      let equipment = await api<Equipment>("GET", `/api/equipment/${availableId}`, {
        token: adminCookie,
      });
      expect(equipment.data.status).toBe("IN_USE");

      const second = await api("POST", "/api/checkouts", {
        token: adminCookie,
        body: { equipmentId: availableId, dueAt: futureDate(3) },
      });
      expect(second.status).toBe(409);
      expect(second.error?.code).toBe("RESOURCE_CONFLICT");

      const checkin = await api("PATCH", `/api/checkouts/${checkout.data.id}`, {
        token: adminCookie,
        body: { checkedIn: true, conditionIn: "GOOD" },
      });
      expect(checkin.status).toBe(200);

      equipment = await api<Equipment>("GET", `/api/equipment/${availableId}`, { token: adminCookie });
      expect(equipment.data.status).toBe("AVAILABLE");
    });
  });

  describe("inventory ledger", () => {
    let itemId: string;

    beforeAll(async () => {
      const item = await api<{ id: string }>("POST", "/api/inventory", {
        token: adminCookie,
        body: {
          name: `Rules Reagent ${uniq("inv")}`,
          sku: uniq("SKU").toUpperCase(),
          labId,
          initialQty: 10,
          minQuantity: 5,
          unit: "pcs",
        },
      });
      expect(item.status).toBe(201);
      itemId = item.data.id;
    });

    it("rejects issuing more than the current stock with 409", async () => {
      const res = await api("POST", `/api/inventory/${itemId}/transactions`, {
        token: adminCookie,
        body: { type: "ISSUE", quantity: 999, reason: "over-issue attempt" },
      });
      expect(res.status).toBe(409);
      expect(res.error?.code).toBe("RESOURCE_CONFLICT");
    });

    it("ISSUE returns correct previousBalance/newBalance and appears in the ledger", async () => {
      const tx = await api<{ previousBalance: number; newBalance: number; type: string }>(
        "POST",
        `/api/inventory/${itemId}/transactions`,
        { token: adminCookie, body: { type: "ISSUE", quantity: 4, reason: "class experiment" } }
      );
      expect(tx.status).toBe(201);
      expect(tx.data.type).toBe("ISSUE");
      expect(tx.data.previousBalance).toBe(10);
      expect(tx.data.newBalance).toBe(6);

      const ledger = await api<{
        items: Array<{ itemId: string; type: string; quantity: number; newBalance: number }>;
      }>("GET", `/api/inventory/transactions?itemId=${itemId}`, { token: adminCookie });
      expect(ledger.status).toBe(200);
      const issueRows = ledger.data.items.filter((t) => t.type === "ISSUE");
      expect(issueRows.length).toBeGreaterThan(0);
      expect(issueRows[0].newBalance).toBe(6);
    });
  });

  describe("maintenance work orders", () => {
    it("OPEN → IN_PROGRESS → COMPLETED drives equipment UNDER_MAINTENANCE → AVAILABLE", async () => {
      const rig = await api<{ id: string }>("POST", "/api/equipment", {
        token: adminCookie,
        body: { name: `Rules Service Rig ${uniq("srv")}`, code: uniq("SRV").toUpperCase(), labId },
      });
      const rigId = rig.data.id;

      const wo = await api<{ id: string; status: string }>("POST", "/api/maintenance", {
        token: adminCookie,
        body: { equipmentId: rigId, title: `Work order ${uniq("wo")}`, scheduledAt: futureDate(1) },
      });
      expect(wo.status).toBe(201);
      expect(wo.data.status).toBe("OPEN");

      // OPEN → IN_PROGRESS is a legal direct transition
      const started = await api<{ status: string }>("PATCH", `/api/maintenance/${wo.data.id}`, {
        token: adminCookie,
        body: { status: "IN_PROGRESS" },
      });
      expect(started.status).toBe(200);
      expect(started.data.status).toBe("IN_PROGRESS");

      let equipment = await api<Equipment>("GET", `/api/equipment/${rigId}`, { token: adminCookie });
      expect(equipment.data.status).toBe("UNDER_MAINTENANCE");

      const completed = await api<{ status: string; downtimeHours: number | null }>(
        "PATCH",
        `/api/maintenance/${wo.data.id}`,
        { token: adminCookie, body: { status: "COMPLETED" } }
      );
      expect(completed.status).toBe(200);
      expect(completed.data.status).toBe("COMPLETED");
      expect(completed.data.downtimeHours).not.toBeNull();
      expect(completed.data.downtimeHours as number).toBeGreaterThanOrEqual(0);

      equipment = await api<Equipment>("GET", `/api/equipment/${rigId}`, { token: adminCookie });
      expect(equipment.data.status).toBe("AVAILABLE");
    });
  });

  describe("incidents", () => {
    it("rejects resolution without a root cause (400), accepts it with one (200)", async () => {
      const incident = await api<{ id: string; status: string }>("POST", "/api/incidents", {
        token: adminCookie,
        body: { title: `Spill drill ${uniq("inc")}`, labId, type: "SPILL", severity: "MEDIUM" },
      });
      expect(incident.status).toBe(201);
      expect(incident.data.status).toBe("OPEN");

      // Walk the strict lifecycle OPEN → INVESTIGATING → CONTAINED
      const inv = await api("PATCH", `/api/incidents/${incident.data.id}`, {
        token: adminCookie,
        body: { status: "INVESTIGATING" },
      });
      expect(inv.status).toBe(200);
      const contained = await api("PATCH", `/api/incidents/${incident.data.id}`, {
        token: adminCookie,
        body: { status: "CONTAINED" },
      });
      expect(contained.status).toBe(200);

      // RESOLVED without rootCause → 400 VALIDATION_ERROR
      const noRoot = await api("PATCH", `/api/incidents/${incident.data.id}`, {
        token: adminCookie,
        body: { status: "RESOLVED" },
      });
      expect(noRoot.status).toBe(400);
      expect(noRoot.error?.code).toBe("VALIDATION_ERROR");

      // With rootCause → 200 RESOLVED
      const resolved = await api<{ status: string }>("PATCH", `/api/incidents/${incident.data.id}`, {
        token: adminCookie,
        body: { status: "RESOLVED", rootCause: "Valve left open during cleanup drill" },
      });
      expect(resolved.status).toBe(200);
      expect(resolved.data.status).toBe("RESOLVED");
    });
  });

  describe("audit trail", () => {
    it("records the checkout action performed in this suite", async () => {
      const logs = await api<Array<{ action: string }>>("GET", "/api/audit", { token: adminCookie });
      expect(logs.status).toBe(200);
      const actions = logs.data.map((l) => l.action);
      expect(actions).toContain("CHECKOUT_CREATED");
    });
  });
});
