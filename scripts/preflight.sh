#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/api"
if [[ -n "${PREFLIGHT_PORT:-}" ]]; then
  PORT_TO_USE="$PREFLIGHT_PORT"
else
  if ! PORT_TO_USE="$(node -e "const net=require('net'); const s=net.createServer(); s.listen(0,'127.0.0.1',()=>{console.log(s.address().port); s.close();});")" || [[ -z "$PORT_TO_USE" ]]; then
    PORT_TO_USE="3000"
  fi
fi
if [[ ! "$PORT_TO_USE" =~ ^[0-9]+$ ]] || (( PORT_TO_USE < 1 || PORT_TO_USE > 65535 )); then
  echo "✗ Invalid preflight port: $PORT_TO_USE" >&2
  exit 1
fi
TMP_DIR="$(mktemp -d)"
APP_LOG="$TMP_DIR/app.log"
PID=""

cleanup() {
  if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cd "$API_DIR"

echo "== Dependency checks =="
npm ls express better-sqlite3 csrf-csrf >/dev/null
echo "✓ Runtime dependency tree OK"
echo

echo "== Syntax checks =="
node --check server.js
node --check db.js
node --check middleware/auth.js
node --check routes/api.js
node --check routes/public.js
node --check routes/admin.js
echo "✓ Syntax OK"
echo

echo "== Public assistant flag regression =="
node "$ROOT/tests/public-assistant-flag.test.js"
echo "✓ Public assistant flag OK"
echo

echo "== Startup smoke =="
PORT="$PORT_TO_USE" DATABASE_PATH="$TMP_DIR/preflight.db" NODE_ENV=test PUBLIC_LISTINGS_ENABLED=true API_KEY=preflight-api-key SESSION_SECRET=preflight-session-secret ADMIN_PASSWORD=preflight-admin-password node server.js > "$APP_LOG" 2>&1 &
PID=$!

for _ in {1..30}; do
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "✗ Server failed to start"
    cat "$APP_LOG"
    exit 1
  fi
  if curl -fsS "http://127.0.0.1:$PORT_TO_USE/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "http://127.0.0.1:$PORT_TO_USE/api/health" >/dev/null; then
  echo "✗ Health endpoint did not become ready"
  cat "$APP_LOG"
  exit 1
fi
echo "✓ Server started"
echo

echo "== Health endpoint =="
curl -fsS "http://127.0.0.1:$PORT_TO_USE/api/health" >/dev/null
echo "✓ Health OK"
echo

echo "== Property detail API =="
curl -fsS "http://127.0.0.1:$PORT_TO_USE/api/properties/advent-dr-hampshire-wv" >/dev/null
echo "✓ Property endpoint OK"
echo

echo "== Public property page =="
curl -fsS "http://127.0.0.1:$PORT_TO_USE/properties/advent-dr-hampshire-wv" >/dev/null
echo "✓ Public property page OK"
echo

# Assistant runs with NO AI key here — it must degrade gracefully (HTTP 200 +
# fallback reply), never 404/500. Sends a same-origin header so the request
# clears requireLeadSameOrigin like a real browser POST.
echo "== Assistant chat endpoint (safe-by-default, no AI key) =="
CHAT_STATUS="$(curl -s -o "$TMP_DIR/chat.json" -w '%{http_code}' \
  -X POST "http://127.0.0.1:$PORT_TO_USE/api/chat" \
  -H "Content-Type: application/json" \
  -H "Origin: http://127.0.0.1:$PORT_TO_USE" \
  -d '{"messages":[{"role":"user","content":"Do you have land in Hampshire County?"}]}')"
if [[ "$CHAT_STATUS" != "200" ]]; then
  echo "✗ /api/chat returned HTTP $CHAT_STATUS (expected 200 fallback with no AI key)"
  cat "$TMP_DIR/chat.json" 2>/dev/null || true
  cat "$APP_LOG"
  exit 1
fi
if ! grep -q '"reply"' "$TMP_DIR/chat.json"; then
  echo "✗ /api/chat 200 but no reply field in body"
  cat "$TMP_DIR/chat.json"
  exit 1
fi
echo "✓ Assistant endpoint OK (graceful fallback)"
echo

echo "== Shutdown =="
cleanup
trap - EXIT
echo
echo "PRE-FLIGHT PASSED"
