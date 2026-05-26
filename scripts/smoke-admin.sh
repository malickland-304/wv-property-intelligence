#!/usr/bin/env bash
# smoke-admin.sh — Authenticated admin smoke test
#
# What this proves (that the public preflight gate does NOT):
#   1. Admin login route is reachable and accepts valid credentials
#   2. Session cookie is issued and persists across requests
#   3. Authenticated routes return 200 (not 302 redirect to login)
#   4. CSRF token is present and non-empty on authenticated pages
#   5. CSRF protection is enforced — POST without token → 403
#   6. CSRF protection works — POST WITH token → not 403
#
# Usage:
#   ADMIN_PASSWORD=<password> ./scripts/smoke-admin.sh
#   ADMIN_PASSWORD=<password> BASE_URL=https://malickland.net ./scripts/smoke-admin.sh
#
# Required:
#   ADMIN_PASSWORD — admin password (never commit this; pass via env or Railway secret)
#
# Optional:
#   BASE_URL — defaults to https://malickland.net
#   VERBOSE  — set to 1 to print raw curl output on failure

set -uo pipefail

BASE_URL="${BASE_URL:-https://malickland.net}"
VERBOSE="${VERBOSE:-0}"
COOKIE_JAR=$(mktemp)
PASS=0
FAIL=0

# ── Validate inputs ───────────────────────────────────────────────────
if [ -z "${ADMIN_PASSWORD:-}" ]; then
  echo "ERROR: ADMIN_PASSWORD is required" >&2
  echo "Usage: ADMIN_PASSWORD=<password> ./scripts/smoke-admin.sh" >&2
  exit 1
fi

cleanup() { rm -f "$COOKIE_JAR"; }
trap cleanup EXIT

# ── Helpers ───────────────────────────────────────────────────────────
pass() { echo "  ✓ $1"; ((PASS++)) || true; }
fail() { echo "  ✗ $1"; ((FAIL++)) || true; }

check_status() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    pass "$label → $actual"
  else
    fail "$label → $actual (expected $expected)"
  fi
}

# curl wrapper: follow redirects, store/send cookies, return HTTP status code
# Usage: http_get <url>  → prints status code, writes body to $BODY
BODY=""
http_get() {
  local url="$1"
  BODY=$(curl -sS -L \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -w '\n__STATUS__%{http_code}' \
    "$url" 2>&1) || true
  echo "${BODY##*__STATUS__}"
  BODY="${BODY%$'\n'__STATUS__*}"
}

# POST form data, do NOT follow redirects (we want the raw redirect status)
http_post_form() {
  local url="$1" data="$2"
  BODY=$(curl -sS \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -X POST \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "" \
    --data "$data" \
    -w '\n__STATUS__%{http_code}' \
    "$url" 2>&1) || true
  echo "${BODY##*__STATUS__}"
  BODY="${BODY%$'\n'__STATUS__*}"
}

# POST form data with CSRF token in body
http_post_with_csrf() {
  local url="$1" data="$2" token="$3"
  BODY=$(curl -sS \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -X POST \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data "${data}&_csrf=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1],safe=''))" "$token" 2>/dev/null || printf '%s' "$token" | sed 's/+/%2B/g;s/=/%3D/g')" \
    -w '\n__STATUS__%{http_code}' \
    "$url" 2>&1) || true
  echo "${BODY##*__STATUS__}"
  BODY="${BODY%$'\n'__STATUS__*}"
}

# Extract content of <meta name="csrf-token" content="...">
extract_csrf() {
  echo "$1" | grep -oP '(?<=<meta name="csrf-token" content=")[^"]*' || \
  echo "$1" | grep -oP "(?<=<meta name='csrf-token' content=')[^']*" || \
  echo ""
}

# ── Test run ──────────────────────────────────────────────────────────
echo ""
echo "=== Admin Smoke Test: $BASE_URL ==="
echo ""

# ── 1. Login page is reachable ───────────────────────────────────────
echo "[ 1/6 ] Login page"
STATUS=$(http_get "$BASE_URL/admin/login")
check_status "GET /admin/login" "200" "$STATUS"

# ── 2. Login POST with valid password ────────────────────────────────
echo "[ 2/6 ] Admin login (POST /admin/login)"
# Login route is exempt from CSRF — just a password field
STATUS=$(curl -sS \
  -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X POST \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "password=$ADMIN_PASSWORD" \
  -w '%{http_code}' -o /dev/null \
  "$BASE_URL/admin/login" 2>&1) || true

# Successful login redirects (302) to /admin
if [ "$STATUS" = "302" ]; then
  pass "POST /admin/login → 302 (session established)"
