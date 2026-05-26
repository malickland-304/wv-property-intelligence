#!/usr/bin/env bash
# Environment variable validation — run before Railway deploy or local startup.
# Checks that required secrets are set; warns on likely misconfigurations.
# Exits non-zero if any required variable is absent.
set -euo pipefail

ERRORS=0

check_required() {
  local var="$1"
  if [[ -z "${!var:-}" ]]; then
    echo "✗ $var is not set (required)"
    ERRORS=$((ERRORS + 1))
  else
    echo "✓ $var is set"
  fi
}

check_warn() {
  local var="$1"
  local note="$2"
  if [[ -z "${!var:-}" ]]; then
    echo "⚠ $var is not set — $note"
  else
    echo "✓ $var is set"
  fi
}

echo "=== Environment check ==="
echo

echo "-- Required secrets --"
check_required SESSION_SECRET
check_required ADMIN_PASSWORD

echo
echo "-- API access --"
# The runtime reads API_KEY, not ADMIN_API_KEY. Validate the correct name.
check_required API_KEY

echo
echo "-- Database --"
check_required DATABASE_PATH
if [[ -n "${DATABASE_PATH:-}" ]]; then
  DIR="$(dirname "$DATABASE_PATH")"
  if [[ ! -d "$DIR" ]]; then
    echo "  ⚠ Directory '$DIR' does not exist — ensure Railway volume is mounted"
  else
    echo "  ✓ Database directory exists"
  fi
fi

echo
echo "-- Optional / informational --"
check_warn NODE_ENV     "defaults to development"
check_warn PORT         "defaults to 3000"

echo

if [[ "$ERRORS" -gt 0 ]]; then
  echo "ENV CHECK FAILED — $ERRORS missing required variable(s)"
  exit 1
fi

echo "ENV CHECK PASSED"
