import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, login, uniq, futureDate, startTestServer, stopTestServer } from "./setup";

/**
 * RBAC enforcement through the real API.
 *
 * Matrix reference (src/lib/permissions.ts):
 *  - procurement.create  → ADMIN, LAB_MANAGER, INSTRUCTOR, TECHNICIAN
 *  - maintenance.manage  → ADMIN, LAB_MANAGER, TECHNICIAN
 *  - users.manage        → ADMIN only
 *  - audit.read          → ADMIN, LAB_MANAGER
 *  - GET /api/operations/attention is auth-only (no permission gate)
 */

beforeAll(startTestServer);
afterAll(stopTestServer);

describe("student role restrictions", () => {
  let studentCookie: string;

  beforeAll(async () => {
    studentCookie = await login("student@labvault.io");
  });

  it("POST /api/purchases → 403 FORBIDDEN (no procurement.create)", async () => {
    const res = await api("POST", "/api/purchases", {
      token: studentCookie,
      body: { itemName: "Sneaky resistors", quantity: 1 },
    });
    expect(res.status).toBe(403);
    expect(res.error?.code).toBe("FORBIDDEN");
  });

  it("POST /api/orders → 403 FORBIDDEN (no procurement.create)", async () => {
    const res = await api("POST", "/api/orders", {
      token: studentCookie,
      body: { items: [{ name: "Sneaky oscilloscope", quantity: 1, unitCost: 100 }] },
    });
    expect(res.status).toBe(403);
    expect(res.error?.code).toBe("FORBIDDEN");
  });

  it("GET /api/audit → 403 FORBIDDEN (no audit.read)", async () => {
    const res = await api("GET", "/api/audit", { token: studentCookie });
    expect(res.status).toBe(403);
    expect(res.error?.code).toBe("FORBIDDEN");
  });

  it("GET /api/users → 403 FORBIDDEN (no users.manage)", async () => {
    const res = await api("GET", "/api/users", { token: studentCookie });
    expect(res.status).toBe(403);
    expect(res.error?.code).toBe("FORBIDDEN");
  });

  it("GET /api/operations/attention → 200 (auth-only endpoint)", async () => {
    const res = await api<{ items: unknown[]; generatedAt: string }>("GET", "/api/operations/attention", {
      token: studentCookie,
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.items)).toBe(true);
  });
});

describe("technician role", () => {
  let adminCookie: string;
  let techCookie: string;
  let equipmentId: string;

  beforeAll(async () => {
    adminCookie = await login("admin@labvault.io");
    techCookie = await login("tech@labvault.io");

    // Fixture: a lab + equipment for maintenance work orders
    const lab = await api<{ id: string }>("POST", "/api/labs", {
      token: adminCookie,
      body: { name: `RBAC Lab ${uniq("lab")}`, code: uniq("RBL").toUpperCase() },
    });
    expect(lab.status).toBe(201);
    const equipment = await api<{ id: string }>("POST", "/api/equipment", {
      token: adminCookie,
      body: { name: `RBAC Rig ${uniq("eq")}`, code: uniq("RBE").toUpperCase(), labId: lab.data.id },
    });
    expect(equipment.status).toBe(201);
    equipmentId = equipment.data.id;
  });

  it("GET /api/users → 403 FORBIDDEN (technician lacks users.manage)", async () => {
    const res = await api("GET", "/api/users", { token: techCookie });
    expect(res.status).toBe(403);
    expect(res.error?.code).toBe("FORBIDDEN");
  });

  it("POST /api/users → 403 FORBIDDEN (technician cannot create users)", async () => {
    const res = await api("POST", "/api/users", {
      token: techCookie,
      body: { name: "Nope", email: `${uniq("nope")}@test.dev`, password: "Password@123" },
    });
    expect(res.status).toBe(403);
    expect(res.error?.code).toBe("FORBIDDEN");
  });

  it("GET /api/audit → 403 FORBIDDEN (technician lacks audit.read)", async () => {
    const res = await api("GET", "/api/audit", { token: techCookie });
    expect(res.status).toBe(403);
    expect(res.error?.code).toBe("FORBIDDEN");
  });

  it("POST /api/maintenance → 201 (technician HAS maintenance.manage)", async () => {
    const res = await api<{ id: string; status: string }>("POST", "/api/maintenance", {
      token: techCookie,
      body: {
        equipmentId,
        title: `Technician work order ${uniq("wo")}`,
        scheduledAt: futureDate(2),
      },
    });
    expect(res.status).toBe(201);
    expect(res.data.status).toBe("OPEN");
  });

  it("POST /api/orders → 201 (technician HAS procurement.create — STAFF role)", async () => {
    const res = await api<{ id: string; status: string }>("POST", "/api/orders", {
      token: techCookie,
      body: { items: [{ name: "Alignment tool kit", quantity: 2, unitCost: 49.5 }] },
    });
    expect(res.status).toBe(201);
    expect(res.data.status).toBe("DRAFT");
  });
});
