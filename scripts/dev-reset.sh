#!/usr/bin/env sh

set -eu

echo "==> Full reset: stop + cleanup + fresh start"
"$(dirname "$0")/dev-down.sh" --all
"$(dirname "$0")/dev-up.sh"
