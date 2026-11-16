#!/usr/bin/env bash
# PR readiness gate: checks the READY conditions in AGENTS.md ("When Codex is
# unavailable") against live GitHub state and prints a verdict in the gatekeeper
# response format.
#
#   bash scripts/pr-readiness.sh <pr-number> <full-40-char-head-sha>
#   EXPECT_VPS_SHA=<sha> bash scripts/pr-readiness.sh <pr-number> <head-sha>   # check the VPS over SSH
#   VPS_ATTESTED=1       bash scripts/pr-readiness.sh <pr-number> <head-sha>   # you state: no unapproved deploy
#
# Fails closed: anything it cannot verify is a blocking fact, never a pass. The five
# READY conditions each need a positive result:
#   1. head SHA == the expected full SHA (exact match)
#   2. mergeable_state clean and mergeable
#   3. every check run on that head completed green (stricter than "required checks":
#      the required list needs admin access to read)
#   4. 0 unresolved, non-outdated review threads (GraphQL; needs gh auth or GITHUB_TOKEN)
#   5. no unapproved production deploy: either EXPECT_VPS_SHA matches the VPS checkout
#      over SSH, or the person running this sets VPS_ATTESTED=1 to state it themselves
# The PR head is re-read at the end; if it moved during the run, the verdict is NOT READY.
#
# Exit code: 0 READY, 1 NOT READY, 2 usage or tooling error.
set -euo pipefail

REPO="${REPO:-malickland-304/wv-property-intelligence}"
API="https://api.github.com/repos/$REPO"
VPS_TARGET="${VPS_TARGET:-root@31.97.58.203}"
VPS_SRC="${VPS_SRC:-/docker/wv-property-intelligence/src}"

usage() { echo "usage: bash scripts/pr-readiness.sh <pr-number> <full-40-char-head-sha>" >&2; exit 2; }

PR="${1:-}"
EXPECTED="${2:-}"
[[ "$PR" =~ ^[0-9]+$ ]] || usage
# A full SHA, compared exactly: a short prefix could match a different commit.
[[ "$EXPECTED" =~ ^[0-9a-f]{40}$ ]] || { echo "expected-head-sha is required and must be the full 40-character commit SHA" >&2; usage; }
[[ -z "${EXPECT_VPS_SHA:-}" || "${EXPECT_VPS_SHA}" =~ ^[0-9a-f]{7,40}$ ]] || { echo "EXPECT_VPS_SHA must be a hex commit sha" >&2; exit 2; }
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "REPO must be owner/name" >&2; exit 2; }
# These go to ssh and into the remote shell: plain characters only, no leading dash.
[[ "$VPS_TARGET" =~ ^[A-Za-z0-9_][A-Za-z0-9_.@-]*$ ]] || { echo "VPS_TARGET must be user@host" >&2; exit 2; }
[[ "$VPS_SRC" =~ ^/[A-Za-z0-9_./-]+$ ]] || { echo "VPS_SRC must be an absolute path of plain characters" >&2; exit 2; }
for bin in curl jq; do
  command -v "$bin" >/dev/null 2>&1 || { echo "missing required tool: $bin" >&2; exit 2; }
done

blockers=()
verified=()
unchecked=()
block() { blockers+=("$1"); }
ok()    { verified+=("$1"); }

# The token goes to curl through a private file, never on its command line (where
# `ps` would show it).
WORK="$(mktemp -d "${TMPDIR:-/tmp}/pr-readiness.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
HDR="$WORK/headers"
( umask 077; : > "$HDR" )
printf 'Accept: application/vnd.github+json\n' >> "$HDR"
[[ -n "${GITHUB_TOKEN:-}" ]] && printf 'Authorization: Bearer %s\n' "$GITHUB_TOKEN" >> "$HDR"

api() { curl -fsS --max-time 20 -H @"$HDR" "$API/$1"; }

# Text that came from GitHub (comment bodies, check names, branch names, paths) is
# untrusted: strip control characters so it cannot move the cursor, clear the screen
# or forge the verdict in the terminal.
clean() { LC_ALL=C tr -d '\000-\011\013-\037\177' | LC_ALL=C sed $'s/\xc2[\x80-\x9f]//g'; }   # C0 + DEL, and UTF-8 C1 (U+0080-009F)

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
head_ref="$(jq -r '.head.ref' <<<"$pr_json" | clean)"
base_ref="$(jq -r '.base.ref' <<<"$pr_json" | clean)"
mergeable="$(jq -r '.mergeable' <<<"$pr_json")"
merge_state="$(jq -r '.mergeable_state' <<<"$pr_json" | clean)"
[[ "$head_sha" =~ ^[0-9a-f]{40}$ ]] || { echo "unexpected head SHA from GitHub" >&2; exit 2; }

if [[ "$state" != "open" ]]; then
  block "PR is $(clean <<<"$state") (merged=$merged), not open"
fi
[[ "$draft" == "true" ]] && block "PR is a draft"

