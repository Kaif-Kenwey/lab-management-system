// Granular permission matrix (Phase 4) — roles → permissions.
// Server-side enforcement via withPermission(); frontend uses it for UX only.
import { Role } from "./constants";

export type Permission =
  | "labs.read"
  | "labs.manage"
  | "equipment.read"
  | "equipment.manage"
  | "equipment.checkout"
  | "equipment.retire"
  | "reservations.read"
  | "reservations.create"
  | "reservations.approve"
  | "inventory.read"
  | "inventory.adjust"
  | "chemicals.read"
  | "chemicals.manage"
  | "maintenance.read"
  | "maintenance.manage"
  | "calibration.read"
  | "calibration.manage"
  | "academics.read"
  | "academics.manage"
  | "incidents.read"
  | "incidents.report"
  | "incidents.manage"
  | "procurement.read"
  | "procurement.create"
  | "procurement.approve"
  | "procurement.receive"
  | "reports.read"
  | "reports.export"
  | "audit.read"
  | "users.manage"
  | "assistant.use";

const ALL_ROLES: Role[] = ["ADMIN", "LAB_MANAGER", "INSTRUCTOR", "TECHNICIAN", "STUDENT"];
const STAFF: Role[] = ["ADMIN", "LAB_MANAGER", "INSTRUCTOR", "TECHNICIAN"];
const APPROVERS: Role[] = ["ADMIN", "LAB_MANAGER"];
const FIELD_TEAMS: Role[] = ["ADMIN", "LAB_MANAGER", "TECHNICIAN"];

export const PERMISSION_MATRIX: Record<Permission, Role[]> = {
  "labs.read": ALL_ROLES,
  "labs.manage": APPROVERS,
  "equipment.read": ALL_ROLES,
  "equipment.manage": FIELD_TEAMS,
  "equipment.checkout": ALL_ROLES,
  "equipment.retire": APPROVERS,
  "reservations.read": ALL_ROLES,
  "reservations.create": ALL_ROLES,
  "reservations.approve": APPROVERS,
  "inventory.read": ALL_ROLES,
  "inventory.adjust": FIELD_TEAMS,
  "chemicals.read": ALL_ROLES,
  "chemicals.manage": FIELD_TEAMS,
  "maintenance.read": STAFF,
  "maintenance.manage": FIELD_TEAMS,
  "calibration.read": STAFF,
  "calibration.manage": FIELD_TEAMS,
  "academics.read": ALL_ROLES,
  "academics.manage": ["ADMIN", "LAB_MANAGER", "INSTRUCTOR"],
  "incidents.read": ALL_ROLES,
  "incidents.report": ALL_ROLES,
  "incidents.manage": ["ADMIN", "LAB_MANAGER", "TECHNICIAN", "INSTRUCTOR"],
  "procurement.read": STAFF,
  "procurement.create": STAFF,
  "procurement.approve": APPROVERS,
  "procurement.receive": FIELD_TEAMS,
  "reports.read": STAFF,
  "reports.export": APPROVERS,
  "audit.read": APPROVERS,
  "users.manage": ["ADMIN"],
  "assistant.use": STAFF,
};

export function can(role: string, permission: Permission): boolean {
  const allowed = PERMISSION_MATRIX[permission];
  return allowed ? (allowed as string[]).includes(role) : false;
}

export function permissionsFor(role: string): Permission[] {
  return (Object.keys(PERMISSION_MATRIX) as Permission[]).filter((p) => can(role, p));
}
