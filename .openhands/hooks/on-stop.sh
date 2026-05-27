#!/usr/bin/env bash
# .openhands/hooks/on-stop.sh
# Runs when the OpenHands agent stops (completion, error, or limit reached).
# Emits a structured stop report. Human must review before any merge or deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo ""
echo "=== OpenHands Agent Stop Report ==="
echo "Time: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo ""

echo "--- Git state ---"
git status --short --branch
echo ""

echo "--- Iteration / runtime ---"
echo "Iteration: ${OPENHANDS_ITERATION:-unknown}"
echo "Max allowed: ${OPENHANDS_MAX_ITERATIONS:-10}"
echo ""

echo "--- Unpushed commits ---"
git log --oneline origin/HEAD..HEAD 2>/dev/null || echo "(no unpushed commits)"
echo ""

echo "=== SUPERVISED-ONLY STOP PROTOCOL ==="
echo "  ❌ Do NOT merge this work without human review."
echo "  ❌ Do NOT deploy without explicit human approval."
echo "  ❌ Do NOT push secrets or production credentials."
echo "  ✅ Report this output to the human orchestrator."
echo "=== End Stop Report ==="
