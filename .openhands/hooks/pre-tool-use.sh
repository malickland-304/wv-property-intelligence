#!/usr/bin/env bash
# .openhands/hooks/pre-tool-use.sh
# Runs before every OpenHands tool invocation.
# Blocks forbidden commands. Fails with exit 1 to abort the tool call.
# SUPERVISED-ONLY: enforce production safety boundaries.
set -euo pipefail

TOOL_NAME="${1:-}"
TOOL_ARGS="${*:2}"

# ── Forbidden command patterns ─────────────────────────────────────────────
FORBIDDEN=(
  "git push[[:space:]].*main"
  "git push[[:space:]].*--force"
  "git push[[:space:]].*-f[[:space:]]"
  "git merge[[:space:]].*main"
  "git rebase[[:space:]].*main"
  "gh pr merge"
  "railway[[:space:]]"
  "npm install[[:space:]][^-]"  # bare package install (npm install <pkg>)
  "npm i[[:space:]][^-]"        # shorthand install
  "printenv"
  "echo[[:space:]].*SESSION_SECRET"
  "echo[[:space:]].*ADMIN_PASSWORD"
  "echo[[:space:]].*API_KEY"
  "cat[[:space:]].*\.env"
)

for pattern in "${FORBIDDEN[@]}"; do
  if echo "$TOOL_ARGS" | grep -qE "$pattern" 2>/dev/null; then
    echo "❌ BLOCKED by pre-tool-use hook: forbidden pattern '$pattern'" >&2
    echo "   Tool: $TOOL_NAME" >&2
    echo "   Args: $TOOL_ARGS" >&2
    echo "   This action requires explicit human approval. Stop and report." >&2
    exit 1
  fi
done

# ── Hard limit: fail if MAX_ITERATIONS env var is set and exceeded ─────────
if [[ -n "${OPENHANDS_ITERATION:-}" && -n "${OPENHANDS_MAX_ITERATIONS:-}" ]]; then
  if (( OPENHANDS_ITERATION >= OPENHANDS_MAX_ITERATIONS )); then
    echo "❌ BLOCKED: iteration limit reached ($OPENHANDS_ITERATION / $OPENHANDS_MAX_ITERATIONS)" >&2
    echo "   Stop and report to human orchestrator." >&2
    exit 1
  fi
fi

exit 0
