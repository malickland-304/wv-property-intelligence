#!/usr/bin/env bash
# PR readiness gate: checks the READY conditions in AGENTS.md ("PR Readiness Gate")
# against live GitHub state and prints a verdict in the gatekeeper response format.
#
#   bash scripts/pr-readiness.sh <pr-number> [expected-head-sha]
#   EXPECT_VPS_SHA=<sha> bash scripts/pr-readiness.sh <pr-number> [expected-head-sha]
#
# Fails closed: anything it cannot verify is a blocking fact, never a pass.
# Exit code: 0 READY, 1 NOT READY, 2 usage or tooling error.
#
# Needs curl and jq. Review-thread state comes from GitHub GraphQL, which needs
# authentication: an authenticated `gh` CLI, or GITHUB_TOKEN in the environment.
# Without either, threads are UNKNOWN and the verdict is NOT READY.
set -euo pipefail

REPO="${REPO:-malickland-304/wv-property-intelligence}"
API="https://api.github.com/repos/$REPO"
VPS_TARGET="${VPS_TARGET:-root@31.97.58.203}"
VPS_SRC="${VPS_SRC:-/docker/wv-property-intelligence/src}"

usage() { echo "usage: bash scripts/pr-readiness.sh <pr-number> [expected-head-sha]" >&2; exit 2; }

PR="${1:-}"
EXPECTED="${2:-}"
[[ "$PR" =~ ^[0-9]+$ ]] || usage
[[ -z "$EXPECTED" || "$EXPECTED" =~ ^[0-9a-f]{7,40}$ ]] || { echo "expected-head-sha must be a hex commit sha" >&2; exit 2; }
[[ -z "${EXPECT_VPS_SHA:-}" || "${EXPECT_VPS_SHA}" =~ ^[0-9a-f]{7,40}$ ]] || { echo "EXPECT_VPS_SHA must be a hex commit sha" >&2; exit 2; }
for bin in curl jq; do
  command -v "$bin" >/dev/null 2>&1 || { echo "missing required tool: $bin" >&2; exit 2; }
done

blockers=()
verified=()
block()  { blockers+=("$1"); }
ok()     { verified+=("$1"); }

AUTH=()
[[ -n "${GITHUB_TOKEN:-}" ]] && AUTH=(-H "Authorization: Bearer ${GITHUB_TOKEN}")

api() {
  curl -fsS --max-time 20 -H "Accept: application/vnd.github+json" ${AUTH[@]+"${AUTH[@]}"} "$API/$1"
}

# ── 1. PR state and head SHA ─────────────────────────────────────────────────
# GitHub computes mergeability asynchronously; "unknown" right after a push is normal.
pr_json=""
for attempt in 1 2 3 4 5; do
  if ! pr_json="$(api "pulls/$PR")"; then
    echo "could not read PR #$PR from the GitHub API" >&2
    exit 2
  fi
  [[ "$(jq -r '.mergeable_state' <<<"$pr_json")" != "unknown" ]] && break
  sleep 3
done

state="$(jq -r '.state' <<<"$pr_json")"
draft="$(jq -r '.draft' <<<"$pr_json")"
merged="$(jq -r '.merged' <<<"$pr_json")"
head_sha="$(jq -r '.head.sha' <<<"$pr_json")"
head_ref="$(jq -r '.head.ref' <<<"$pr_json")"
base_ref="$(jq -r '.base.ref' <<<"$pr_json")"
mergeable="$(jq -r '.mergeable' <<<"$pr_json")"
merge_state="$(jq -r '.mergeable_state' <<<"$pr_json")"

if [[ "$state" != "open" ]]; then
  block "PR is $state (merged=$merged), not open"
fi
[[ "$draft" == "true" ]] && block "PR is a draft"

if [[ -n "$EXPECTED" ]]; then
  if [[ "$head_sha" == "$EXPECTED"* ]]; then
    ok "head SHA: ${head_sha:0:7} matches expected ${EXPECTED:0:7} ($head_ref -> $base_ref)"
  else
    block "head SHA mismatch: PR head is ${head_sha:0:7}, expected ${EXPECTED:0:7}"
  fi
else
  ok "head SHA: ${head_sha:0:7} ($head_ref -> $base_ref); no expected SHA given, so this run verifies that commit only"
fi

# ── 2. Merge state ───────────────────────────────────────────────────────────
if [[ "$merge_state" == "clean" && "$mergeable" == "true" ]]; then
  ok "merge state: clean, mergeable"
else
  block "merge state: mergeable_state=$merge_state, mergeable=$mergeable (needs clean/true)"
fi

# ── 3. Checks on the head commit ────────────────────────────────────────────
# Every check run must be completed and green; any commit status must be success.
# (Stricter than "required checks only": the list of required checks needs admin access.)
if runs_json="$(api "commits/$head_sha/check-runs?per_page=100")"; then
  total="$(jq -r '.total_count' <<<"$runs_json")"
  pending="$(jq -r '[.check_runs[] | select(.status != "completed") | .name] | join(", ")' <<<"$runs_json")"
  failing="$(jq -r '[.check_runs[] | select(.status == "completed" and (.conclusion | IN("success","neutral","skipped") | not)) | "\(.name)=\(.conclusion)"] | join(", ")' <<<"$runs_json")"
  if [[ "$total" == "0" ]]; then
    block "checks: no check runs found on ${head_sha:0:7} (CI has not reported yet)"
  elif [[ "$total" -gt 100 ]]; then
    block "checks: $total check runs, more than one page; verify by hand"
  else
    [[ -n "$pending" ]] && block "checks still running: $pending"
    [[ -n "$failing" ]] && block "checks failing: $failing"
    [[ -z "$pending" && -z "$failing" ]] && ok "checks: $total/$total check runs completed green on ${head_sha:0:7}"
  fi
