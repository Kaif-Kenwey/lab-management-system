# Contributing to LabVault

Thanks for contributing! This project aims for enterprise-grade quality: correctness and security over feature count.

## Development setup
```bash
bun install                 # or npm install
cp .env.example .env        # SQLite by default for local dev
bunx prisma db push         # create schema
bun prisma/seed.ts          # demo data (idempotent)
bun run dev                 # http://localhost:3000
```

## Before opening a PR — all must pass
```bash
bun run lint                # ESLint
bunx tsc --noEmit           # Typecheck
bun run test                # Vitest unit + integration
bun run test:e2e            # Playwright (optional locally, required for UI PRs)
```

## Ground rules
1. **Tenant isolation** — every query derives `organizationId` from the server session, never from the request body.
2. **Server-side authorization** — use `withPermission(handler, "permission.key")`; frontend checks are UX only.
3. **Validate input** — every mutating endpoint parses its body with a Zod schema (`parseBody`).
4. **Transactions** — any multi-step write (stock movement, checkout, status transition) must be a `prisma.$transaction`.
5. **Ledger discipline** — never mutate `InventoryItem.quantity` directly; create an `InventoryTransaction`.
6. **Lifecycle events** — equipment status changes must record an `EquipmentEvent`.
7. **Errors** — return `fail(code, message, status)`; never leak stack traces; every response carries a `requestId`.
8. **No fake data** — charts and KPIs read from the database. No dead buttons.

## Project layout
See `docs/architecture.md` and `docs/API_CONTRACT.md` (keep it updated when endpoints change).

## Commit style
Conventional commits preferred: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `ci:`.