if [[ "$head_sha" == "$EXPECTED" ]]; then
  ok "head SHA: $head_sha matches expected ($head_ref -> $base_ref)"
else
  block "head SHA mismatch: PR head is $head_sha, expected $EXPECTED"
fi

# ── 2. Merge state ───────────────────────────────────────────────────────────
if [[ "$merge_state" == "clean" && "$mergeable" == "true" ]]; then
  ok "merge state: clean, mergeable"
else
  block "merge state: mergeable_state=$merge_state, mergeable=$mergeable (needs clean/true)"
fi

# ── 3. Checks on the head commit ────────────────────────────────────────────
if runs_json="$(api "commits/$head_sha/check-runs?per_page=100")"; then
  total="$(jq -r '.total_count' <<<"$runs_json")"
  pending="$(jq -r '[.check_runs[] | select(.status != "completed") | .name] | join(", ")' <<<"$runs_json" | clean)"
  failing="$(jq -r '[.check_runs[] | select(.status == "completed" and (.conclusion | IN("success","neutral","skipped") | not)) | "\(.name)=\(.conclusion)"] | join(", ")' <<<"$runs_json" | clean)"
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
  s_state="$(jq -r '.state' <<<"$status_json" | clean)"
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
  jq -n --arg q "$THREADS_QUERY" --arg owner "$owner" --arg name "$name" --argjson n "$PR" \
     '{query:$q, variables:{owner:$owner, name:$name, n:$n}}' > "$WORK/query.json"
  threads_json="$(curl -fsS --max-time 20 -H @"$HDR" -H "Content-Type: application/json" \
                    --data-binary @"$WORK/query.json" https://api.github.com/graphql)" || threads_json=""
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
                    | "\(.path):\(.line // "?") \(.comments.nodes[0].author.login // "?"): \((.comments.nodes[0].body // "") | gsub("\\s+"; " ") | .[0:100])"' <<<"$threads_json" | clean)
  fi
fi

# ── 5. No unapproved production deploy ──────────────────────────────────────
# SSH is closed by default, so this can be proven over SSH or stated by the person
# running the gate (Phil deploys by hand and knows). Neither = blocking.
if [[ -n "${EXPECT_VPS_SHA:-}" ]]; then
  remote_cmd="git -C $(printf '%q' "$VPS_SRC") rev-parse HEAD"
  if vps_sha="$(ssh -o BatchMode=yes -o ConnectTimeout=10 -- "$VPS_TARGET" "$remote_cmd" 2>/dev/null)" && [[ "$vps_sha" =~ ^[0-9a-f]{40}$ ]]; then
    if [[ "$vps_sha" == "$EXPECT_VPS_SHA"* ]]; then
      ok "VPS SHA: $vps_sha matches expected ${EXPECT_VPS_SHA}"
    else
      block "VPS SHA: live src is $vps_sha, expected ${EXPECT_VPS_SHA} (unapproved deploy, or stale expectation?)"
    fi
  else
    block "VPS SHA: could not read it from $VPS_TARGET over SSH (port 22 is closed by default)"
  fi
elif [[ "${VPS_ATTESTED:-}" == "1" ]]; then
  ok "no unapproved deploy: stated by the person running this (VPS_ATTESTED=1), not checked over SSH"
  unchecked+=("VPS SHA not read over SSH; relying on the VPS_ATTESTED=1 statement")
else
  block "no unapproved deploy: not established (set EXPECT_VPS_SHA=<sha> to check over SSH, or VPS_ATTESTED=1 if you know production has only approved deploys)"
fi

# ── Re-read: the PR must not have moved while this ran ──────────────────────
if final_json="$(api "pulls/$PR")"; then
  final_head="$(jq -r '.head.sha' <<<"$final_json")"
  final_state="$(jq -r '.state' <<<"$final_json")"
  if [[ "$final_head" != "$head_sha" || "$final_state" != "$state" ]]; then
    block "PR changed during this run (head $head_sha -> $(clean <<<"$final_head"), state $state -> $(clean <<<"$final_state")); run again"
  fi
else
  block "could not re-read PR #$PR at the end of the run"
fi

# ── Verdict ─────────────────────────────────────────────────────────────────
{
  if ((${#blockers[@]} == 0)); then echo "VERDICT: READY"; else echo "VERDICT: NOT READY"; fi
  echo
  echo "PR: #$PR ($REPO) head $head_sha, checked $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "Blocking facts:"
  if ((${#blockers[@]} == 0)); then echo "- none"; else printf -- '- %s\n' "${blockers[@]}" | sed 's/^-   - /  - /'; fi
  echo
  echo "Verified:"
  if ((${#verified[@]} == 0)); then echo "- nothing"; else printf -- '- %s\n' "${verified[@]}"; fi
  if ((${#unchecked[@]} > 0)); then
    echo
    echo "Not checked by this script:"
    printf -- '- %s\n' "${unchecked[@]}"
  fi
} | clean

((${#blockers[@]} == 0))
