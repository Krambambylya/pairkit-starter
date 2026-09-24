#!/usr/bin/env bash
# Start local Postgres, apply pending Prisma migrations, then run the API.
# `prisma migrate deploy` only applies new migrations. It does not drop tables
# or wipe rows. `prisma migrate reset` would — this script never runs that.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=jwt-secret.sh
source "$ROOT/scripts/jwt-secret.sh"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Install Docker Desktop (or OrbStack/Colima), start it, then retry." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but not running. Start Docker Desktop (or your Docker engine) and retry." >&2
  exit 1
fi

ENV_FILE="$ROOT/backend/.env.dev"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing backend/.env.dev. Run pnpm setup first." >&2
  exit 1
fi

jwt_secret="$(grep -E '^JWT_SECRET=' "$ENV_FILE" | head -n 1 | cut -d= -f2- || true)"
if is_public_jwt_secret "$jwt_secret" "$ROOT/backend/src/config/public-jwt-secrets.txt"; then
  echo "Set JWT_SECRET in backend/.env.dev (pnpm setup writes one)." >&2
  exit 1
fi

echo "Starting Postgres…"
docker compose up -d --wait

echo "Applying pending Prisma migrations (existing data is kept)…"
pnpm --filter backend exec prisma migrate deploy

echo "Starting API on http://localhost:4000"
exec pnpm --filter backend dev
