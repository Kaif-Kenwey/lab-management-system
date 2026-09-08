// Equipment & booking business rules (Phases 7–9).
// These functions are the SINGLE source of truth for state-machine legality
// and are used by API routes (authoritative) and tests.

import { ApiError } from "./errors";

export type EquipmentLike = {
  id: string;
  status: string;
  condition?: string | null;
  name?: string;
  code?: string;
};

export type ReservationLike = {
  startAt: Date;
  endAt: Date;
};

/**
 * Equipment must be AVAILABLE to be checked out.
 * RULES: under maintenance → 409; retired → 409; already in use → 409.
 */
export function assertCanCheckout(equipment: EquipmentLike | null): asserts equipment {
  if (!equipment) throw new ApiError("NOT_FOUND", "Equipment not found", 404);
  if (equipment.status === "RETIRED") {
    throw new ApiError("RESOURCE_CONFLICT", "Retired equipment cannot be checked out", 409);
  }
  if (equipment.status === "UNDER_MAINTENANCE") {
    throw new ApiError("RESOURCE_CONFLICT", "Equipment under maintenance cannot be checked out", 409);
  }
  if (equipment.status === "IN_USE") {
    throw new ApiError("RESOURCE_CONFLICT", "Equipment is already checked out", 409);
  }
}

/**
 * Equipment can be reserved unless RETIRED or UNDER_MAINTENANCE.
 * (Availability in a time range is checked separately against reservations.)
 */
export function assertCanReserve(equipment: EquipmentLike | null): asserts equipment {
  if (!equipment) throw new ApiError("NOT_FOUND", "Equipment not found", 404);
  if (equipment.status === "RETIRED") {
    throw new ApiError("RESOURCE_CONFLICT", "Retired equipment cannot be reserved", 409);
  }
  if (equipment.status === "UNDER_MAINTENANCE") {
    throw new ApiError("RESOURCE_CONFLICT", "Equipment under maintenance cannot be reserved right now", 409);
  }
}

export function rangesOverlap(a: ReservationLike, b: ReservationLike): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

/** Do any of the existing reservations overlap the requested range? */
export function findOverlap(existing: ReservationLike[], requested: ReservationLike): boolean {
  return existing.some((r) => rangesOverlap(r, requested));
}

export const ACTIVE_RESERVATION_STATUSES = ["PENDING", "APPROVED", "ACTIVE"] as const;

/**
 * Allowed maintenance work-order status transitions.
 */
export const MAINTENANCE_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["ASSIGNED", "IN_PROGRESS", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "WAITING_FOR_PARTS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_PARTS", "COMPLETED", "CANCELLED"],
  WAITING_FOR_PARTS: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertMaintenanceTransition(from: string, to: string) {
  const allowed = MAINTENANCE_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ApiError("RESOURCE_CONFLICT", `Invalid maintenance transition: ${from} → ${to}`, 409);
  }
}

/** Which maintenance statuses put equipment out of service? */
export const EQUIPMENT_OUT_OF_SERVICE = ["UNDER_MAINTENANCE", "RETIRED"] as const;

/**
 * Derived calibration status from result + next due date.
 */
export function deriveCalibrationStatus(result: string, nextDueAt: Date, now = new Date()): string {
  if (result === "FAIL") return "FAILED";
  if (nextDueAt.getTime() < now.getTime()) return "OVERDUE";
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (nextDueAt.getTime() < soon.getTime()) return "DUE_SOON";
  return "VALID";
}

/**
 * Inventory ledger direction: +1 stock-in, -1 stock-out, 0 neutral.
 */
export const LEDGER_IN_TYPES = ["RECEIPT", "RETURN"] as const;
export const LEDGER_OUT_TYPES = ["ISSUE", "DAMAGE", "EXPIRY"] as const;
export const LEDGER_NEUTRAL_TYPES = ["TRANSFER", "ADJUSTMENT"] as const;

export function ledgerDirection(type: string): 1 | -1 | 0 {
  if ((LEDGER_IN_TYPES as readonly string[]).includes(type)) return 1;
  if ((LEDGER_OUT_TYPES as readonly string[]).includes(type)) return -1;
  return 0;
}
