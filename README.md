# LabVault — Laboratory Operations & Management Platform

A production-grade, **multi-tenant SaaS platform** for running institutional laboratories: equipment lifecycle with QR asset tags, a double-entry-style inventory ledger, conflict-aware reservations, maintenance work orders, calibration compliance, academic practical sessions, safety/incident management and a full procurement cycle (request → approval → purchase order → goods receipt → stock) — behind role-based access control with granular permissions and a complete audit trail.

[![CI](https://github.com/Kaif-Kenwey/lab-management-system/actions/workflows/ci.yml/badge.svg)](https://github.com/Kaif-Kenwey/lab-management-system/actions/workflows/ci.yml)

> **Demo logins** (password for all: `Password@123`)
> `admin@labvault.io` · `manager@labvault.io` · `instructor@labvault.io` · `tech@labvault.io` · `student@labvault.io`

---

## Highlights

- **Operations Center** — an action-first dashboard: *"what needs attention right now?"* Overdue checkouts, calibration compliance, low stock, critical incidents and pending approvals as clickable cards that deep-link into filtered views.
- **Inventory Ledger** — stock never changes silently. Every RECEIPT / ISSUE / RETURN / TRANSFER / ADJUSTMENT / DAMAGE / EXPIRY is a transactional ledger row with `previousBalance → newBalance`, actor, reason and low-stock notifications. Reorder suggestions included.
- **Asset lifecycle** — every equipment status change writes an immutable event; the detail page renders a full timeline (created, reserved, checked out, returned, maintenance, calibration, retired) plus documents, reservations, checkouts and calibration records per asset.
- **QR workflow** — every asset carries a scannable QR that resolves to `/scan/{token}` → authenticated, tenant-checked equipment page with quick actions.
- **Procurement cycle** — Purchase Requests → approvals → Purchase Orders → Send → partial/full Goods Receipt → automatic stock ledger entries → vendor + spend tracking.
- **Work orders & calibration** — OPEN → ASSIGNED → IN_PROGRESS → WAITING_FOR_PARTS → COMPLETED with equipment status sync, downtime hours and labor/parts cost rollup; calibration records with automatic VALID / DUE_SOON / OVERDUE / FAILED status and a compliance KPI.
- **Academics** — departments, courses, experiments, practical sessions, bulk attendance and per-session grading.
- **AI Lab Assistant** — permission-scoped operational Q&A. The server builds a role-appropriate data digest (never the raw database), asks the LLM, and returns the answer with source links and an "AI-generated insight" disclaimer.
- **Global search (⌘K)** — grouped results across labs, equipment, inventory, reservations, incidents, maintenance and experiments.
- **Platform** — multi-tenancy, RBAC (5 roles × 31 permissions), immutable-style audit trail with request IDs, notifications with deep links, health/readiness endpoints, structured JSON logs.

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Browser (React 19)                   │
│  App Router · shadcn/ui · TanStack Query · Recharts    │
└──────────────▲───────────────────────▲─────────────────┘
               │ RSC                   │ fetch /api
┌──────────────┴───────────────────────┴─────────────────┐
│                   Next.js 16 (Node)                    │
│  Pages (RSC)          REST route handlers              │
│                         │                              │
│            withAuth: session → permission →            │
│            requestId → zod → transaction → audit       │
│                         │                              │
│   lib: ledger · business-rules · lifecycle · notify    │
│                         │                              │
│              Prisma ORM (org-scoped queries)           │
└─────────────────┬──────────────────────┬───────────────┘
                  │                      │
           SQLite (local/demo)     PostgreSQL (prod)
```

## Tech stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 16** (App Router, RSC, Turbopack), **React 19**, **TypeScript 5** (strict) |
| Database | **Prisma ORM** — SQLite (local/CI) · **PostgreSQL 16** (production profile) |
| UI | **Tailwind CSS 4** · **shadcn/ui** (New York) · Lucide · Recharts · next-themes (dark mode) |
| State/data | **TanStack Query v5** |
| Auth | **jose** (JWT HS256, httpOnly cookies) + **bcryptjs** |
| Validation | **Zod** on every mutating endpoint |
| AI | z-ai-web-dev-sdk LLM with permission-scoped context |
| Quality | **ESLint** · **Vitest** (unit + integration) · **Playwright** (E2E) · **GitHub Actions CI** |
| Ops | Docker multi-stage image · docker-compose (app + Postgres) · health/readiness endpoints |

## Security architecture

- **AuthN** — bcrypt (cost 10), JWT in httpOnly cookies (SameSite-aware for iframe deployments), 7-day expiry, login rate limiting, generic auth errors (no user enumeration).
- **AuthZ** — 31 granular permissions across 5 roles enforced **server-side** on every endpoint; the UI merely mirrors them.
- **Tenancy** — every record carries `organizationId` derived from the session; cross-tenant ids return **404** (no existence leaks); covered by dedicated tests.
- **Integrity** — DB transactions for all multi-step workflows; append-only inventory ledger and equipment lifecycle; explicit state machines for reservations, work orders and incidents.
- **Input** — Zod schemas; typed error envelope `{error:{code,message,requestId}}`; security headers; upload allowlist with magic-byte checks and size caps.
- Details: [`docs/security.md`](docs/security.md) · [`docs/permissions.md`](docs/permissions.md)

## Quickstart (local, SQLite)

```bash
bun install                      # or npm install
cp .env.example .env
bunx prisma db push
bun prisma/seed.ts               # realistic demo org (idempotent)
bun run dev                      # http://localhost:3000
```

## Docker (PostgreSQL, one command)

```bash
docker compose up --build        # app :3000 + postgres:16 with persistent volume
```

## Testing

```bash
bun run test            # 70 tests: unit (37) + integration (33)
bunx playwright test    # 6 browser E2E tests
bun run lint && bun run typecheck
```

Integration tests boot a dedicated server (port 3100) against a seeded test DB; E2E uses port 3200. CI runs all of it plus a production build — see [`docs/testing.md`](docs/testing.md).

## Project structure

```
src/
├── app/
│   ├── (auth)/          # login / register (+ demo-mode password reset)
│   ├── (app)/           # authenticated shell: 14 module pages
│   ├── scan/[token]/    # QR → tenant-checked equipment redirect
│   ├── api/             # REST handlers (auth, labs, equipment, reservations,
│   │                    #   checkouts, inventory+ledger, chemicals, maintenance,
│   │                    #   calibration, orders+receipts, academics, incidents,
│   │                    #   documents, notifications, search, operations,
│   │                    #   reports, assistant, audit, health)
│   └── page.tsx         # public landing
├── components/          # shadcn/ui + app shell + shared (badge, cards, timeline)
├── lib/                 # auth, api (withAuth), permissions, ledger, business-rules,
│                        #   lifecycle, notify, validation, rate-limit, errors, client
prisma/                  # schema (28 models) + migrations + seed
docs/                    # architecture, database, security, permissions, api, testing,
                         #   deployment, audit-v2, API_CONTRACT
tests/                   # unit · integration · e2e
```

## Documentation

[`docs/architecture.md`](docs/architecture.md) · [`docs/database.md`](docs/database.md) · [`docs/security.md`](docs/security.md) · [`docs/permissions.md`](docs/permissions.md) · [`docs/api.md`](docs/api.md) · [`docs/testing.md`](docs/testing.md) · [`docs/deployment.md`](docs/deployment.md) · [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) · [`docs/audit-v2.md`](docs/audit-v2.md)

## Roadmap

Email/Slack notification transports · S3-compatible document storage · OpenTelemetry tracing · JWT revocation store · 2FA · report exports to PDF · reservation calendar views.

## Contributors

- **Kaif Kenwey** — [@Kaif-Kenwey](https://github.com/Kaif-Kenwey)
- **Shyamali Samant** — [@ShyamaliSamant](https://github.com/ShyamaliSamant) (original concept & early prototype)

## License

MIT — see [LICENSE](LICENSE)
