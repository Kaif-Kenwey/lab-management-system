// Domain constants — single source of truth for status fields (SQLite has no enums)

export const ROLES = ["ADMIN", "LAB_MANAGER", "INSTRUCTOR", "TECHNICIAN", "STUDENT"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrator",
  LAB_MANAGER: "Lab Manager",
  INSTRUCTOR: "Instructor",
  TECHNICIAN: "Technician",
  STUDENT: "Student",
};

export const LAB_STATUS = ["ACTIVE", "MAINTENANCE", "CLOSED"] as const;
export const EQUIPMENT_STATUS = ["AVAILABLE", "IN_USE", "UNDER_MAINTENANCE", "RETIRED"] as const;
export const EQUIPMENT_CONDITION = ["EXCELLENT", "GOOD", "FAIR", "POOR"] as const;
export const EQUIPMENT_CATEGORY = ["GENERAL", "INSTRUMENT", "COMPUTING", "SAFETY", "OPTICS", "ELECTRICAL"] as const;

export const RESERVATION_STATUS = [
  "PENDING", "APPROVED", "ACTIVE", "COMPLETED", "REJECTED", "CANCELLED", "NO_SHOW",
] as const;
/** Statuses that occupy a time slot for conflict checks */
export const ACTIVE_RESERVATION_STATUSES = ["PENDING", "APPROVED", "ACTIVE"] as const;

export const CHECKOUT_STATUS = ["ACTIVE", "RETURNED", "OVERDUE"] as const;

export const INVENTORY_CATEGORY = ["CONSUMABLE", "SPARE", "STATIONERY", "SAFETY"] as const;
export const INVENTORY_TX_TYPES = [
  "RECEIPT", "ISSUE", "RETURN", "TRANSFER", "ADJUSTMENT", "DAMAGE", "EXPIRY",
] as const;
export type InventoryTxType = (typeof INVENTORY_TX_TYPES)[number];

export const HAZARD_CLASS = ["LOW", "FLAMMABLE", "CORROSIVE", "TOXIC", "REACTIVE"] as const;

export const MAINTENANCE_TYPE = ["PREVENTIVE", "CORRECTIVE", "EMERGENCY", "CALIBRATION"] as const;
export const MAINTENANCE_PRIORITY = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const MAINTENANCE_STATUS = [
  "OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_PARTS", "COMPLETED", "CANCELLED",
] as const;
/** Statuses that take equipment out of service */
export const MAINTENANCE_ACTIVE_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_PARTS"] as const;

export const CALIBRATION_STATUS = ["VALID", "DUE_SOON", "OVERDUE", "FAILED"] as const;
export const CALIBRATION_RESULT = ["PASS", "FAIL", "PENDING"] as const;

export const EQUIPMENT_EVENT_TYPES = [
  "CREATED", "PURCHASED", "RECEIVED", "ASSIGNED", "RESERVED", "CHECKED_OUT", "RETURNED",
  "MAINTENANCE_STARTED", "MAINTENANCE_COMPLETED", "CALIBRATION_STARTED", "CALIBRATION_COMPLETED",
  "DAMAGED", "REPAIRED", "RETIRED", "STATUS_CHANGED",
] as const;

export const EXPERIMENT_STATUS = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export const SESSION_STATUS = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export const ATTENDANCE_STATUS = ["PRESENT", "ABSENT", "LATE"] as const;

export const INCIDENT_TYPE = [
  "EQUIPMENT_DAMAGE", "SAFETY_VIOLATION", "SPILL", "INJURY", "POWER_FAILURE", "FIRE",
  "MISSING_ASSET", "OTHER",
] as const;
export const INCIDENT_SEVERITY = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const INCIDENT_STATUS = ["OPEN", "INVESTIGATING", "CONTAINED", "RESOLVED", "CLOSED"] as const;

export const VENDOR_CATEGORY = ["EQUIPMENT", "CHEMICALS", "CONSUMABLES", "SERVICES"] as const;
export const PURCHASE_STATUS = [
  "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "ORDERED", "RECEIVED",
] as const;
export const PO_STATUS = ["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] as const;

export const DOCUMENT_ENTITY_TYPES = [
  "EQUIPMENT", "LAB", "CHEMICAL", "INCIDENT", "VENDOR", "PURCHASE_ORDER", "CALIBRATION",
] as const;

export const NOTIFICATION_TYPE = ["INFO", "WARNING", "SUCCESS", "ERROR"] as const;

/** Legacy helper retained for UI gating */
export const STAFF_ROLES: Role[] = ["ADMIN", "LAB_MANAGER", "INSTRUCTOR", "TECHNICIAN"];
export const APPROVER_ROLES: Role[] = ["ADMIN", "LAB_MANAGER"];
