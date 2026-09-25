#!/usr/bin/env bash
# Typecheck, lint, and test only the packages touched in the working tree.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

changed="$(
  {
    git diff --name-only --diff-filter=ACMRD
    git diff --name-only --cached --diff-filter=ACMRD
    git ls-files --others --exclude-standard
  } | sed '/^$/d' | sort -u
)"

if [[ -z "$changed" ]]; then
  echo "verify:changed: clean tree"
  exit 0
fi

need_backend=0
need_web=0
need_mobile=0
need_core=0

while IFS= read -r file; do
  case "$file" in
    backend/*) need_backend=1 ;;
    web/*) need_web=1 ;;
    mobile/*) need_mobile=1 ;;
    core-modules/*)
      need_core=1
      need_backend=1
      need_web=1
      need_mobile=1
      ;;
  esac
done <<<"$changed"

if [[ "$need_backend$need_web$need_mobile$need_core" == "0000" ]]; then
  echo "verify:changed: no package files (markdown, rules, skills, or other root files)"
  exit 0
fi

commands=()
add() { commands+=("$1 $2"); }

if [[ "$need_core" -eq 1 ]]; then
  add @pairkit/core typecheck
  add @pairkit/core test:ci
fi
if [[ "$need_backend" -eq 1 ]]; then
  add backend typecheck
  add backend lint
  add backend test:ci
fi
if [[ "$need_web" -eq 1 ]]; then
  add web typecheck
  add web lint
  add web test:ci
fi
if [[ "$need_mobile" -eq 1 ]]; then
  add mobile typecheck
  add mobile lint
  add mobile test:ci
fi

echo "verify:changed: ${commands[*]}"

for command in "${commands[@]}"; do
  # shellcheck disable=SC2086
  pnpm --filter $command
done
