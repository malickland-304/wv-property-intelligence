#!/usr/bin/env bash
set -euo pipefail

BASE="${1:?usage: ./scripts/smoke-prod.sh https://your-site.com}"
BASE="${BASE%/}"

curl -fsS "$BASE/api/health" >/dev/null
curl -fsS "$BASE/" >/dev/null
curl -fsS "$BASE/37-advent" >/dev/null

CONFIG_JSON="$(curl -fsS "$BASE/api/config")"
LISTINGS_ENABLED="$(
  CONFIG_JSON="$CONFIG_JSON" node -e '
    try {
      const config = JSON.parse(process.env.CONFIG_JSON || "{}");
      process.stdout.write(config.listingsEnabled ? "true" : "false");
    } catch (err) {
      console.error("Error parsing /api/config JSON:", err.message);
      process.exit(1);
    }
  '
)"

if [[ "$LISTINGS_ENABLED" == "true" ]]; then
  # Active listing coverage (the Advent Dr Lot is the current active listing).
  curl -fsS "$BASE/api/properties/advent-dr-lot-hampshire-wv" >/dev/null
  curl -fsS "$BASE/properties/advent-dr-lot-hampshire-wv" >/dev/null
else
  echo "Public listings disabled; skipped active listing route checks"
fi

echo "Production smoke passed"
