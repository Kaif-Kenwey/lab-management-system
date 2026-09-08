import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, login, cookieFrom, BASE_URL, uniq, startTestServer, stopTestServer } from "./setup";

/**
 * Multi-tenant isolation: a brand-new organization (org B) must see none of
 * the seeded data of org A ("Nova/Northstar Institute of Technology"), and
 * cross-tenant reads/writes must answer 404 (never 403 — no existence leaks).
 */

interface Lab {
  id: string;
  name: string;
}
interface Equipment {
  id: string;
  name: string;
}
interface InventoryItem {
  id: string;
  name: string;
}

beforeAll(startTestServer);
afterAll(stopTestServer);

describe("tenant isolation", () => {
  let orgACookie: string;
  let orgBCookie: string;
  let orgALabId: string;
  let orgAEquipmentId: string;
  let orgAItemId: string;

  beforeAll(async () => {
    orgACookie = await login("admin@labvault.io");

    // Capture seeded org A ids
    const labs = await api<Lab[]>("GET", "/api/labs", { token: orgACookie });
    expect(labs.status).toBe(200);
    expect(labs.data.length).toBeGreaterThan(0);
    orgALabId = labs.data[0].id;

    const equipment = await api<Equipment[]>("GET", "/api/equipment", { token: orgACookie });
    orgAEquipmentId = equipment.data[0].id;

    const items = await api<InventoryItem[]>("GET", "/api/inventory", { token: orgACookie });
    orgAItemId = items.data[0].id;

    // Sign up a brand new organization (org B)
    const email = `tenancy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.dev`;
    const res = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orgName: `Tenant B ${uniq("org")}`,
        name: "Tenant B Admin",
        email,
        password: "Password@123",
      }),
    });
    expect(res.status).toBe(201);
    orgBCookie = cookieFrom(res);
  });

  it("org B starts with zero labs, equipment and reservations", async () => {
    const labs = await api<unknown[]>("GET", "/api/labs", { token: orgBCookie });
    expect(labs.status).toBe(200);
    expect(labs.data).toHaveLength(0);

    const equipment = await api<unknown[]>("GET", "/api/equipment", { token: orgBCookie });
    expect(equipment.data).toHaveLength(0);

    const reservations = await api<unknown[]>("GET", "/api/reservations", { token: orgBCookie });
    expect(reservations.data).toHaveLength(0);
  });

  it("org B lists never contain org A ids", async () => {
    const [labs, equipment, reservations, inventory] = await Promise.all([
      api<unknown[]>("GET", "/api/labs", { token: orgBCookie }),
      api<unknown[]>("GET", "/api/equipment", { token: orgBCookie }),
      api<unknown[]>("GET", "/api/reservations", { token: orgBCookie }),
      api<unknown[]>("GET", "/api/inventory", { token: orgBCookie }),
    ]);
    const blob = JSON.stringify([labs.data, equipment.data, reservations.data, inventory.data]);
    expect(blob).not.toContain(orgALabId);
    expect(blob).not.toContain(orgAEquipmentId);
    expect(blob).not.toContain(orgAItemId);
  });

  it("org B gets 404 (not 403) for org A's equipment", async () => {
    const get = await api("GET", `/api/equipment/${orgAEquipmentId}`, { token: orgBCookie });
    expect(get.status).toBe(404);
    expect(get.error?.code).toBe("NOT_FOUND");
  });

  it("org B cannot PATCH org A's equipment (404)", async () => {
    const patch = await api("PATCH", `/api/equipment/${orgAEquipmentId}`, {
      token: orgBCookie,
      body: { name: "hijacked" },
    });
    expect(patch.status).toBe(404);
    expect(patch.error?.code).toBe("NOT_FOUND");
  });

  it("org B gets 404 for org A's inventory transactions", async () => {
    const res = await api("GET", `/api/inventory/${orgAItemId}/transactions`, { token: orgBCookie });
    expect(res.status).toBe(404);
    expect(res.error?.code).toBe("NOT_FOUND");
  });

  it("org A admin still sees its own seeded data", async () => {
    const labs = await api<Lab[]>("GET", "/api/labs", { token: orgACookie });
    expect(labs.status).toBe(200);
    expect(labs.data.some((l) => l.id === orgALabId)).toBe(true);

    const equipment = await api("GET", `/api/equipment/${orgAEquipmentId}`, { token: orgACookie });
    expect(equipment.status).toBe(200);
  });
});
