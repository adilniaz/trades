#!/bin/sh
set -e

: "${INFISICAL_CLIENT_ID:?INFISICAL_CLIENT_ID must be set}"
: "${INFISICAL_CLIENT_SECRET:?INFISICAL_CLIENT_SECRET must be set}"
INFISICAL_ENV="${INFISICAL_ENV:-dev}"

# Extract workspaceId from .infisical.json (safe — no secrets in this file)
WORKSPACE_ID=$(grep '"workspaceId"' .infisical.json | cut -d'"' -f4)

echo "Authenticating with Infisical ($INFISICAL_ENV environment)..."
export INFISICAL_TOKEN=$(infisical login \
  --method=universal-auth \
  --client-id="$INFISICAL_CLIENT_ID" \
  --client-secret="$INFISICAL_CLIENT_SECRET" \
  --silent --plain)

echo "Exporting secrets from Infisical..."
eval "$(infisical export \
  --env="$INFISICAL_ENV" \
  --path=/ \
  --projectId="$WORKSPACE_ID" \
  --format=dotenv-export)"

: "${AUTH_SECRET:?AUTH_SECRET must be set in Infisical}"

if [ "$AUTH_SECRET" = "generate-with-npx-auth-secret" ]; then
  echo "ERROR: AUTH_SECRET is using the default placeholder."
  echo "Generate a real secret: openssl rand -base64 32"
  exit 1
fi

: "${DATABASE_URL:?DATABASE_URL must be set in Infisical}"

# Dev environments should seed the admin user on first run.
# Production keeps SKIP_ADMIN_SEED=true from the Dockerfile.
if [ "$INFISICAL_ENV" != "prod" ]; then
  unset SKIP_ADMIN_SEED
fi

echo "Running database migrations..."
ok=false
for i in 1 2 3 4 5; do
  npx prisma migrate deploy && { ok=true; break; }
  echo "Migration attempt $i failed, retrying in 5s..."
  sleep 5
done
$ok || { echo "ERROR: All 5 migration attempts failed."; exit 1; }

echo "Seeding settings..."
npx prisma db seed

exec "$@"
