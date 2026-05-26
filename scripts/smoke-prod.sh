#!/usr/bin/env bash
# Production smoke test — validates live endpoints after deploy.
# Read-only: no auth, no state changes, no admin routes.
# Usage: PROD_URL=https://malickland.net bash scripts/smoke-prod.sh
set -euo pipefail

PROD_URL="${PROD_URL:-https://malickland.net}"

echo "=== Production smoke test ==="
echo "    Target: $PROD_URL"
echo

check() {
  local label="$1"
  local url="$2"
  local status
  status=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$url")
  if [[ "$status" == "200" ]]; then
    echo "✓ $label ($status)"
  else
    echo "✗ $label — expected 200, got $status"
    return 1
  fi
}

check "/api/health"                          "$PROD_URL/api/health"
check "/api/properties/advent-dr-hampshire-wv" "$PROD_URL/api/properties/advent-dr-hampshire-wv"
check "/listing/advent-dr-hampshire-wv"      "$PROD_URL/listing/advent-dr-hampshire-wv"

echo
# Verify unauthenticated /admin redirects (does not expose admin panel)
AUTH_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$PROD_URL/admin")
if [[ "$AUTH_STATUS" == "302" || "$AUTH_STATUS" == "301" ]]; then
  echo "✓ /admin redirects unauthenticated ($AUTH_STATUS)"
else
  echo "✗ /admin returned $AUTH_STATUS — expected redirect"
  exit 1
fi

echo
echo "SMOKE PASSED"
