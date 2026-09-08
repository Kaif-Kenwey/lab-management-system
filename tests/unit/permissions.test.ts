import { describe, it, expect } from "vitest";
import { can, permissionsFor, PERMISSION_MATRIX } from "@/lib/permissions";
import { ROLES } from "@/lib/constants";

describe("permission matrix", () => {
  it("admin has users.manage", () => {
    expect(can("ADMIN", "users.manage")).toBe(true);
  });

  it("admin has audit.read", () => {
    expect(can("ADMIN", "audit.read")).toBe(true);
  });

  it("student lacks audit.read, users.manage and procurement.approve", () => {
    expect(can("STUDENT", "audit.read")).toBe(false);
    expect(can("STUDENT", "users.manage")).toBe(false);
    expect(can("STUDENT", "procurement.approve")).toBe(false);
  });

  it("technician has maintenance.manage but not users.manage", () => {
    expect(can("TECHNICIAN", "maintenance.manage")).toBe(true);
    expect(can("TECHNICIAN", "users.manage")).toBe(false);
  });

  it("permissionsFor returns a non-empty permission list for every role", () => {
    for (const role of ROLES) {
      const perms = permissionsFor(role);
      expect(perms.length).toBeGreaterThan(0);
    }
  });

  it("permissionsFor(ADMIN) covers every permission in the matrix", () => {
    const all = Object.keys(PERMISSION_MATRIX);
    expect(permissionsFor("ADMIN")).toEqual(all);
  });

  it("matrix only references known roles and grants every role at least one permission", () => {
    for (const roles of Object.values(PERMISSION_MATRIX)) {
      for (const role of roles) {
        expect(ROLES as readonly string[]).toContain(role);
      }
    }
    // Every role must appear at least once across the matrix (labs.read is all-roles)
    const flat = Object.values(PERMISSION_MATRIX).flat();
    for (const role of ROLES) {
      expect(flat).toContain(role);
    }
  });

  it("unknown roles are denied by default", () => {
    expect(can("SUPERGUEST", "labs.read")).toBe(false);
  });
});
