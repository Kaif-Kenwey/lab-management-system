# API Reference

The binding, always-current contract lives in **[`docs/API_CONTRACT.md`](./API_CONTRACT.md)** — it lists every endpoint with payload shapes, permission keys and workflow rules. This page covers the conventions.

## Authentication
All endpoints except `/api/health*`, `/api/auth/login`, `/api/auth/signup`, `/api/auth/forgot-password` and `/api/auth/reset-password` require the `lms_token` httpOnly cookie (obtained from login/signup). Requests are same-origin; no bearer tokens needed.

## Error envelope

Every error is machine-readable:

```json
{
  "error": {
    "code": "RESOURCE_CONFLICT",
    "message": "This equipment already has a reservation overlapping the selected time slot",
    "requestId": "7f84822e-cb8f-4d10-8e44-c5322e8e8f9d"
  }
}
```

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Body/query failed schema validation |
| `UNAUTHORIZED` | 401 | No/invalid session |
| `FORBIDDEN` | 403 | Authenticated but lacks the permission |
| `NOT_FOUND` | 404 | Missing **or cross-tenant** (no existence leaks) |
| `RESOURCE_CONFLICT` | 409 | Business rule (overlap, duplicate, illegal transition, negative stock) |
| `RATE_LIMITED` | 429 | Sliding-window limit hit |
| `INTERNAL_ERROR` | 500 | Unexpected — details logged server-side only |

Every response carries `x-request-id`, mirrored in logs and audit rows.

## Endpoint inventory (by module)

- **Auth** — `POST /api/auth/signup|login|logout|forgot-password|reset-password`, `GET /api/auth/me` (session + permission list)
- **Org** — `/api/users` (CRUD, `users.manage`), `/api/labs`, `/api/departments`
- **Assets** — `/api/equipment` (list/detail/CRUD), `/api/equipment/lookup?qrToken=`, `/api/documents` (upload/list/download/delete)
- **Booking** — `/api/reservations` (conflict-checked, lifecycle), `/api/checkouts` (issue/return workflow)
- **Stock** — `/api/inventory` (list/create/metadata), `/api/inventory/[id]/transactions` (ledger moves + history), `/api/inventory/transactions` (org-wide ledger), `/api/inventory/reorder`, `/api/chemicals`
- **Reliability** — `/api/maintenance` (work orders), `/api/calibration` (+ `/api/calibration/compliance`)
- **Academics** — `/api/courses`, `/api/experiments`, `/api/sessions` (+ `/attendance`, `/grades`)
- **Safety** — `/api/incidents` (5-state lifecycle, root-cause gate on resolve)
- **Procurement** — `/api/purchases` (requests/approvals), `/api/orders` (POs), `/api/orders/[id]/send`, `/api/orders/[id]/receive` (goods receipt → stock ledger)
- **Insights** — `/api/dashboard`, `/api/operations/attention`, `/api/reports?period=`, `/api/assistant`
- **Platform** — `/api/search`, `/api/notifications` (+ `/generate`), `/api/audit`, `/api/health`, `/api/health/ready`

## Conventions

- List endpoints: `?q=` search, `?page=&pageSize=` pagination (max 200), status/type filters.
- Every query is scoped by `organizationId` from the session.
- Mutations write audit entries; responses for ledger moves include `previousBalance`/`newBalance`.
- Full payload/permission details: [`API_CONTRACT.md`](./API_CONTRACT.md).
