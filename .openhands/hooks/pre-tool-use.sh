#!/usr/bin/env bash
# .openhands/hooks/pre-tool-use.sh
# Invoked by OpenHands before each terminal tool call.
# Input: JSON payload on stdin (event_type, tool_name, tool_input.command, ...).
# Exit 2 = deny (tool call blocked). Exit 0 = allow. Other = error (allow + log).
# See: https://docs.openhands.dev/openhands/usage/customization/hooks

# Read full stdin payload into variable before any parsing
PAYLOAD="$(cat)"

# Extract tool_name and command from JSON — python3 is available in all OpenHands sandboxes
TOOL_NAME="$(echo "$PAYLOAD" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('tool_name', ''))
except Exception:
    print('')
" 2>/dev/null || echo "")"

COMMAND="$(echo "$PAYLOAD" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', {})
    print(ti.get('command', '') if isinstance(ti, dict) else '')
except Exception:
    print('')
" 2>/dev/null || echo "")"

# Belt-and-suspenders: matcher in hooks.json already filters to 'terminal',
# but re-check here in case the hook is wired more broadly.
if [[ "$TOOL_NAME" != "terminal" ]]; then
  exit 0
fi

# ── Forbidden command patterns ─────────────────────────────────────────────
FORBIDDEN=(
  # Production branch mutations — never allowed without human approval
  "git push[[:space:]].*main"
  "git push[[:space:]].*--force"
  "git push[[:space:]].*-f[[:space:]]"
  "git push[[:space:]].*-f$"
  "git merge[[:space:]].*main"
  "git rebase[[:space:]].*main"
  # Merge / deploy — supervised only
  "gh pr merge"
  "railway[[:space:]]"
  # Dependency hygiene: npm install in any form is forbidden (use npm ci)
  "npm install[[:space:]][^-]"
  "npm install$"
  "npm i[[:space:]][^-]"
  "npm i$"
  "npm install[[:space:]].*--save"
  "npm install[[:space:]].*-S[[:space:]]"
  "npm i[[:space:]].*--save"
  "npm i[[:space:]].*-S[[:space:]]"
  # Secret exposure — never log or echo production credentials
  "printenv"
  "echo[[:space:]].*SESSION_SECRET"
  "echo[[:space:]].*ADMIN_PASSWORD"
  "echo[[:space:]].*API_KEY"
  "cat[[:space:]].*\.env"
)

for pattern in "${FORBIDDEN[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern" 2>/dev/null; then
    # Output denial JSON. Do NOT echo the command itself — it may contain secrets.
    printf '{"decision":"deny","reason":"BLOCKED by wv-property-intelligence security hook (pattern: %s). See AGENTS.md supervised-only restrictions."}\n' "$pattern"
    exit 2
  fi
done

# ── Hard limit: block if iteration ceiling is reached ─────────────────────
if [[ -n "${OPENHANDS_ITERATION:-}" && -n "${OPENHANDS_MAX_ITERATIONS:-}" ]]; then
  if (( OPENHANDS_ITERATION >= OPENHANDS_MAX_ITERATIONS )); then
    printf '{"decision":"deny","reason":"BLOCKED: iteration limit reached (%s / %s). Stop and report to human orchestrator."}\n' \
      "${OPENHANDS_ITERATION}" "${OPENHANDS_MAX_ITERATIONS}"
    exit 2
  fi
fi

exit 0
