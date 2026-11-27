#!/usr/bin/env bash
# PR readiness gate: checks the READY conditions in AGENTS.md ("PR Readiness Gate")
# against live GitHub state and prints a verdict in the gatekeeper response format.
#
#   bash scripts/pr-readiness.sh <pr-number> <expected-head-sha>
#   EXPECT_VPS_SHA=<sha> bash scripts/pr-readiness.sh <pr-number> <expected-head-sha>
#
# Both SHAs must be full 40-character SHAs and are compared exactly.
# Fails closed: anything on GitHub it cannot verify is a blocking fact, never a pass.
# A missing expected-head-sha is a blocking fact. The VPS condition is checked only
# with EXPECT_VPS_SHA (SSH is closed by default); without it the output lists it under
# "Not checked:", never under "Verified:".
# Exit code: 0 READY (everything checked), 1 NOT READY, 2 usage or tooling error,
# 3 READY on the GitHub conditions only, with the VPS not checked (Phil confirms it).
# At the end the PR, check runs, reviews, threads and (if checked) the VPS SHA are re-read;
# if any moved during the run, or a re-read fails, NOT READY.
#
# Needs curl and jq. Review-thread state comes from GitHub GraphQL, which needs
# authentication: an authenticated `gh` CLI, or GITHUB_TOKEN in the environment.
# Without either, threads are UNKNOWN and the verdict is NOT READY.
#
# Text that PR authors and commenters control (check-run names, branch name, review
# comments, paths, logins) is stripped of control characters before it is printed, so
# it cannot move the cursor or redraw the verdict in the operator's terminal.
set -euo pipefail

REPO="${REPO:-malickland-304/wv-property-intelligence}"
API="https://api.github.com/repos/$REPO"
VPS_TARGET="${VPS_TARGET:-root@31.97.58.203}"
VPS_SRC="${VPS_SRC:-/docker/wv-property-intelligence/src}"

usage() { echo "usage: bash scripts/pr-readiness.sh <pr-number> <expected-head-sha (full 40 chars)>" >&2; exit 2; }

PR="${1:-}"
# SHAs are compared in lowercase; some UIs copy them in uppercase.
EXPECTED="$(printf '%s' "${2:-}" | tr 'A-F' 'a-f')"
EXPECT_VPS_SHA="$(printf '%s' "${EXPECT_VPS_SHA:-}" | tr 'A-F' 'a-f')"
[[ "$PR" =~ ^[0-9]+$ ]] || usage
[[ -z "$EXPECTED" || "$EXPECTED" =~ ^[0-9a-f]{40}$ ]] || { echo "expected-head-sha must be the full 40-character hex commit sha" >&2; exit 2; }
[[ -z "${EXPECT_VPS_SHA:-}" || "${EXPECT_VPS_SHA}" =~ ^[0-9a-f]{40}$ ]] || { echo "EXPECT_VPS_SHA must be the full 40-character hex commit sha" >&2; exit 2; }
for bin in curl jq; do
  command -v "$bin" >/dev/null 2>&1 || { echo "missing required tool: $bin" >&2; exit 2; }
done

blockers=()
verified=()
unchecked=()
block()  { blockers+=("$1"); }
ok()     { verified+=("$1"); }
skip()   { unchecked+=("$1"); }

# jq helper: replace C0/C1 control characters (ESC, CSI, BEL, CR, ...) with "?".
# Works on codepoints, not a regex, so it does not depend on the regex engine's escapes.
# Also replaces EVERY Unicode format (Cf), line-separator (Zl) and paragraph-separator
# (Zp) character, because they reorder or hide text: bidi marks/embeddings/overrides/
# isolates (incl. U+061C ARABIC LETTER MARK), zero-width chars, invisible operators,
# BOM, interlinear annotations, and the tag block U+E0000-U+E007F (invisible text that
# agents reading this output would still see). The ranges are the full Cf/Zl/Zp set as
# of Unicode 16; tests/pr-readiness-clean.test.js checks them against Node's own
# Unicode tables, so a gap fails CI instead of waiting for a reviewer to find it.
JQ_CLEAN='def clean: tostring | explode | map(
  if . < 32 or (. >= 127 and . < 160) or . == 173
     or (. >= 1536 and . <= 1541) or . == 1564 or . == 1757 or . == 1807
     or (. >= 2192 and . <= 2193) or . == 2274 or . == 6158
     or (. >= 8203 and . <= 8207) or (. >= 8232 and . <= 8238)
     or (. >= 8288 and . <= 8303) or . == 65279 or (. >= 65529 and . <= 65531)
     or . == 69821 or . == 69837 or (. >= 78896 and . <= 78911)
     or (. >= 113824 and . <= 113827) or (. >= 119155 and . <= 119162)
     or (. >= 917504 and . <= 917631)
  then 63 else . end) | implode;'

