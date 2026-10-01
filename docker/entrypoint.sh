#!/bin/sh
set -e

echo "========================================"
echo "  Automation Studio — starting up"
echo "========================================"

# Wait for Postgres to be ready
echo "⏳ Waiting for PostgreSQL..."
until pg_isready -h "${PGHOST:-postgres}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}" 2>/dev/null; do
  sleep 1
done
echo "✅ PostgreSQL is ready"

# Run schema migrations
echo "🔄 Running database migrations..."
cd /app/lib/db
DATABASE_URL="$DATABASE_URL" drizzle-kit push --config ./drizzle.config.ts --force
echo "✅ Migrations complete"

# Back to app root
cd /app

echo "🚀 Starting API server on port ${PORT:-3000}..."
exec node --enable-source-maps ./artifacts/api-server/dist/index.mjs
