# Testing

## Suites

| Suite | Command | What it covers | Count |
|---|---|---|---|
| Unit | `bun run test:unit` | Pure logic: permission matrix, business rules/state machines, rate limiter, Zod validation | 37 |
| Integration | `bun run test:integration` | Real HTTP against a dedicated dev server (port 3100, `db/test.db`): auth, tenant isolation, RBAC, booking conflicts, ledger integrity, maintenance transitions, incidents, audit | 33 |
| E2E | `bunx playwright test` | Real browser (Chromium, port 3200, `db/e2e.db`): landing, login/logout, Operations Center, lab creation, QR-page flow, global search | 6 |
| All vitest | `bun run test` | Unit + integration | 70 |

## Test server architecture (integration)

- `tests/integration/global-setup.ts` boots ONE dev server on **port 3100** in the main vitest process (`NEXT_DIST_DIR=.next-test` so it can coexist with the interactive server — Next 16 takes a per-distDir dev lock).
- Fresh SQLite DB: delete → `prisma db push` → `prisma/seed.ts`, then health-probe until ready.
- Workers only **adopt** the healthy server; the global teardown reaps it via pidfile.
- `LABVAULT_SKIP_TEST_SERVER=1` skips the boot (unit-only runs).

## E2E architecture

- Playwright `webServer` boots its own server on **port 3200** with `db/e2e.db`, reseeded by `tests/e2e/global-setup.ts`.
- `expect` timeout is raised to 20s to absorb dev-mode first compiles.
- Chromium only; `--disable-dev-shm-usage` for sandboxes.

## Mandatory scenarios (all green)

- **Auth** — valid login, wrong password (401), suspended account (403), rate limiting (429), unauthenticated access (401).
- **Tenancy** — org B reads/writes org A resources → 404; lists never contain foreign ids; ledger history isolated.
- **RBAC** — student cannot approve procurement / read audit / manage users; technician cannot manage users but can manage maintenance.
- **Business rules** — overlapping reservation race → one 201 + one 409; retired equipment cannot be reserved; under-maintenance equipment cannot be checked out; double checkout → 409; check-in restores availability.
- **Ledger** — over-issue blocked; balances (`previousBalance → newBalance`) recorded; reorder suggestions computed.
- **Work orders** — OPEN → IN_PROGRESS flips equipment to UNDER_MAINTENANCE; COMPLETED restores it with downtime/cost rollup.
- **Audit** — consequential mutations appear in the audit log.

## CI

`.github/workflows/ci.yml` runs install → lint → typecheck → vitest (unit+integration) → production build → Playwright E2E (separate job) → Docker build (best-effort). CI fails on any lint/type/test/build error.