# The token goes to curl on stdin (-H @-), not in argv, so `ps` cannot show it.
# printf is a shell builtin, so the token is never in any process's arguments.
api() {
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    printf 'Authorization: Bearer %s\n' "$GITHUB_TOKEN" |
      curl -fsS --max-time 20 -H "Accept: application/vnd.github+json" -H @- "$API/$1"
  else
    curl -fsS --max-time 20 -H "Accept: application/vnd.github+json" "$API/$1"
  fi
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
head_ref="$(jq -r "$JQ_CLEAN"' .head.ref | clean' <<<"$pr_json")"
base_ref="$(jq -r "$JQ_CLEAN"' .base.ref | clean' <<<"$pr_json")"
[[ "$head_sha" =~ ^[0-9a-f]{40}$ ]] || { echo "GitHub returned an unexpected head SHA for PR #$PR" >&2; exit 2; }
mergeable="$(jq -r '.mergeable' <<<"$pr_json")"
merge_state="$(jq -r '.mergeable_state' <<<"$pr_json")"

if [[ "$state" != "open" ]]; then
  block "PR is $state (merged=$merged), not open"
fi
[[ "$draft" == "true" ]] && block "PR is a draft"

if [[ -z "$EXPECTED" ]]; then
  block "head SHA: no expected SHA given; re-run with the full SHA you reviewed (PR head is $head_sha)"
elif [[ "$head_sha" == "$EXPECTED" ]]; then
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
# Every check run must be completed and green; any commit status must be success.
# (Stricter than "required checks only": the list of required checks needs admin access.)
if runs_json="$(api "commits/$head_sha/check-runs?per_page=100")"; then
  total="$(jq -r '.total_count' <<<"$runs_json")"
  # Check-run names come from workflow job names, which a PR's own workflow file controls.
  pending="$(jq -r "$JQ_CLEAN"' [.check_runs[] | select(.status != "completed") | (.name | clean)] | join(", ")' <<<"$runs_json")"
  failing="$(jq -r "$JQ_CLEAN"' [.check_runs[] | select(.status == "completed" and (.conclusion | IN("success","neutral","skipped") | not)) | "\(.name | clean)=\(.conclusion | clean)"] | join(", ")' <<<"$runs_json")"
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
THREADS_QUERY='query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){pullRequest(number:$n){reviews(first:1){totalCount} reviewThreads(first:100){totalCount nodes{isResolved isOutdated path line comments(first:1){nodes{author{login} body}}}}}}}'
owner="${REPO%%/*}"; name="${REPO##*/}"
# Prints the GraphQL response, or nothing when no auth is available or the call fails.
fetch_threads() {
  local out="" body
  if command -v gh >/dev/null 2>&1 && out="$(gh api graphql -f query="$THREADS_QUERY" -F owner="$owner" -F name="$name" -F n="$PR" 2>/dev/null)"; then
    :
  elif [[ -n "${GITHUB_TOKEN:-}" ]]; then
    body="$(jq -n --arg q "$THREADS_QUERY" --arg owner "$owner" --arg name "$name" --argjson n "$PR" \
             '{query:$q, variables:{owner:$owner, name:$name, n:$n}}')"
    out="$(printf 'Authorization: Bearer %s\n' "$GITHUB_TOKEN" |
           curl -fsS --max-time 20 -H @- -H "Content-Type: application/json" \
             --data-binary "$body" https://api.github.com/graphql)" || out=""
  else
    out=""
  fi
  printf '%s' "$out"
}
threads_json="$(fetch_threads)"

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
    # Comment text is attacker-controlled: strip control characters (ESC etc.) first.
    done < <(jq -r "$JQ_CLEAN"' .data.repository.pullRequest.reviewThreads.nodes[]
                    | select(.isResolved == false and .isOutdated == false)
                    | "\(.path | clean):\(.line // "?") \(.comments.nodes[0].author.login // "?" | clean): \((.comments.nodes[0].body // "") | gsub("\\s+"; " ") | clean | .[0:100])"' <<<"$threads_json")
  fi
fi

# ── 5. VPS SHA (only with EXPECT_VPS_SHA; SSH is closed by default) ─────────
# Without EXPECT_VPS_SHA the "no unapproved deploy" condition is NOT verified by this
# script: it is listed under "Not checked:" and Phil confirms it himself (deploys are
# manual and his). Set EXPECT_VPS_SHA to have the script check it over SSH.
if [[ -n "${EXPECT_VPS_SHA:-}" ]]; then
  remote_cmd="git -C $(printf '%q' "$VPS_SRC") rev-parse HEAD"
  if vps_sha="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$VPS_TARGET" "$remote_cmd" 2>/dev/null)"; then
    if [[ "$vps_sha" == "$EXPECT_VPS_SHA" ]]; then
      ok "VPS SHA: $vps_sha matches expected"
    elif [[ "$vps_sha" =~ ^[0-9a-f]{40}$ ]]; then
      block "VPS SHA: live src is $vps_sha, expected $EXPECT_VPS_SHA (unapproved deploy, or stale expectation?)"
    else
      block "VPS SHA: unexpected output from $VPS_TARGET (not a commit SHA)"
    fi
  else
    block "VPS SHA: could not reach $VPS_TARGET over SSH (port 22 is closed by default)"
  fi
else
  skip "VPS SHA (no unapproved deploy): set EXPECT_VPS_SHA=<full sha> to check over SSH, or Phil confirms it"
fi

# ── Re-read: the PR must not have moved while this ran ──────────────────────
# Checks, threads and the VPS were read after the PR itself. A push, merge, close, draft
# toggle or base change in between would leave this verdict describing a state that no
# longer holds, so the PR, its check runs, its reviews and threads, and the VPS SHA
# (when checked) are read again and compared. Any read or parse failure blocks (never a
# set -e exit before the verdict).
pr_fingerprint='[.head.sha, .state, .draft, .mergeable, .mergeable_state, .base.ref] | map(tostring) | join(" ")'
first_fp="$(jq -r "$pr_fingerprint" <<<"$pr_json")"
if final_json="$(api "pulls/$PR")" \
   && jq -e 'type == "object" and (.head.sha | type) == "string"' >/dev/null 2>&1 <<<"$final_json" \
   && final_fp="$(jq -r "$pr_fingerprint" <<<"$final_json" 2>/dev/null)"; then
  if [[ "$final_fp" != "$first_fp" ]]; then
    block "PR changed during this run: $(jq -rn "$JQ_CLEAN"' $s | clean' --arg s "$first_fp") -> $(jq -rn "$JQ_CLEAN"' $s | clean' --arg s "$final_fp") (head state draft mergeable merge_state base); run again"
  fi
else
  block "could not re-read PR #$PR at the end of the run"
fi

# Check runs again: a run that started, re-ran or failed on the same head after section 3.
runs_fp='[.total_count] + ([.check_runs[] | "\(.id):\(.status):\(.conclusion)"] | sort) | map(tostring) | join(" ")'
if [[ -n "${runs_json:-}" ]]; then
  if final_runs="$(api "commits/$head_sha/check-runs?per_page=100")" \
     && a="$(jq -r "$runs_fp" <<<"$runs_json" 2>/dev/null)" \
     && b="$(jq -r "$runs_fp" <<<"$final_runs" 2>/dev/null)"; then
    [[ "$a" == "$b" ]] || block "check runs changed on ${head_sha:0:7} during this run; run again"
  else
    block "could not re-read check runs for ${head_sha:0:7} at the end of the run"
  fi
fi

# Reviews and review threads again: a new review (even one with no inline comments) or a
# new or re-opened thread after section 4. Only compared when the
# first read worked; an UNKNOWN thread state already blocks.
threads_fp='[.data.repository.pullRequest.reviews.totalCount, .data.repository.pullRequest.reviewThreads.totalCount] + ([.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false and .isOutdated == false) | "\(.path):\(.line)"] | sort) | map(tostring) | join(" ")'
if [[ -n "$threads_json" ]] && a="$(jq -er "$threads_fp" <<<"$threads_json" 2>/dev/null)"; then
  final_threads="$(fetch_threads)"
  if [[ -n "$final_threads" ]] && b="$(jq -er "$threads_fp" <<<"$final_threads" 2>/dev/null)"; then
    [[ "$a" == "$b" ]] || block "reviews or review threads changed during this run; run again"
  else
    block "could not re-read reviews and review threads at the end of the run"
  fi
fi

# VPS SHA again, last: a deploy during the GitHub re-reads above. Only when the first read
# was a valid SHA; an unreachable or bad first read already blocks.
if [[ -n "${EXPECT_VPS_SHA:-}" && "${vps_sha:-}" =~ ^[0-9a-f]{40}$ ]]; then
  if final_vps="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$VPS_TARGET" "$remote_cmd" 2>/dev/null)"; then
    [[ "$final_vps" == "$vps_sha" ]] || block "VPS SHA changed during this run; run again"
  else
    block "could not re-read the VPS SHA at the end of the run"
  fi
fi

# ── Verdict ─────────────────────────────────────────────────────────────────
# A READY with anything unchecked is labelled on the first line and exits 3, so neither
# a quoted first line nor `&& gh pr merge` can treat it as a full READY.
status=1
if ((${#blockers[@]} > 0)); then
  echo "VERDICT: NOT READY"
elif ((${#unchecked[@]} > 0)); then
  echo "VERDICT: READY (GitHub conditions only; see \"Not checked:\")"
  status=3
else
  echo "VERDICT: READY"
  status=0
fi
echo
echo "PR: #$PR ($REPO) head ${head_sha:0:7}, checked $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo
echo "Blocking facts:"
if ((${#blockers[@]} == 0)); then echo "- none"; else printf -- '- %s\n' "${blockers[@]}" | sed 's/^-   - /  - /'; fi
if ((${#unchecked[@]} > 0)); then
  echo
  echo "Not checked:"
  printf -- '- %s\n' "${unchecked[@]}"
fi
echo
echo "Verified:"
if ((${#verified[@]} == 0)); then echo "- nothing"; else printf -- '- %s\n' "${verified[@]}"; fi

exit "$status"
