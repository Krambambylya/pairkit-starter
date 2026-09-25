#!/usr/bin/env bash
# stop hook: re-run verify:changed and ask the agent to fix a red result.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
input="$(cat)"

status="$(printf '%s' "$input" | python3 -c 'import json,sys
try:
    data=json.load(sys.stdin)
except Exception:
    data={}
print(data.get("status") or "completed")')"

if [[ "$status" != "completed" ]]; then
  echo '{}'
  exit 0
fi

set +e
output="$(bash "$ROOT/scripts/verify-changed.sh" 2>&1)"
code=$?
set -e

if [[ "$code" -eq 0 ]]; then
  echo '{}'
  exit 0
fi

printf '%s\n' "$output" | tail -n 80 | python3 -c '
import json, os, sys
tail = sys.stdin.read()[-6000:]
message = (
    "pnpm verify:changed failed. Fix the packages it reported and run it again until it exits 0.\n\n"
    + tail
)
json.dump({"followup_message": message}, sys.stdout)
print()
'
