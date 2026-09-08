# Database

## Engine profile

| Profile | Engine | Notes |
|---|---|---|
| Local / demo / CI | SQLite (`db/custom.db`) | zero-setup, file-based |
| Production | PostgreSQL 16 | `scripts/use-postgres.sh "postgresql://…"` swaps the Prisma provider + `DATABASE_URL` |

Prisma schema: `prisma/schema.prisma` (28 models). Baseline migration committed
(`prisma/migrations/`). Status/role fields are strings validated against
`src/lib/constants.ts` (kept portable — SQLite has no native enums).

## Multi-tenancy

Every domain table carries `organizationId` with a FK to `organizations`
(`ON DELETE CASCADE`). All API queries derive it from the authenticated
session. Hot query paths have composite indexes:

- `[organizationId, status]` — labs, equipment, reservations, maintenance, incidents, POs
- `[equipmentId, startAt, endAt]` — reservation conflict checks
- `[organizationId, equipmentId, createdAt]` — lifecycle timelines
- `[organizationId, nextDueAt]` — calibration due lists
- `[organizationId, quantity]` — low-stock scans
- `[userId, read]` — notification bell

## Domain groups

- **Identity** — Organization, User, PasswordResetToken
- **Facilities & assets** — Department, Lab, Equipment, EquipmentEvent (append-only lifecycle), Document
- **Booking** — Reservation (PENDING → APPROVED → ACTIVE → COMPLETED / REJECTED / CANCELLED / NO_SHOW), Checkout
- **Stock** — InventoryItem, InventoryTransaction (append-only ledger), Chemical
- **Reliability** — MaintenanceRecord (work order), CalibrationRecord
- **Academics** — Course, Experiment, LabSession, Attendance, Grade
- **Safety** — Incident (type, root cause, corrective/preventive actions, 5-state lifecycle)
- **Procurement** — Vendor, PurchaseRequest, PurchaseOrder(+Items), GoodsReceipt(+Items)
- **Platform** — AuditLog (requestId-linked), Notification (entity deep-links)

## Integrity rules (enforced in code + tests)

1. **Inventory ledger** — `InventoryItem.quantity` changes ONLY through
   `applyInventoryTransaction` (`src/lib/ledger.ts`): positive quantities for
   RECEIPT/RETURN/ISSUE/DAMAGE/EXPIRY, signed for ADJUSTMENT, balance-unchanged
   for TRANSFER (moves labs), no negative balances, previous/new balance
   recorded on every row. Direct quantity PATCHes are rejected (400
   `LEDGER_ONLY`).
2. **Transactional workflows** — reservation creation (overlap check inside
   `$transaction`), checkout/check-in (+equipment status), maintenance status
   transitions (+equipment sync + downtime/cost rollup), PO receiving
   (receipt rows + ledger RECEIPT movements + status recompute), attendance
   and grades replace-all.
3. **Lifecycle events** — CREATED / RESERVED / CHECKED_OUT / RETURNED /
   MAINTENANCE_STARTED / MAINTENANCE_COMPLETED / CALIBRATION_COMPLETED /
   RETIRED / STATUS_CHANGED are written whenever equipment status changes.
4. **Business rules** — retired equipment cannot be reserved or checked out;
   under-maintenance equipment cannot be checked out; maintenance work orders
   follow an explicit transition map (`assertMaintenanceTransition`).

## PostgreSQL workflow

```bash
./scripts/use-postgres.sh "postgresql://user:pass@host:5432/labvault"
bunx prisma generate
bunx prisma db push          # dev/demo sync
# managed environments: bunx prisma migrate dev   (generates PG-dialect SQL)
./scripts/use-sqlite.sh      # switch back for local work
```

The committed SQLite migration is the local baseline; for production Postgres
run `prisma migrate dev` once in the PG environment to seed its dialect-specific
migration history (documented in `docs/deployment.md`). Docker Compose wires
Postgres 16 automatically.
