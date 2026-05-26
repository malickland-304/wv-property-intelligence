#!/usr/bin/env bash
# Pre-flight gate — run before merge or deploy.
# Validates syntax, dependency integrity, server startup, and core endpoints.
# Does NOT assert specific package names; tests behavior.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/api"

PORT="${PREFLIGHT_PORT:-13001}"
DB_PATH="/tmp/preflight-$$.db"
COOKIE_JAR="/tmp/preflight-cookies-$$.txt"
LOG="/tmp/preflight-$$.log"

cleanup() {
  kill "${SERVER_PID:-}" 2>/dev/null || true
  wait "${SERVER_PID:-}" 2>/dev/null || true
  rm -f "$DB_PATH" "$COOKIE_JAR" "$LOG"
}
trap cleanup EXIT

echo "=== MalickLand pre-flight ==="

# ── 1. Dependency install integrity ─────────────────────────
echo
echo "-- Dependencies --"
if [[ "${SKIP_NPM_CI:-}" == "1" ]]; then
  echo "⚠ Skipping npm ci (SKIP_NPM_CI=1)"
else
  npm ci --quiet
  echo "✓ npm ci"
fi

# ── 2. Syntax ────────────────────────────────────────────────
echo
echo "-- Syntax --"
for f in server.js middleware/auth.js routes/admin.js routes/api.js routes/public.js; do
  node --check "$f"
done
echo "✓ Syntax OK"

# ── 3. Module load ───────────────────────────────────────────
echo
echo "-- Module load --"
node -e "require('./middleware/auth')"
echo "✓ auth.js loads (CSRF middleware dependency resolved)"

# ── 4. Server startup ────────────────────────────────────────
echo
echo "-- Server startup --"
DATABASE_PATH="$DB_PATH" \
ADMIN_PASSWORD="${ADMIN_PASSWORD:-preflight-only}" \
SESSION_SECRET="${SESSION_SECRET:-preflight-only}" \
NODE_ENV=test \
PORT="$PORT" \
  node server.js >"$LOG" 2>&1 &
SERVER_PID=$!

for i in $(seq 1 12); do
  sleep 1
  if curl -fs "http://localhost:$PORT/api/health" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "✗ Server crashed on startup"
    cat "$LOG"
    exit 1
  fi
  if [[ "$i" -eq 12 ]]; then
    echo "✗ Server did not bind within 12 seconds"
    cat "$LOG"
    exit 1
  fi
done
echo "✓ Server started (PID $SERVER_PID)"

# ── 5. Health endpoint ───────────────────────────────────────
echo
echo "-- Health endpoint --"
curl -fsS "http://localhost:$PORT/api/health" >/dev/null
echo "✓ /api/health"

# ── 6. Property API — slug resolution ───────────────────────
echo
echo "-- Property API --"
curl -fsS "http://localhost:$PORT/api/properties/advent-dr-hampshire-wv" >/dev/null
echo "✓ /api/properties/advent-dr-hampshire-wv"

# ── 7. Auth gate — unauthenticated GET redirects ─────────────
echo
echo "-- Auth gate --"
AUTH_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" \
  "http://localhost:$PORT/admin")
if [[ "$AUTH_STATUS" != "302" && "$AUTH_STATUS" != "301" ]]; then
  echo "✗ /admin should redirect unauthenticated requests, got $AUTH_STATUS"
  exit 1
fi
echo "✓ /admin redirects unauthenticated ($AUTH_STATUS)"

# ── 8. CSRF behavioral — POST without token must return 403 ──
# Tests that admin POST routes are CSRF-protected regardless of which
# library implements it. A working CSRF stack always returns 403 here.
echo
echo "-- CSRF behavioral --"
CSRF_REJECTED=$(curl -sS -o /dev/null -w "%{http_code}" \
  -X POST -d "test=1" \
  "http://localhost:$PORT/admin/new")
if [[ "$CSRF_REJECTED" != "403" ]]; then
  echo "✗ /admin/new POST without CSRF token returned $CSRF_REJECTED (expected 403)"
  exit 1
fi
echo "✓ CSRF rejection: POST without token → 403"

echo
echo "PRE-FLIGHT PASSED"
