#!/bin/sh
set -e

: "${AUTH_SECRET:?AUTH_SECRET must be set}"
: "${DATABASE_URL:?DATABASE_URL must be set}"

echo "Running database migrations..."
ok=false
for i in 1 2 3 4 5; do
  npx prisma migrate deploy && { ok=true; break; }
  echo "Migration attempt $i failed, retrying in 5s..."
  sleep 5
done
$ok || { echo "ERROR: All 5 migration attempts failed."; exit 1; }

exec "$@"
