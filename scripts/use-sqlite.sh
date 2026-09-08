#!/usr/bin/env bash
# Switch back to the local SQLite datasource (development profile).
# Usage: ./scripts/use-sqlite.sh
set -euo pipefail

SCHEMA="prisma/schema.prisma"
sed -i.bak 's/provider = "postgresql"/provider = "sqlite"/' "$SCHEMA" && rm -f "$SCHEMA.bak"

touch .env
if grep -q '^DATABASE_URL=' .env; then
  sed -i.bak 's|^DATABASE_URL=.*|DATABASE_URL="file:./db/custom.db"|' .env && rm -f .env.bak
else
  echo 'DATABASE_URL="file:./db/custom.db"' >> .env
fi

echo "✅ Datasource switched back to SQLite (local dev)."
echo "Next: bunx prisma generate && bunx prisma db push"
