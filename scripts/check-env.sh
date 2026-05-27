#!/usr/bin/env bash
set -euo pipefail

required=(
  API_KEY
  DATABASE_PATH
  SESSION_SECRET
  ADMIN_PASSWORD
)

missing=0
for var in "${required[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "Missing: $var"
    missing=1
  fi
done

if [[ "$missing" -eq 1 ]]; then
  exit 1
fi

echo "Environment OK"
