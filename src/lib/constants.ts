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
export const RESERVATION_STATUS = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"] as const;
export const CHECKOUT_STATUS = ["ACTIVE", "RETURNED", "OVERDUE"] as const;
export const INVENTORY_CATEGORY = ["CONSUMABLE", "SPARE", "STATIONERY", "SAFETY"] as const;
export const HAZARD_CLASS = ["LOW", "FLAMMABLE", "CORROSIVE", "TOXIC", "REACTIVE"] as const;
export const MAINTENANCE_TYPE = ["PREVENTIVE", "CORRECTIVE", "CALIBRATION"] as const;
export const MAINTENANCE_STATUS = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export const EXPERIMENT_STATUS = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export const SESSION_STATUS = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export const ATTENDANCE_STATUS = ["PRESENT", "ABSENT", "LATE"] as const;
export const INCIDENT_SEVERITY = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const INCIDENT_STATUS = ["OPEN", "INVESTIGATING", "RESOLVED"] as const;
export const VENDOR_CATEGORY = ["EQUIPMENT", "CHEMICALS", "CONSUMABLES", "SERVICES"] as const;
export const PURCHASE_STATUS = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "ORDERED", "RECEIVED"] as const;
export const NOTIFICATION_TYPE = ["INFO", "WARNING", "SUCCESS", "ERROR"] as const;

/** Roles allowed to manage inventory / equipment / approve requests */
export const STAFF_ROLES: Role[] = ["ADMIN", "LAB_MANAGER", "INSTRUCTOR", "TECHNICIAN"];
export const APPROVER_ROLES: Role[] = ["ADMIN", "LAB_MANAGER"];
