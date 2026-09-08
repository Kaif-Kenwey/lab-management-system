import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, login, uniq, startTestServer, stopTestServer } from "./setup";

/**
 * Auth flows: login shape, error envelope codes, account suspension,
 * brute-force rate limiting and unauthenticated access.
 */

beforeAll(startTestServer);
afterAll(stopTestServer);

describe("POST /api/auth/login", () => {
  it("returns 200 with a safe user shape (no passwordHash)", async () => {
    const res = await api<{ user: Record<string, unknown> }>("POST", "/api/auth/login", {
      body: { email: "admin@labvault.io", password: "Password@123" },
    });
    expect(res.status).toBe(200);
    const user = res.data.user;
    expect(user.id).toBeTruthy();
    expect(user.email).toBe("admin@labvault.io");
    expect(user.role).toBe("ADMIN");
    expect(String(user.orgName)).toContain("Institute");
    // Password material must never leak
    expect(JSON.stringify(res.data)).not.toContain("passwordHash");
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("rejects a wrong password with 401 UNAUTHORIZED", async () => {
    const res = await api("POST", "/api/auth/login", {
      body: { email: `wrongpw-${uniq("t")}@test.dev`, password: "not-the-password" },
    });
    // Unknown email and wrong password must be indistinguishable
    expect(res.status).toBe(401);
    expect(res.error?.code).toBe("UNAUTHORIZED");
  });

  it("rejects a malformed payload with 400 VALIDATION_ERROR", async () => {
    const res = await api("POST", "/api/auth/login", { body: { email: "not-an-email", password: "" } });
    expect(res.status).toBe(400);
    expect(res.error?.code).toBe("VALIDATION_ERROR");
  });
});

describe("account suspension", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await login("admin@labvault.io");
  });

  it("blocks login for a SUSPENDED account with 403 FORBIDDEN", async () => {
    const email = uniq("suspended") + "@test.dev";
    const created = await api<{ id: string }>("POST", "/api/users", {
      token: adminCookie,
      body: { name: "Suspended Sam", email, password: "Password@123", role: "STUDENT" },
    });
    expect(created.status).toBe(201);

    const patched = await api("PATCH", `/api/users/${created.data.id}`, {
      token: adminCookie,
      body: { status: "SUSPENDED" },
    });
    expect(patched.status).toBe(200);

    const res = await api("POST", "/api/auth/login", {
      body: { email, password: "Password@123" },
    });
    expect(res.status).toBe(403);
    expect(res.error?.code).toBe("FORBIDDEN");
  });
});

describe("login rate limiting", () => {
  it("returns 429 RATE_LIMITED after rapid repeated failures", async () => {
    // Unique email → dedicated bucket (8 attempts / min per IP+email)
    const email = uniq("ratelimit") + "@test.dev";
    const statuses: number[] = [];
    let rateLimited = false;

    for (let i = 0; i < 9; i++) {
      const res = await api("POST", "/api/auth/login", {
        body: { email, password: "definitely-wrong" },
      });
      statuses.push(res.status);
      if (res.status === 429) {
        expect(res.error?.code).toBe("RATE_LIMITED");
        rateLimited = true;
        break;
      }
    }
    // The first 8 attempts get 401; the 9th (or earlier, under load) gets 429.
    expect(rateLimited, `expected a 429 among attempts, got ${statuses.join(",")}`).toBe(true);
  });
});

describe("unauthenticated access", () => {
  it("GET /api/labs without a session returns 401 UNAUTHORIZED", async () => {
    const res = await api("GET", "/api/labs");
    expect(res.status).toBe(401);
    expect(res.error?.code).toBe("UNAUTHORIZED");
  });

  it("GET /api/health is public", async () => {
    const res = await api<{ status: string }>("GET", "/api/health");
    expect(res.status).toBe(200);
    expect(res.data.status).toBe("ok");
  });
});
