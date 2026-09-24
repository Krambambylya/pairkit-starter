#!/usr/bin/env bash
# Create gitignored local env files. Generates a JWT_SECRET that is not in Git.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=jwt-secret.sh
source "$ROOT/scripts/jwt-secret.sh"
SECRETS_FILE="$ROOT/backend/src/config/public-jwt-secrets.txt"

copy_if_missing() {
  local example="$1"
  local target="$2"
  if [[ -f "$target" ]]; then
    echo "Already exists: ${target#"$ROOT"/}"
    return
  fi
  cp "$example" "$target"
  echo "Created ${target#"$ROOT"/} from ${example#"$ROOT"/}"
}

copy_if_missing "$ROOT/backend/.env.example" "$ROOT/backend/.env.dev"
copy_if_missing "$ROOT/web/.env.example" "$ROOT/web/.env.local"
copy_if_missing "$ROOT/mobile/.env.example" "$ROOT/mobile/.env"

ENV_FILE="$ROOT/backend/.env.dev"
current="$(grep -E '^JWT_SECRET=' "$ENV_FILE" | head -n 1 | cut -d= -f2- || true)"
if is_public_jwt_secret "$current" "$SECRETS_FILE"; then
  if ! command -v openssl >/dev/null 2>&1; then
    echo "Set JWT_SECRET in backend/.env.dev (at least 32 characters). openssl is not installed, so it was not generated." >&2
    exit 1
  fi
  secret="$(openssl rand -base64 32 | tr -d '\n')"
  # macOS and GNU sed differ; write the line without sed -i.
  tmp="$(mktemp)"
  awk -v secret="$secret" '
    BEGIN { done = 0 }
    /^JWT_SECRET=/ && done == 0 { print "JWT_SECRET=" secret; done = 1; next }
    { print }
    END { if (done == 0) print "JWT_SECRET=" secret }
  ' "$ENV_FILE" >"$tmp"
  mv "$tmp" "$ENV_FILE"
  echo "Wrote a new JWT_SECRET into backend/.env.dev (this file is gitignored)."
else
  echo "backend/.env.dev already has a JWT_SECRET."
fi

echo
echo "Local env is ready. Next: pnpm dev:backend"
