#!/usr/bin/env bash
set -euo pipefail

BASE="${1:?usage: ./scripts/smoke-prod.sh https://your-site.com}"
BASE="${BASE%/}"

LOT="advent-dr-lot-hampshire-wv"

http_code() { curl -s -o /dev/null -w '%{http_code}' "$1"; }

# ── Always-on surfaces ────────────────────────────────────────────────
curl -fsS "$BASE/api/health" >/dev/null
curl -fsS "$BASE/" >/dev/null
curl -fsS "$BASE/37-advent" >/dev/null

# ── Listing routes depend on PUBLIC_LISTINGS_ENABLED, surfaced at /api/config ──
# When listings are OFF (the current production default), the listing detail API
# intentionally returns 404 and the public listing page redirects, so the smoke
# must respect the live flag instead of hard-failing on those routes.
LISTINGS_ENABLED=$(curl -fsS "$BASE/api/config" \
  | grep -oE '"listingsEnabled"[[:space:]]*:[[:space:]]*(true|false)' \
  | grep -oE '(true|false)$' || true)

if [ "$LISTINGS_ENABLED" = "true" ]; then
  # Listings ON: the active Advent Dr Lot must serve on both API and public page.
  curl -fsS "$BASE/api/properties/$LOT" >/dev/null
  curl -fsS "$BASE/properties/$LOT" >/dev/null
  echo "Production smoke passed (listings ENABLED)"
elif [ "$LISTINGS_ENABLED" = "false" ]; then
  # Listings OFF: detail API must be gated (404) and the public page must redirect.
  api_code=$(http_code "$BASE/api/properties/$LOT")
  page_code=$(http_code "$BASE/properties/$LOT")
  [ "$api_code" = "404" ] || { echo "FAIL: /api/properties/$LOT expected 404 with listings off, got $api_code" >&2; exit 1; }
  case "$page_code" in
    301|302) ;;
    *) echo "FAIL: /properties/$LOT expected a redirect with listings off, got $page_code" >&2; exit 1 ;;
  esac
  echo "Production smoke passed (listings DISABLED; listing routes correctly gated)"
else
  echo "FAIL: could not read listingsEnabled from $BASE/api/config" >&2
  exit 1
fi