else
  block "checks: could not read check runs for ${head_sha:0:7}"
fi

if status_json="$(api "commits/$head_sha/status")"; then
  s_total="$(jq -r '.total_count' <<<"$status_json")"
  s_state="$(jq -r '.state' <<<"$status_json")"
  if [[ "$s_total" != "0" && "$s_state" != "success" ]]; then
    block "commit statuses: combined state is $s_state ($s_total statuses)"
  elif [[ "$s_total" != "0" ]]; then
    ok "commit statuses: $s_total, combined success"
  fi
else
  block "commit statuses: could not read for ${head_sha:0:7}"
fi

# ── 4. Review threads (GraphQL, needs auth) ─────────────────────────────────
THREADS_QUERY='query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){pullRequest(number:$n){reviewThreads(first:100){totalCount nodes{isResolved isOutdated path line comments(first:1){nodes{author{login} body}}}}}}}'
owner="${REPO%%/*}"; name="${REPO##*/}"
threads_json=""
if command -v gh >/dev/null 2>&1 && threads_json="$(gh api graphql -f query="$THREADS_QUERY" -F owner="$owner" -F name="$name" -F n="$PR" 2>/dev/null)"; then
  :
elif [[ -n "${GITHUB_TOKEN:-}" ]]; then
  body="$(jq -n --arg q "$THREADS_QUERY" --arg owner "$owner" --arg name "$name" --argjson n "$PR" \
           '{query:$q, variables:{owner:$owner, name:$name, n:$n}}')"
  threads_json="$(curl -fsS --max-time 20 -H "Authorization: Bearer ${GITHUB_TOKEN}" \
                    -H "Content-Type: application/json" -d "$body" https://api.github.com/graphql)" || threads_json=""
fi

if [[ -z "$threads_json" ]] || ! jq -e '.data.repository.pullRequest.reviewThreads' >/dev/null 2>&1 <<<"$threads_json"; then
  block "review threads: UNKNOWN (needs an authenticated gh or GITHUB_TOKEN for GraphQL)"
else
  t_total="$(jq -r '.data.repository.pullRequest.reviewThreads.totalCount' <<<"$threads_json")"
  open_count="$(jq -r '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false and .isOutdated == false)] | length' <<<"$threads_json")"
  if [[ "$t_total" -gt 100 ]]; then
    block "review threads: $t_total threads, more than one page; verify by hand"
  elif [[ "$open_count" == "0" ]]; then
    ok "review threads: 0 unresolved non-outdated (of $t_total)"
  else
    block "review threads: $open_count unresolved non-outdated (of $t_total)"
    while IFS= read -r line; do
      block "  - $line"
    done < <(jq -r '.data.repository.pullRequest.reviewThreads.nodes[]
                    | select(.isResolved == false and .isOutdated == false)
                    | "\(.path):\(.line // "?") \(.comments.nodes[0].author.login // "?"): \((.comments.nodes[0].body // "") | gsub("\\s+"; " ") | .[0:100])"' <<<"$threads_json")
  fi
fi

# ── 5. VPS SHA (optional; SSH is closed by default) ─────────────────────────
# Readiness to merge does not depend on production, so an unchecked VPS is reported,
# not blocking. Set EXPECT_VPS_SHA when a deploy must be ruled out or confirmed.
if [[ -n "${EXPECT_VPS_SHA:-}" ]]; then
  if vps_sha="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$VPS_TARGET" "git -C '$VPS_SRC' rev-parse HEAD" 2>/dev/null)"; then
    if [[ "$vps_sha" == "$EXPECT_VPS_SHA"* ]]; then
      ok "VPS SHA: ${vps_sha:0:7} matches expected ${EXPECT_VPS_SHA:0:7}"
    else
      block "VPS SHA: live src is ${vps_sha:0:7}, expected ${EXPECT_VPS_SHA:0:7} (unapproved deploy, or stale expectation?)"
    fi
  else
    block "VPS SHA: could not reach $VPS_TARGET over SSH (port 22 is closed by default)"
  fi
else
  ok "VPS SHA: not checked (set EXPECT_VPS_SHA=<sha> to check over SSH)"
fi

# ── Verdict ─────────────────────────────────────────────────────────────────
if ((${#blockers[@]} == 0)); then
  echo "VERDICT: READY"
else
  echo "VERDICT: NOT READY"
fi
echo
echo "PR: #$PR ($REPO) head ${head_sha:0:7}, checked $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo
echo "Blocking facts:"
if ((${#blockers[@]} == 0)); then echo "- none"; else printf -- '- %s\n' "${blockers[@]}" | sed 's/^-   - /  - /'; fi
echo
echo "Verified:"
if ((${#verified[@]} == 0)); then echo "- nothing"; else printf -- '- %s\n' "${verified[@]}"; fi

((${#blockers[@]} == 0))
