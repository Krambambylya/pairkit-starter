#!/usr/bin/env bash
# Start API + web (if needed) and run the sync smoke Playwright test.
# Web must be origin-listed in backend WHITE_LIST_URLS (default http://localhost:3000).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_URL="${PLAYWRIGHT_API_URL:-http://localhost:4000}"
WEB_URL="${PLAYWRIGHT_BASE_URL:-http://localhost:3000}"
started_api=0
started_web=0

cleanup() {
  if [[ "$started_web" -eq 1 && -n "${web_pid:-}" ]]; then
    kill "$web_pid" 2>/dev/null || true
  fi
  if [[ "$started_api" -eq 1 && -n "${api_pid:-}" ]]; then
    kill "$api_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

wait_for() {
  local url="$1"
  local name="$2"
  local i
  for i in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "smoke: $name ready"
      return 0
    fi
    sleep 1
  done
  echo "smoke: $name did not become ready at $url" >&2
  return 1
}

if ! curl -fsS "$API_URL/ready" >/dev/null 2>&1; then
  if [[ "${CI:-}" == "true" ]]; then
    echo "smoke: starting API"
    (cd "$ROOT/backend" && NODE_ENV=test pnpm start) &
    api_pid=$!
    started_api=1
    wait_for "$API_URL/ready" "API"
  else
    echo "smoke: API is not up at $API_URL/ready. Start it with pnpm dev:backend, then retry." >&2
    exit 1
  fi
fi

# Pairkit mounts /v1/items. A 404 here usually means another API is bound to the same port.
items_code="$(
  curl -sS -o /dev/null -w '%{http_code}' -X POST "$API_URL/v1/items/manifest" \
    -H 'Content-Type: application/json' \
    -d '{"entries":[]}' || true
)"
if [[ "$items_code" == "404" ]]; then
  echo "smoke: $API_URL/v1/items/manifest returned 404. That is not Pairkit (stop the other process on that port, then pnpm dev:backend)." >&2
  exit 1
fi
if [[ "$items_code" != "401" && "$items_code" != "200" ]]; then
  echo "smoke: unexpected status $items_code from $API_URL/v1/items/manifest" >&2
  exit 1
fi
echo "smoke: Pairkit items API ok ($items_code)"
if ! curl -fsS "$WEB_URL" >/dev/null 2>&1; then
  if [[ "${CI:-}" == "true" ]]; then
    echo "smoke: starting web"
    (
      cd "$ROOT/web"
      NODE_ENV=production \
        NEXT_PUBLIC_API_URL="$API_URL" \
        NEXT_PUBLIC_SITE_URL="$WEB_URL" \
        NEXT_PUBLIC_SYNC_WEB_ENABLED=true \
        pnpm start
    ) &
    web_pid=$!
    started_web=1
    wait_for "$WEB_URL" "web"
  else
    echo "smoke: web is not up at $WEB_URL. Start it with pnpm dev:web, then retry." >&2
    exit 1
  fi
fi

export PLAYWRIGHT_BASE_URL="$WEB_URL"
pnpm --filter web test:e2e
