#!/usr/bin/env bash
# Switch the Prisma datasource to PostgreSQL (production profile).
# Usage: ./scripts/use-postgres.sh "postgresql://user:password@host:5432/labvault"
set -euo pipefail

DB_URL="${1:-}"
if [ -z "$DB_URL" ]; then
  echo "Usage: $0 \"postgresql://user:password@host:5432/labvault\""
  exit 1
fi

SCHEMA="prisma/schema.prisma"

# Swap the provider
sed -i.bak 's/provider = "sqlite"/provider = "postgresql"/' "$SCHEMA" && rm -f "$SCHEMA.bak"

# Point DATABASE_URL at Postgres in .env (create if missing)
touch .env
if grep -q '^DATABASE_URL=' .env; then
  sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=\"${DB_URL}\"|" .env && rm -f .env.bak
else
  echo "DATABASE_URL=\"${DB_URL}\"" >> .env
fi

echo "✅ Datasource switched to PostgreSQL."
echo "Next steps:"
echo "  bunx prisma generate"
echo "  bunx prisma db push          # quick sync for dev/demo"
echo "  # or, for a managed environment: bunx prisma migrate dev"
