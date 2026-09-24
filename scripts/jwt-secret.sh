#!/usr/bin/env bash
# Shared check for JWT_SECRET values listed in backend/src/config/public-jwt-secrets.txt.

is_public_jwt_secret() {
  local value="$1"
  local list="$2"
  [[ -z "$value" ]] && return 0
  grep -Fqx -- "$value" "$list"
}
