# Permissions Reference

Source of truth: `src/lib/permissions.ts` (`PERMISSION_MATRIX`).
Enforced server-side in every route handler via `withAuth(req, handler, "permission.key")`.
Frontend checks are UX only and never a security boundary.

| Permission | ADMIN | LAB_MANAGER | INSTRUCTOR | TECHNICIAN | STUDENT |
|---|:--:|:--:|:--:|:--:|:--:|
| `labs.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `labs.manage` | ✅ | ✅ | — | — | — |
| `equipment.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `equipment.manage` | ✅ | ✅ | — | ✅ | — |
| `equipment.checkout` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `equipment.retire` | ✅ | ✅ | — | — | — |
| `reservations.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `reservations.create` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `reservations.approve` | ✅ | ✅ | — | — | — |
| `inventory.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `inventory.adjust` | ✅ | ✅ | — | ✅ | — |
| `chemicals.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `chemicals.manage` | ✅ | ✅ | — | ✅ | — |
| `maintenance.read` | ✅ | ✅ | ✅ | ✅ | — |
| `maintenance.manage` | ✅ | ✅ | — | ✅ | — |
| `calibration.read` | ✅ | ✅ | ✅ | ✅ | — |
| `calibration.manage` | ✅ | ✅ | — | ✅ | — |
| `academics.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `academics.manage` | ✅ | ✅ | ✅ | — | — |
| `incidents.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `incidents.report` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `incidents.manage` | ✅ | ✅ | ✅ | ✅ | — |
| `procurement.read` | ✅ | ✅ | ✅ | ✅ | — |
| `procurement.create` | ✅ | ✅ | ✅ | ✅ | — |
| `procurement.approve` | ✅ | ✅ | — | — | — |
| `procurement.receive` | ✅ | ✅ | — | ✅ | — |
| `reports.read` | ✅ | ✅ | ✅ | ✅ | — |
| `reports.export` | ✅ | ✅ | — | — | — |
| `audit.read` | ✅ | ✅ | — | — | — |
| `users.manage` | ✅ | — | — | — | — |
| `assistant.use` | ✅ | ✅ | ✅ | ✅ | — |

## Roles

- **ADMIN** — full organization control including user management and audit.
- **LAB_MANAGER** — operational approvals: reservations, procurement, labs, audit visibility.
- **INSTRUCTOR** — academic workflows (courses, sessions, grades) and incident management.
- **TECHNICIAN** — field work: equipment, inventory adjustments, maintenance, calibration, receiving.
- **STUDENT** — read-mostly: browse labs/equipment, reserve, check out, report incidents.

## Example enforcement check

```bash
# student attempts to approve a purchase → 403 FORBIDDEN
curl -X POST /api/purchases/<id> -H 'Content-Type: application/json' \
  -b 'lms_token=<student-session>' -d '{"status":"APPROVED"}'
# → {"error":{"code":"FORBIDDEN","message":"Forbidden — requires permission: procurement.approve","requestId":"…"}}
```
