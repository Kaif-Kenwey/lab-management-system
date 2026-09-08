#!/bin/sh
set -e

echo "[entrypoint] LabVault starting…"

# Production profile: switch the Prisma datasource to PostgreSQL when
# DATABASE_URL points at Postgres (docker-compose does this by default).
case "$DATABASE_URL" in
  postgres*)
    echo "[entrypoint] PostgreSQL target detected — switching datasource provider"
    ./scripts/use-postgres.sh "$DATABASE_URL"
    ;;
  *)
    echo "[entrypoint] Using DATABASE_URL as configured"
    ;;
esac

echo "[entrypoint] Syncing database schema (prisma db push)…"
bunx prisma db push --skip-generate --accept-data-loss

echo "[entrypoint] Launching LabVault on port ${PORT:-3000}"
exec node server.js
