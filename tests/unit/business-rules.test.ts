import { describe, it, expect } from "vitest";
import {
  assertCanCheckout,
  assertCanReserve,
  rangesOverlap,
  assertMaintenanceTransition,
  deriveCalibrationStatus,
  ledgerDirection,
} from "@/lib/business-rules";
import { ApiError } from "@/lib/errors";
import { INVENTORY_TX_TYPES } from "@/lib/constants";

const DAY = 24 * 60 * 60 * 1000;

function expectApiError(fn: () => unknown, code: string, status: number) {
  try {
    fn();
    expect.unreachable(`expected ${code} to be thrown`);
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    const err = e as ApiError;
    expect(err.code).toBe(code);
    expect(err.status).toBe(status);
  }
}

describe("assertCanCheckout", () => {
  it("throws 409 RESOURCE_CONFLICT for RETIRED equipment", () => {
    expectApiError(() => assertCanCheckout({ id: "e1", status: "RETIRED" }), "RESOURCE_CONFLICT", 409);
  });

  it("throws 409 RESOURCE_CONFLICT for UNDER_MAINTENANCE equipment", () => {
    expectApiError(
      () => assertCanCheckout({ id: "e1", status: "UNDER_MAINTENANCE" }),
      "RESOURCE_CONFLICT",
      409
    );
  });

  it("throws 409 RESOURCE_CONFLICT for IN_USE equipment", () => {
    expectApiError(() => assertCanCheckout({ id: "e1", status: "IN_USE" }), "RESOURCE_CONFLICT", 409);
  });

  it("passes for AVAILABLE equipment", () => {
    expect(() => assertCanCheckout({ id: "e1", status: "AVAILABLE" })).not.toThrow();
  });

  it("throws 404 NOT_FOUND when equipment is missing", () => {
    expectApiError(() => assertCanCheckout(null), "NOT_FOUND", 404);
  });
});

describe("assertCanReserve", () => {
  it("throws 409 for RETIRED equipment", () => {
    expectApiError(() => assertCanReserve({ id: "e1", status: "RETIRED" }), "RESOURCE_CONFLICT", 409);
  });

  it("throws 409 for UNDER_MAINTENANCE equipment", () => {
    expectApiError(
      () => assertCanReserve({ id: "e1", status: "UNDER_MAINTENANCE" }),
      "RESOURCE_CONFLICT",
      409
    );
  });

  it("passes for AVAILABLE and IN_USE equipment", () => {
    expect(() => assertCanReserve({ id: "e1", status: "AVAILABLE" })).not.toThrow();
    expect(() => assertCanReserve({ id: "e1", status: "IN_USE" })).not.toThrow();
  });
});

describe("rangesOverlap", () => {
  const d = (offsetHours: number) => new Date(Date.UTC(2025, 0, 15, 10 + offsetHours));

  it("detects a true overlap", () => {
    expect(rangesOverlap({ startAt: d(0), endAt: d(2) }, { startAt: d(1), endAt: d(3) })).toBe(true);
    // containment
    expect(rangesOverlap({ startAt: d(0), endAt: d(4) }, { startAt: d(1), endAt: d(2) })).toBe(true);
    // identical ranges
    expect(rangesOverlap({ startAt: d(0), endAt: d(2) }, { startAt: d(0), endAt: d(2) })).toBe(true);
  });

  it("rejects non-overlapping ranges", () => {
    expect(rangesOverlap({ startAt: d(0), endAt: d(1) }, { startAt: d(2), endAt: d(3) })).toBe(false);
    expect(rangesOverlap({ startAt: d(2), endAt: d(3) }, { startAt: d(0), endAt: d(1) })).toBe(false);
  });

  it("treats touching edges as non-overlapping", () => {
    // a ends exactly when b starts (and vice versa)
    expect(rangesOverlap({ startAt: d(0), endAt: d(1) }, { startAt: d(1), endAt: d(2) })).toBe(false);
    expect(rangesOverlap({ startAt: d(1), endAt: d(2) }, { startAt: d(0), endAt: d(1) })).toBe(false);
  });
});

describe("assertMaintenanceTransition", () => {
  it("allows legal transitions: OPEN→ASSIGNED and IN_PROGRESS→COMPLETED", () => {
    expect(() => assertMaintenanceTransition("OPEN", "ASSIGNED")).not.toThrow();
    expect(() => assertMaintenanceTransition("IN_PROGRESS", "COMPLETED")).not.toThrow();
    // OPEN→IN_PROGRESS is also a legal direct move per the transition map
    expect(() => assertMaintenanceTransition("OPEN", "IN_PROGRESS")).not.toThrow();
  });

  it("throws 409 for illegal transitions: COMPLETED→IN_PROGRESS and OPEN→COMPLETED", () => {
    expectApiError(
      () => assertMaintenanceTransition("COMPLETED", "IN_PROGRESS"),
      "RESOURCE_CONFLICT",
      409
    );
    expectApiError(() => assertMaintenanceTransition("OPEN", "COMPLETED"), "RESOURCE_CONFLICT", 409);
  });

  it("throws 409 for unknown source statuses", () => {
    expectApiError(() => assertMaintenanceTransition("BOGUS", "OPEN"), "RESOURCE_CONFLICT", 409);
  });
});

describe("deriveCalibrationStatus", () => {
  const now = new Date("2025-06-15T12:00:00.000Z");

  it("FAIL result maps to FAILED regardless of dates", () => {
    const past = new Date(now.getTime() - 10 * DAY);
    expect(deriveCalibrationStatus("FAIL", past, now)).toBe("FAILED");
  });

  it("past-due date maps to OVERDUE", () => {
    const past = new Date(now.getTime() - DAY);
    expect(deriveCalibrationStatus("PASS", past, now)).toBe("OVERDUE");
  });

  it("date within 30 days maps to DUE_SOON", () => {
    const soon = new Date(now.getTime() + 29 * DAY);
    expect(deriveCalibrationStatus("PASS", soon, now)).toBe("DUE_SOON");
  });

  it("date beyond 30 days maps to VALID", () => {
    const later = new Date(now.getTime() + 31 * DAY);
    expect(deriveCalibrationStatus("PASS", later, now)).toBe("VALID");
  });

  it("exactly 30 days ahead is VALID (window is strictly < 30d per implementation)", () => {
    const edge = new Date(now.getTime() + 30 * DAY);
    expect(deriveCalibrationStatus("PASS", edge, now)).toBe("VALID");
  });
});

describe("ledgerDirection", () => {
  it("maps all 7 inventory transaction types to the correct direction", () => {
    expect(ledgerDirection("RECEIPT")).toBe(1);
    expect(ledgerDirection("RETURN")).toBe(1);
    expect(ledgerDirection("ISSUE")).toBe(-1);
    expect(ledgerDirection("DAMAGE")).toBe(-1);
    expect(ledgerDirection("EXPIRY")).toBe(-1);
    expect(ledgerDirection("TRANSFER")).toBe(0);
    expect(ledgerDirection("ADJUSTMENT")).toBe(0);
  });

  it("covers every type declared in constants (no missing/extra types)", () => {
    for (const t of INVENTORY_TX_TYPES) {
      expect([-1, 0, 1]).toContain(ledgerDirection(t));
    }
    expect(INVENTORY_TX_TYPES).toHaveLength(7);
  });
});
