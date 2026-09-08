# Architecture

## System overview

LabVault is a **single-deploy full-stack application** — one Next.js process serves
both the React UI (Server + Client Components) and the REST API. This was a
deliberate V2 decision: the earlier Express/Mongo scaffold was replaced by a
single type-safe codepath where the frontend, API and database share one
TypeScript project and one Prisma schema.

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser (React 19)                    │
│   App Router pages · shadcn/ui · TanStack Query · Recharts   │
└───────────────▲──────────────────────────────▲───────────────┘
                │ RSC HTML                     │ fetch (same origin)
┌───────────────┴──────────────────────────────┴───────────────┐
│                      Next.js 16 (Node)                       │
│                                                              │
│  src/app/(app)/*          src/app/api/*                      │
│  Server pages             Route handlers (REST)               │
│        │                        │                            │
│        │                 ┌───────▼──────────────────────┐     │
│        │                 │ withAuth(req, h, permission) │     │
│        │                 │  ├ session (JWT cookie)      │     │
│        │                 │  ├ permission matrix check   │     │
│        │                 │  ├ requestId + structured log│     │
│        │                 │  └ error envelope (ApiError) │     │
│        │                 └───────┬──────────────────────┘     │
│        │                         │                            │
│  src/lib: validation (zod) · ledger · business-rules ·        │
│           lifecycle events · notify · audit · rate-limit      │
│                         │                                     │
│                 Prisma Client (org-scoped queries)            │
└───────────────────────────┬───────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │  SQLite (local/demo)      │
              │  PostgreSQL (production)  │
              └───────────────────────────┘
```

## Request lifecycle (every API call)

1. **Authentication** — the `lms_token` httpOnly JWT cookie is verified (`jose`, HS256). No session → `401 UNAUTHORIZED`.
2. **Authorization** — the handler's permission key (e.g. `procurement.approve`) is checked against the role matrix. Missing → `403 FORBIDDEN`.
3. **Request context** — an `AsyncLocalStorage` context carries the `requestId` for logs, the error envelope and audit rows.
4. **Validation** — bodies are parsed with Zod (`parseBody`). Failures → `400 VALIDATION_ERROR` with field-scoped messages.
5. **Execution** — org-scoped Prisma queries (`organizationId` always from the session, never the client). Multi-step writes run inside `db.$transaction`.
6. **Side effects** — audit trail entry, lifecycle events, ledger movements, notifications — all inside the same transaction where integrity matters.
7. **Response** — `ok(data)` or the typed error envelope `{error:{code,message,requestId}}`. Structured JSON request log line with status + duration.

## Module map

| Domain | Pages | API |
|---|---|---|
| Operations Center | `/dashboard` | `/api/operations/attention`, `/api/dashboard` |
| Labs | `/labs`, `/labs/[id]` | `/api/labs`, `/api/departments` |
| Equipment | `/equipment`, `/equipment/[id]`, `/scan/[token]` | `/api/equipment`, `/api/equipment/lookup` |
| Booking | `/reservations`, `/checkouts` | `/api/reservations`, `/api/checkouts` |
| Inventory | `/inventory` | `/api/inventory`, `/api/inventory/transactions`, `/api/inventory/reorder` |
| Chemicals | `/chemicals` | `/api/chemicals` |
| Maintenance | `/maintenance` | `/api/maintenance`, `/api/calibration` |
| Academics | `/academics` | `/api/courses`, `/api/experiments`, `/api/sessions` |
| Incidents | `/incidents` | `/api/incidents` |
| Procurement | `/procurement` | `/api/purchases`, `/api/orders` (PO + goods receipt) |
| Insights | `/reports`, `/assistant` | `/api/reports`, `/api/assistant` |
| Platform | global search, bell, settings | `/api/search`, `/api/notifications`, `/api/users`, `/api/audit`, `/api/health` |

## Key design decisions

- **Ledger pattern** — `InventoryItem.quantity` is derived state; only `applyInventoryTransaction` mutates it, inside a transaction, recording `previousBalance → newBalance`. Auditable and race-safe.
- **Lifecycle events** — every equipment status change writes an immutable `EquipmentEvent` row; the equipment detail timeline is a direct projection.
- **404, not 403, for cross-tenant ids** — an id from another organization is indistinguishable from a missing one (no existence leaks). Covered by tests.
- **AI assistant** — the LLM never sees the database; a server-side, permission-scoped context digest is built per query (`src/app/api/assistant/route.ts`).
