#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="malickland-304/wv-property-intelligence"
API="https://api.github.com/repos/$REPO"

section() {
  printf '\n== %s ==\n' "$1"
}

need() {
  command -v "$1" >/dev/null 2>&1
}

print_state_section() {
  local heading="$1"
  awk -v heading="$heading" '
    $0 ~ "^### " heading { print; in_section=1; next }
    in_section && /^### / { exit }
    in_section { print }
  ' "$ROOT/PROJECT_STATE.md"
}

section "Agent triage protocol"
cat <<'TEXT'
Use this output before asking Phil or relaying between agents.
- Closed facts/gates in PROJECT_STATE.md are not questions.
- Open gates are the only valid user prompts.
- PR and production claims below are CLAIMED until verified live in this run.
- If this script gives enough evidence, act from it instead of asking Phil to copy/paste.
TEXT

section "Resolved facts"
print_state_section "Resolved facts"

section "Open gates"
print_state_section "Open gates"

section "Git"
if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf 'worktree: %s\n' "$ROOT"
  printf 'branch: %s\n' "$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
  printf 'HEAD: %s\n' "$(git -C "$ROOT" rev-parse HEAD)"
  printf 'dirty files:\n'
  git -C "$ROOT" status --short --untracked-files
else
  printf 'not a git worktree: %s\n' "$ROOT"
fi

section "GitHub open PRs"
if need curl; then
  if need jq; then
    curl -fsS "$API/pulls?state=open&per_page=20" \
      | jq -r '.[] | "#\(.number) \(.title) | head=\(.head.sha[0:8]) | base=\(.base.ref) | url=\(.html_url)"'
  else
    curl -fsS "$API/pulls?state=open&per_page=20"
  fi
else
  printf 'curl unavailable; cannot verify GitHub PRs\n'
fi

section "Production health"
if need curl; then
  printf 'GET /api/health: '
  curl -fsS --max-time 10 https://malickland.net/api/health || printf 'FAILED'
  printf '\nGET /api/config: '
  curl -fsS --max-time 10 https://malickland.net/api/config || printf 'FAILED'
  printf '\n'
else
  printf 'curl unavailable; cannot verify production health\n'
fi

section "Production VPS proof"
if need dig; then
  printf 'DNS A records: '
  { dig +short malickland.net A 2>/dev/null || true; } | sort -u | tr '\n' ' '
  printf '\n'
elif need host; then
  printf 'DNS A records: '
  { host malickland.net 2>/dev/null || true; } | awk '/has address/ {print $4}' | sort -u | tr '\n' ' '
  printf '\n'
else
  printf 'dig/host unavailable; cannot verify DNS target\n'
fi

if need ssh; then
  if ssh -o BatchMode=yes -o ConnectTimeout=8 openclaw-vps \
    'printf "vps_host=%s\n" "$(hostname)"; printf "vps_sha=%s\n" "$(git -C /docker/wv-property-intelligence/src rev-parse HEAD)"; docker inspect wv-property-intelligence --format "container={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}} started={{.State.StartedAt}}"' \
    2>/dev/null; then
    printf 'For strict proof: EXPECTED_SHA=<full-sha> bash scripts/verify-vps-prod.sh\n'
  else
    printf 'SSH to openclaw-vps unavailable; cannot verify VPS SHA/container in this run\n'
  fi
else
  printf 'ssh unavailable; cannot verify VPS SHA/container\n'
fi

section "Question rule"
cat <<'TEXT'
Before asking Phil, name the open gate from PROJECT_STATE.md.
If no listed open gate matches, do not ask. Continue with repo-safe work or report the human-owned blocker.
TEXT