elif [ "$STATUS" = "200" ]; then
  # Some configs render the dashboard directly — also acceptable
  # but check it's NOT the error page
  BODY_CHECK=$(curl -sS \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -X POST \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "password=$ADMIN_PASSWORD" \
    "$BASE_URL/admin/login" 2>&1) || true
  if echo "$BODY_CHECK" | grep -q "Incorrect password"; then
    fail "POST /admin/login → 200 but body contains 'Incorrect password' — wrong credentials?"
  else
    pass "POST /admin/login → 200 (session established, no redirect)"
  fi
else
  fail "POST /admin/login → $STATUS (expected 302; check ADMIN_PASSWORD)"
  echo ""
  echo "=== RESULT: FAILED ($FAIL failed, $PASS passed) ==="
  echo "  Login failed — remaining checks skipped (no session to test with)"
  exit 1
fi

# ── 3. Authenticated admin dashboard ─────────────────────────────────
echo "[ 3/6 ] Authenticated admin dashboard"
STATUS=$(http_get "$BASE_URL/admin")
check_status "GET /admin (authenticated)" "200" "$STATUS"
ADMIN_BODY="$BODY"

if echo "$ADMIN_BODY" | grep -q "csrf-token"; then
  pass "CSRF meta tag present on /admin"
else
  fail "CSRF meta tag missing on /admin — session may not be authenticated"
fi

# ── 4. Extract CSRF token from authenticated page ────────────────────
echo "[ 4/6 ] CSRF token presence"
# Get a fresh page with CSRF token (use /admin/new which always has a form)
STATUS=$(http_get "$BASE_URL/admin/new")
NEW_BODY="$BODY"
CSRF_TOKEN=$(extract_csrf "$NEW_BODY")

if [ -n "$CSRF_TOKEN" ]; then
  pass "CSRF token extracted from GET /admin/new (length: ${#CSRF_TOKEN})"
else
  fail "CSRF token not found in GET /admin/new response — cannot test CSRF round-trip"
  echo ""
  echo "=== RESULT: PARTIAL ($FAIL failed, $PASS passed) ==="
  exit 1
fi

# ── 5. POST without CSRF token → must be 403 ────────────────────────
echo "[ 5/6 ] CSRF enforcement (POST without token should → 403)"
STATUS=$(curl -sS \
  -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X POST \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'address=smoke-test-no-csrf&city=TestCity&state=WV' \
  -w '%{http_code}' -o /dev/null \
  "$BASE_URL/admin/new" 2>&1) || true

if [ "$STATUS" = "403" ]; then
  pass "POST /admin/new (no CSRF token) → 403 Forbidden — CSRF enforcement confirmed"
elif [ "$STATUS" = "400" ]; then
  pass "POST /admin/new (no CSRF token) → 400 — CSRF rejected (alternate code)"
else
  fail "POST /admin/new (no CSRF token) → $STATUS (expected 403 — CSRF not enforced?)"
fi

# ── 6. POST WITH CSRF token → must NOT be 403 ───────────────────────
echo "[ 6/6 ] CSRF round-trip (POST with valid token should pass CSRF check)"
# We POST invalid/incomplete listing data intentionally — we want to pass
# the CSRF check (not get 403) and get a validation error or redirect instead.
# A 302 or 400 here means CSRF passed; 403 means CSRF failed despite valid token.
STATUS=$(http_post_with_csrf \
  "$BASE_URL/admin/new" \
  "address=SMOKE-TEST-DELETE-ME&city=SmokeCity&state=WV&price=1" \
  "$CSRF_TOKEN")

if [ "$STATUS" = "403" ]; then
  fail "POST /admin/new (with CSRF token) → 403 — CSRF token not accepted (token mismatch?)"
elif [ "$STATUS" = "302" ] || [ "$STATUS" = "200" ] || [ "$STATUS" = "400" ]; then
  pass "POST /admin/new (with valid CSRF token) → $STATUS — CSRF round-trip works"

  # Warn if a listing was actually created (302 typically means success insert)
  if [ "$STATUS" = "302" ]; then
    echo "  ⚠  302 may indicate a test record was inserted — check admin dashboard and delete if so"
  fi
else
  fail "POST /admin/new (with CSRF token) → $STATUS (unexpected)"
fi

# ── Summary ───────────────────────────────────────────────────────────
echo ""
TOTAL=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo "=== RESULT: PASSED ($PASS/$TOTAL checks) ==="
  exit 0
else
  echo "=== RESULT: FAILED ($FAIL/$TOTAL checks failed) ==="
  exit 1
fi
