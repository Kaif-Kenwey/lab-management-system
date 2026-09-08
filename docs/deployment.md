# Deployment

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | `file:./db/custom.db` (SQLite, local) or `postgresql://user:pass@host:5432/db` (production) |
| `JWT_SECRET` | ✅ (prod) | Long random string used to sign session JWTs |
| `NEXT_DIST_DIR` | — | Unique build dir when running multiple servers side-by-side (tests use this) |
| `EMAIL_PROVIDER` | — | When unset, password reset runs in clearly-labelled DEMO mode |

Never commit `.env` — copy `.env.example` and fill values.

## Local (SQLite, zero-setup)

```bash
bun install
cp .env.example .env
bunx prisma db push && bun prisma/seed.ts
bun run dev        # http://localhost:3000
```

## Docker (PostgreSQL, one command)

```bash
docker compose up --build
# app on http://localhost:3000, Postgres 16 with a persistent volume
```

The image is multi-stage (oven/bun), ships the Next.js standalone build, and its
entrypoint switches the Prisma provider to PostgreSQL from `DATABASE_URL`,
syncs the schema (`prisma db push`) and boots `server.js`.

## Platform notes

| Platform | Guidance |
|---|---|
| **Vercel** | Works out of the box; use a managed Postgres (Neon/Supabase/RDS). SQLite is not persistent on serverless. |
| **Railway / Render** | Docker deploy or Node + managed Postgres addon; set `DATABASE_URL` + `JWT_SECRET`. |
| **Fly.io** | `fly launch` with the Dockerfile; attach a Postgres cluster; add a volume if you keep SQLite for single-instance demo. |
| **AWS / Azure** | Container App / ECS Fargate with RDS/Azure Postgres; secrets in the platform vault. |

## Database lifecycle

1. Local dev: `prisma db push` against SQLite (fast iterate) — committed baseline migration exists for `prisma migrate dev`.
2. Production (Postgres): `./scripts/use-postgres.sh "$DATABASE_URL"`, then run `bunx prisma migrate dev` **once** in the production environment to establish the PG-dialect migration history; afterwards `prisma migrate deploy` for releases.
3. `prisma db push` in production is acceptable for this project's scale and is what the Docker entrypoint uses.

## Operations checklist

- Set a strong `JWT_SECRET` (32+ random bytes).
- Postgres backups (managed snapshots or `pg_dump` cron).
- Enable `X-Frame-Options: DENY` + strict CSP (see `docs/security.md`).
- Point uptime checks at `/api/health` (liveness) and `/api/health/ready` (readiness — verifies DB).
- Watch structured request logs (`level`, `requestId`, `status`, `durationMs`, `userId`, `orgId`) — ready for OpenTelemetry shippers.
