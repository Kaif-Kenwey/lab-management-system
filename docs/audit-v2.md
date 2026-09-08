# LabVault V2 — Codebase Audit & Improvement Plan (Phase 0)

Audited: full codebase at commit `95a2bea` (Next.js 16 fullstack, 16-model Prisma/SQLite schema, 30 API route files, 16 pages).

## What was already good
- Uniform API pattern: every handler wrapped in `withAuth(session ⇒ …, roles?)` — session-derived `organizationId` on every query (no browser-supplied tenant IDs anywhere)
- JWT httpOnly-cookie sessions (SameSite=None/Secure behind HTTPS, Lax locally), bcrypt password hashing
- Real business logic: reservation conflict detection (409), checkout↔equipment status sync, maintenance→equipment status sync, purchase approval role gates
- Audit trail written by every mutation; seed data realistic; consistent shadcn/ui pages with loading/empty/error states
- Clean repo (no node_modules/secrets tracked), .env.example, LICENSE, docs/API_CONTRACT.md

## Identified gaps → classification

### CRITICAL
1. Inventory quantity is mutated directly — no ledger, no history, no negative-stock guard, no balance integrity (Phase 5)
2. No equipment lifecycle history; status changes are opaque (Phase 6)
3. Business rules incomplete: RETIRED equipment can still be reserved; maintenance race windows on checkout (Phase 7)
4. Reservation conflict check not wrapped in a transaction; lifecycle too shallow (no NO_SHOW/ACTIVE states) (Phase 8)
5. Error responses are `{error: string}` — no machine codes, no requestId, raw messages risk leaking internals (Phase 26)
6. No input validation layer (Zod) on API bodies; no rate limiting on auth endpoints (Phase 23)
7. No tests at all (Phase 24)

### HIGH
8. No calibration domain (compliance tracking, due alerts) (Phase 11)
9. Procurement stops at PurchaseRequest — no PO / goods receipt / receiving→inventory flow (Phase 12)
10. Academics lacks Department/Course/Evaluation context (Phase 13)
11. Incidents lack type, root-cause, corrective/preventive actions, CONTAINED/CLOSED states (Phase 14)
12. No document attachments (Phase 16)
13. Notifications are decorative — not event-driven, not clickable, no unread tracking in UI (Phase 17)
14. Dashboard is stat-decorative, not action-first "what needs attention" (Phases 18, 29)
15. No global search (Phase 20); QR codes dead-end into a dialog instead of an equipment page (Phase 21)
16. No AI assistant (Phase 22)
17. No observability: no health/readiness endpoints, no request IDs, logs are Prisma noise (Phase 27)
18. No CI/CD, no Docker (Phases 35–36)
19. Security headers absent; no password-reset flow (Phase 23)

### MEDIUM
20. Reports are thin — need real KPIs (utilization, downtime, compliance, consumption) with period comparison (Phase 19)
21. No permissions matrix (roles only) — granular server-side checks needed (Phase 4)
22. Seed data too small for a credible demo (30–50 equipment, 100+ inventory items required) (Phase 25)
23. DB workflow relies on `db push`; needs migrations + PostgreSQL path (Phase 2, 34)

### OPTIONAL
24. E2E visual polish, column-visibility/pagination on all tables, exports (Phases 28, 32)
25. Slack/Teams/email providers (explicitly deferred — not configured)

## Execution order (respects the product priority: Operations Center → Inventory Ledger → Asset Lifecycle → Procurement → Academics → AI; engineering priority: PG-path → Transactions → Security → Testing → CI/CD → Observability)

- V2-1 This audit + SECURITY.md + CONTRIBUTING.md + contract v2
- V2-2 Schema v2 (+11 models, composite tenant indexes, migration baseline, PG provider script)
- V2-3 Core libs: permissions, error envelope + request IDs + structured logs, Zod validation, rate limiting, business rules, ledger helper, notification events; security headers
- V2-4a/4b Backend waves A1/A2 (all domain APIs above)
- V2-5a/5b Frontend waves (Operations Center, ledger UI, equipment timeline + /scan QR route, Cmd+K search, bell, AI assistant, procurement/academics/incidents/reports upgrades)
- V2-6 Vitest unit+integration (auth, tenancy, RBAC, business rules, ledger), Playwright E2E, GitHub Actions, Docker, docs suite
- V2-7 Integration verification + security pass (IDOR/tenant-escape probes) + push + final engineering report
