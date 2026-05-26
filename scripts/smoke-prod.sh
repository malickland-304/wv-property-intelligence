#!/usr/bin/env bash
set -euo pipefail

BASE="${1:?usage: ./scripts/smoke-prod.sh https://your-site.com}"
BASE="${BASE%/}"

curl -fsS "$BASE/api/health" >/dev/null
curl -fsS "$BASE/api/properties/advent-dr-hampshire-wv" >/dev/null
curl -fsS "$BASE/properties/advent-dr-hampshire-wv" >/dev/null

echo "Production smoke passed"
