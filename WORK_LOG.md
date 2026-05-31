# WORK_LOG.md — Malickland 2.0 Coordination Ledger
> All agents must append an entry here after any session that makes changes.
> This is the memory layer between agents. Do not delete prior entries.
> Format: ## YYYY-MM-DD — Agent Name

---

## 2026-05-27 — Claude Code (Sonnet 4.6)

### Objective
Full repository audit per Malickland 2.0 Unified Engineering Operating Prompt. Create missing governance coordination files. Implement autonomous repository-governed authority hierarchy per user direction.

### Changes Made
- `PROJECT_STATE.md` — created: verified product completeness, known bugs, architecture notes, open work
- `TASKS.md` — created: prioritized backlog with critical/high/medium/low/completed sections
- `DECISIONS.md` — created: 6 recorded technical decisions (csurf migration, OpenHands scope, npm ci policy, googleapis choice, SQLite choice, leads.js unmount)
- `QA_CHECKLIST.md` — created: pre-PR, security-sensitive, UI, pre-deploy, and production readiness gates
- `AGENTS.md` — rewritten: replaced human-arbitrated source-of-truth hierarchy with repository authority rule; added Architectural Stability Rule, Autonomous Safety Stop Rule, Verification Truthfulness Rule, WORK_LOG reference; updated env vars to include services layer (Resend, Twilio); changed conflict resolution from "ChatGPT adjudicates" to "safer path wins + DECISIONS.md entry"
- `ARCHITECTURE.md` — created: full system architecture, directory tree, route map, auth model, DB schema summary, deployment topology, constraints, phase roadmap
- `WORK_LOG.md` — created (this file)

### Verification (Truthfulness Rule)
- Command: `npm audit` (in api/) → Result: PASSED — 0 vulnerabilities
- Command: `node tests/verify-security-fixes.test.js` → Result: FAILED — 14+ tests fail because tests check server.js for code refactored to routes/
- Command: `git status` → Result: local branch is `fix/hook-npm-save-patterns` (stale, superseded by PR #68 merged to origin/main)
- Preflight, smoke scripts: NOT RUN in this session

### Security Notes
- No new security issues introduced (documentation-only changes)
- Confirmed: 0 npm audit vulnerabilities
- Confirmed: CORS without origin restriction on public API — acceptable, tracked
- Confirmed: `leads.js` correctly unmounted (would crash on require if mounted)

### Remaining Risks
1. **CRITICAL — Test suite broken**: 14+ tests fail. Tests assert against server.js for code now in routes/api.js and routes/admin.js. CI gate `verify-security-fixes.test.js` is not catching regressions. This is the #1 quality risk.
2. **HIGH — leads.js unmounted with broken deps**: `services/googleSheets.js` does not exist. Decision needed: implement or delete.
3. **MEDIUM — Local branch stale**: `fix/hook-npm-save-patterns` is superseded by merged PR #68. Next work should start from `main`.
4. **MEDIUM — Services layer undocumented in docs/agent-handoff.md**: email, Twilio, leadFollowupWorker added after last handoff update.
5. **LOW — 73 remote branches**: many stale copilot/* and claude/* branches add noise.
6. **LOW — No background scheduler**: `leadFollowupWorker.js` has no scheduler — follow-up emails would never fire without one.

### Recommended Next Task
~~Fix test suite~~ — COMPLETED in this session (see below).
Next: resolve leads.js (see entry below).

---

## 2026-05-27 (session continued) — Claude Code (Sonnet 4.6)

### Objective
Fix broken test suite (14+ failing tests). Update test file to check actual code locations after route-module refactor. Add governance file presence checks.

### Changes Made
- `tests/verify-security-fixes.test.js` — rewritten: updated all assertions from server.js to routes/api.js, routes/admin.js, helpers.js; updated rate limiter names (publicReadRateLimit, adminActionRateLimit); updated Gmail test for raw HTTPS pattern; replaced stale AGENTS.md copilot-instructions assertion with repository authority rule checks; added Suite 9 (governance file presence)

### Verification (Truthfulness Rule)
- Command: `node tests/verify-security-fixes.test.js` → Result: PASSED — 42/42 tests pass

### Security Notes
- No functional code changes — test-only update
- All security invariants confirmed: CSRF on admin mutations, rate limiters on public routes, status=active guard on public property detail, no shell exec in server.js

### Remaining Risks
1. **HIGH — leads.js unmounted with broken deps**: decision needed from ChatGPT — implement `services/googleSheets.js` + add twilio, OR delete leads.js
2. **MEDIUM — local branch stale**: still on `fix/hook-npm-save-patterns`; switch to `main` before next work
3. **LOW — services layer undocumented in docs/agent-handoff.md**

### Recommended Next Task
**Decide leads.js fate.** Options: (A) implement `services/googleSheets.js` stub + add twilio dependency with human approval, or (B) delete leads.js and its service dependencies. This unblocks the leads feature decision without breaking anything. Requires ChatGPT spec decision first.

---
## 2026-05-27 (session 3) — Claude Code (Sonnet 4.6)

### Objective
PR #73 correction pass: fix documentation accuracy issues and eliminate CodeQL false-positive in test suite. Authorized scope: 5 files only.

### Changes Made
- `tests/verify-security-fixes.test.js` — added 2 escapeHtml coverage tests (double quotes `&quot`, single quotes `&#39`/`&apos`) with proper assert guard; added `router.post('/ai/:id'` to CSRF mutatingRoutes array (confirmed in admin.js:563); rewrote Suite 7 Gmail/Drive tests using regex `.test()` on `hostname:` property pattern instead of `.includes()` on hostname string — eliminates CodeQL `js/incomplete-url-scheme-check` false positive; removed ineffective `lgtm` comments; suite now 44/44 (was 42/42)
- `AGENTS.md` — named Phil Malick explicitly as approval authority in workflow steps 3, 7, 8 (was generic "human")
- `ARCHITECTURE.md` — fixed admin auth docs (login/logout intentionally public, not covered by requireAuth); fixed /api/contacts auth table contradiction (POST public via contactsRateLimit only, GET protected by requireApiKey); added Data Authority section (Google Drive = documents/photos/media, SQLite = structured data); added Cloudflare as DNS/SSL/security layer in Deployment Architecture section
- `PROJECT_STATE.md` — replaced stale "CRITICAL — test suite broken (14+)" entry with accurate status (PR #73 fixes to 42/42 on branch, pending merge); updated Known Bugs table
- `QA_CHECKLIST.md` — corrected smoke-prod.sh invocation: `bash scripts/smoke-prod.sh <BASE_URL>` (was missing required positional arg; confirmed from scripts/smoke-prod.sh:4)

### Verification (Truthfulness Rule)
- Command: `node tests/verify-security-fixes.test.js` → Result: PASSED — 44/44 tests pass
- Command: `git diff --name-only HEAD~1` → Result: exactly 5 authorized files (AGENTS.md, ARCHITECTURE.md, PROJECT_STATE.md, QA_CHECKLIST.md, tests/verify-security-fixes.test.js)
- Command: `git push origin chore/governance-overhaul-2026-05-27` → Result: PUSHED (d0187b9)
- CI gate results: PENDING at time of WORK_LOG entry; CodeQL, Semgrep, preflight, validate-api-docs, CodeScan all queued

### Security Notes
- No functional code changes — documentation and tests only
- CodeQL fix is a test-code rewrite (regex vs .includes), not a suppression rule change
- `.github/codeql/codeql-config.yml` NOT modified (per user directive)

### Remaining Risks
1. **BLOCKER (merge) — 0 human approvals**: enforce_admins: true; PR author is malickland-304 (cannot self-approve); requires a second GitHub account with write access to approve
2. **BLOCKER (merge) — review threads**: 16 bot-generated review threads must be resolved before merge (required_conversation_resolution: true)
3. **BLOCKER (merge) — CodeQL GHAS result**: previous lgtm-based fix was ineffective; regex rewrite pushed in this session is the correct fix — result pending CI completion
4. **HIGH — leads.js unmounted**: decision still needed (implement googleSheets.js + add twilio, or delete)
5. **MEDIUM — services layer undocumented**: docs/agent-handoff.md not yet updated for email.js, twilioService.js, leadFollowupWorker.js

### Recommended Next Task
Monitor CodeQL CI result on PR #73. If GHAS passes, the only remaining merge blockers are the review threads and Phil's approving review. Phil reviews and approves via GitHub UI — Claude cannot do this.

## 2026-05-27 (session 4) — Claude Code (Sonnet 4.6)

### Objective
Final narrow cleanup pass on PR #73 branch. Resolve 4 remaining review threads via source-evidence-based corrections. Strict 3-file scope authorized.

### Changes Made
- `AGENTS.md` — corrected SECURITY.md description in authority hierarchy from "security requirements, threat model" to "security policy, vulnerability reporting, scope" — reflects actual SECURITY.md content (vulnerability reporting policy + scope, not a threat model)
- `PROJECT_STATE.md` — replaced stale header "Canonical source: `docs/agent-handoff.md`" which contradicted AGENTS.md's explicit demotion of that file to deployment-state reference only; replaced with accurate non-authoritative note
- `tests/verify-security-fixes.test.js` — narrowed both SQL `status='active'` guard tests to extract `sendPropertyDetail` function body before assertion (was scanning entire file, creating false-positive risk from analytics/other queries that also reference `status` in WHERE clauses); suite remains 44/44

### Verification (Truthfulness Rule)
- Command: `git diff --name-only` → Result: exactly 3 files (AGENTS.md, PROJECT_STATE.md, tests/verify-security-fixes.test.js)
- Command: `node tests/verify-security-fixes.test.js` → Result: PASSED — 44/44
- Command: `git push origin chore/governance-overhaul-2026-05-27` → Result: PUSHED (7c35185)
- CI gate results: PENDING at time of WORK_LOG entry

### Security Notes
- No functional code changes — documentation and test-scoping only
- SQL guard tests now fail fast if sendPropertyDetail specifically loses the status filter, rather than passing because another query has the word "status"

### Remaining Risks
1. **BLOCKER (merge) — 0 human approvals**: enforce_admins: true; malickland-304 cannot self-approve; requires separate authorized reviewer
2. **BLOCKER (merge) — 12 unresolved review threads**: threads 1/14 (SQL assertion scope) and 8/9 (AGENTS.md SECURITY.md description + PROJECT_STATE.md header) addressed by 7c35185; remaining threads (3, 13 legacy routes; 2, 7 escapeHtml; 4, 5 PROJECT_STATE.md stale test; 6 CSRF coverage; 10, 11, 12 ARCHITECTURE.md/QA fixes) addressed by earlier commits in this PR — all need manual resolution by Phil in GitHub UI
3. **LOW — services layer undocumented in docs/agent-handoff.md**

### Recommended Next Task
Phil: review and resolve addressed review threads in GitHub UI, then obtain approving review from separate authorized account, then merge PR #73.

<!-- New entries go below this line. Append; never edit prior entries. -->

## 2026-05-28 (session 5) — Claude Code (Sonnet 4.6)

### Objective
Final corrective pass on PR #73 branch (authorized by Phil Malick). Four corrections prescribed; Correction 1 applied in prior session. Corrections 2–4 applied here. Strict 3-file scope (plus WORK_LOG.md).

### Changes Made
- `.openhands/instructions.md` — Correction 1 (prior session): replaced `cat docs/agent-handoff.md` with `cat AGENTS.md`; replaced claim that agent-handoff.md is "canonical source of truth" with accurate AGENTS.md-aligned wording: "deployment-state reference only; does not override AGENTS.md"
- `AGENTS.md` — Correction 2: removed false "CSRF check" claim from CI/Security Gates preflight row; updated description to "dependency check, syntax check, server startup, public endpoint smoke" — which is what `scripts/preflight.sh` actually performs (confirmed by reading script in prior sessions: `npm ls`, `node --check`, server start, `/api/health` + property endpoint hits only; no admin login, no CSRF round-trip)
- `tests/verify-security-fixes.test.js` — Correction 3: added 3 tests to Suite 3 checking `apiRoutesCode` (routes/api.js) for absence of legacy `router.post('/listings'`, `router.put('/listings/`, `router.delete('/listings/'` mutation routes — previously only `serverCode` (server.js) was checked, leaving the mounted router file unverified
- `tests/verify-security-fixes.test.js` — Correction 4: added explicit `assert(fnMatch, 'escapeHtml function body not found')` guard in Suite 5 tests 5a (ampersands) and 5b (angle brackets) — previously used silent `if (fnMatch)` which would pass without asserting anything if the regex failed to match; tests 5d/5e already had `assert(fnMatch)` and were correct

### Verification (Truthfulness Rule)
- Command: `node tests/verify-security-fixes.test.js` → Result: PASSED — 47/47 (was 44/44; +3 from new Suite 3 apiRoutesCode tests)
- Command: `git diff --name-only` → Result: exactly 3 authorized files (`.openhands/instructions.md`, `AGENTS.md`, `tests/verify-security-fixes.test.js`)
- Command: `git status --short --branch` → Result: on `chore/governance-overhaul-2026-05-27`, 3 modified files

### Security Notes
- No functional code changes — documentation accuracy and test coverage only
- CSRF protection itself is unchanged; only the inaccurate description of the preflight script was corrected
- escapeHtml coverage now fails loudly if function is removed rather than silently passing

### Remaining Risks
1. **BLOCKER (merge) — 0 human approvals**: enforce_admins: true; malickland-304 cannot self-approve; requires separate authorized reviewer
2. **BLOCKER (merge) — unresolved review threads**: threads addressed by prior commits still need manual resolution by Phil in GitHub UI
3. **LOW — services layer undocumented in docs/agent-handoff.md**

### Recommended Next Task
Phil: review PR #73 diff for corrections 1–4, resolve addressed review threads in GitHub UI, obtain approving review from separate authorized account, then merge.

---

## 2026-05-28 (session 6) — Claude Code (Sonnet 4.6)

### Objective
Second corrective pass on PR #73 branch. Four new review findings identified after session 5 commit (fc0072a). Authorized scope: .openhands/instructions.md, .openhands/setup.sh, tests/verify-security-fixes.test.js, WORK_LOG.md.

### Changes Made
- `.openhands/instructions.md` — Correction 1 (new): aligned "Validation Before PR" checklist with AGENTS.md required validation sequence; added `node --check routes/api.js`, `node --check routes/public.js`, and `node tests/verify-security-fixes.test.js` — previously missing, meaning OpenHands could skip route syntax checks and the security test suite
- `.openhands/setup.sh` — Correction 2: replaced step 5 ("Handoff doc") authority conflict: `cat docs/agent-handoff.md` → `cat AGENTS.md`; updated step header to "Governance authority document"; added explicit note that docs/agent-handoff.md is deployment-state reference only and does not override AGENTS.md; updated validation commands listing to match AGENTS.md full sequence (was showing only preflight + npm audit + single syntax check)
- `tests/verify-security-fixes.test.js` — Correction 3: loaded `api/routes/public.js` as `publicRoutesCode`; added test verifying public property-page routes (`/listing/:id`, `/properties/:id`) are protected by `publicReadRateLimit` in routes/public.js — previously no test protected this rate-limit from regression
- `tests/verify-security-fixes.test.js` — Correction 4: strengthened admin.js shell-exec regression check: regex updated from `/require\('child_process'\)|execFile\s*\(/` to `/\bexec\s*\(|\bexecFile\s*\(|require\(['"]child_process['"]\)/` with `!line.includes('db.exec')` exclusion — now catches bare `exec(` and both single/double-quote `require('child_process')` / `require("child_process")` forms

### Verification (Truthfulness Rule)
- Command: `cd api && npm ci` → Result: PASSED (silent, no errors)
- Command: `node --check server.js && middleware/auth.js && routes/admin.js && routes/api.js && routes/public.js` → Result: PASSED — all clean
- Command: `bash scripts/preflight.sh` → Result: PASSED — dependency check, syntax check, startup, health, property API, public page all OK
- Command: `node tests/verify-security-fixes.test.js` → Result: PASSED — 48/48 (was 47/47; +1 public route rate-limit test)
- Command: `git diff --name-only` → Result: exactly 3 authorized files (.openhands/instructions.md, .openhands/setup.sh, tests/verify-security-fixes.test.js)

### Security Notes
- No runtime application code changed
- No CI or deployment configuration changed
- Shell-exec coverage improvement is test-only; does not affect admin.js runtime behavior
- All 4 corrections are documentation accuracy, OpenHands bootstrap alignment, and test coverage

### Remaining Risks
1. **BLOCKER (merge) — 0 human approvals**: enforce_admins: true; malickland-304 cannot self-approve
2. **BLOCKER (merge) — unresolved review threads**: threads from current findings must be resolved by Phil in GitHub UI after verifying this commit
3. **LOW — services layer undocumented in docs/agent-handoff.md**

### Recommended Next Task
Phil: verify diff of this commit, resolve current review threads in GitHub UI, obtain approving review from authorized second account, then merge PR #73.

---

## 2026-05-28 (session 7 — micro-fix) — Claude Code (Sonnet 4.6)

### Objective
Single targeted fix: replace four fragile exact-string .includes() checks in the `status=active` guard test with a scoped regex. Authorized files: tests/verify-security-fixes.test.js and WORK_LOG.md only.

### Changes Made
- `tests/verify-security-fixes.test.js` — "Property detail endpoint has status=active guard" test: replaced `fnBody.includes("p.status='active'") || fnBody.includes('p.status="active"') || fnBody.includes("status='active'") || fnBody.includes('status="active"')` with `/\b(?:p\.)?status\s*=\s*['"]active['"]/i.test(fnBody)`; test remains scoped to the extracted `sendPropertyDetail` function body; now tolerates legitimate whitespace around `=` and either quote style without weakening the security gate

### Verification (Truthfulness Rule)
- Command: `node tests/verify-security-fixes.test.js` → Result: PASSED — 48/48
- Command: `cd api && npm ci && node --check [5 files]` → Result: PASSED
- Command: `bash scripts/preflight.sh` → Result: PASSED — PRE-FLIGHT PASSED
- Command: `git diff --name-only` → Result: tests/verify-security-fixes.test.js only

### Security Notes
- No runtime code changed; test-only fix
- Guard behavior is equivalent or stronger: regex catches all variants the .includes() checks caught plus whitespace variations

### Remaining Risks
1. **BLOCKER (merge) — 0 human approvals**: enforce_admins: true; requires separate authorized reviewer
2. **BLOCKER (merge) — unresolved review threads**: require manual resolution by Phil in GitHub UI

### Recommended Next Task
All substantive findings now addressed. Phil: verify this commit, resolve review threads, obtain approving review, merge PR #73.

---

## 2026-05-28 (session 8 — documentation truth) — Claude Code (Sonnet 4.6)

### Objective
Two final documentation-truth corrections on PR #73. Authorized: QA_CHECKLIST.md, AGENTS.md, WORK_LOG.md. No test files, no runtime files, no scripts.

### Changes Made
- `QA_CHECKLIST.md` — removed false claim that `scripts/preflight.sh` "validates CSRF, auth redirect"; replaced with accurate description: "dependency check, syntax check, server startup, public endpoint smoke" — consistent with corrected AGENTS.md wording from session 5
- `AGENTS.md` — added `GOOGLE_GMAIL_USER` to the Google (Drive + Gmail) environment-variable list; confirmed by reading `api/google.js` which documents and consumes this variable: `sendContactEmail()` returns without sending when `GOOGLE_GMAIL_USER` is absent

### Verification (Truthfulness Rule)
- Command: `git diff --name-only` → Result: AGENTS.md, QA_CHECKLIST.md only
- Command: `git status --short --branch` → Result: on chore/governance-overhaul-2026-05-27, 2 modified files
- Tests not re-run (no test files changed; last run was 48/48 at HEAD 58db14f)

### Security Notes
- No functional code, test, script, or deployment files changed
- GOOGLE_GMAIL_USER addition is documentation only; does not change how the variable is used in runtime

### Remaining Risks
1. **BLOCKER (merge) — 0 human approvals**: requires separate authorized reviewer
2. **BLOCKER (merge) — unresolved review threads**: Phil must resolve in GitHub UI
3. **ADMIN — PR description stale**: still reads 42/42; Phil should update to 48/48 before requesting approving review

### Recommended Next Task
Phil: update PR description (42/42 → 48/48), resolve review threads, obtain approving review, merge PR #73.

---

## 2026-05-28 (session 9 — documentation consistency) — Claude Code (Sonnet 4.6)

### Objective
Three final documentation consistency corrections on PR #73 branch. Authorized: ARCHITECTURE.md, AGENTS.md, WORK_LOG.md. No test files, no runtime files, no scripts.

### Changes Made
- `ARCHITECTURE.md` — Correction 1: fixed directory tree entry for `scripts/preflight.sh` from "Full behavioral gate (start, health, auth, CSRF)" to "Dependency/syntax/startup/public endpoint smoke gate" — now consistent with AGENTS.md (session 5) and QA_CHECKLIST.md (session 8)
- `ARCHITECTURE.md` — Correction 3: clarified `/api/*` route-auth section: changed "Write routes require requireApiKey + apiWriteRateLimit" to "CRUD write routes require requireApiKey + apiWriteRateLimit" and added explicit exception statement; updated `POST /api/properties/generate-description` line to document it is a public rate-limited exception (generateDescRateLimit only; no requireApiKey) — reflects current live route code, not a new permission grant
- `AGENTS.md` — Correction 2: fixed step 4 of Standard Feature Workflow: changed "Codex audits PR → findings appended to WORK_LOG.md" to "Codex audits PR → findings reported for Phil or implementing agent to record if needed" — resolves contradiction between Codex role (Forbidden: Any repo mutation, commits) and workflow step that told Codex to append to WORK_LOG.md

### Verification (Truthfulness Rule)
- Command: `git diff --name-only` → Result: AGENTS.md, ARCHITECTURE.md only
- Command: `git status --short --branch` → Result: on chore/governance-overhaul-2026-05-27, 2 modified files
- Spot-checked: `preflight.sh` line 84, `generate-description` line 152, Codex step 4 line 135 — all confirmed correct
- Tests not re-run (no test files changed; last run was 48/48 at HEAD 58db14f)

### Security Notes
- No runtime code, tests, scripts, or deployment config changed
- `generate-description` exception is documentation of existing behavior only; no new permission granted

### Remaining Risks
1. **BLOCKER (merge) — 0 human approvals**: requires separate authorized reviewer
2. **BLOCKER (merge) — unresolved review threads**: Phil must resolve in GitHub UI
3. **ADMIN — PR description stale**: still reads 42/42; update to 48/48 before requesting approval

### Recommended Next Task
Phil: update PR description (42/42 → 48/48), resolve all addressed review threads in GitHub UI, obtain approving review from separate authorized account, merge PR #73.

---

## 2026-05-28 — Claude Code (Sonnet 4.6) — fix/notification-observability

### Objective
Add structured observability to notification provider paths — startup readiness logging and per-call skip warnings — so silent notification failures produce visible log output. No runtime behavior changes, no schema changes, no new dependencies.

### Changes Made
- `api/server.js` — added startup readiness check (Phil's exact design): logs `[Startup] Gmail configured: <bool>` and `[Startup] Resend configured: <bool>` on every startup; emits `[WARN] No outbound notification provider configured` when both are absent
- `api/google.js` — replaced two silent `return` statements in `sendContactEmail()` with structured `console.warn()` calls: one for missing `GOOGLE_GMAIL_USER` / `NOTIFICATION_EMAIL`, one for OAuth token unavailability
- `api/services/email.js` — added `console.warn()` when `NOTIFICATION_EMAIL` absent; added `console.warn()` when `RESEND_API_KEY` absent and falling through to Gmail OAuth
- `api/services/twilioService.js` — no change; existing `console.error` on package-unavailable and send-failure is appropriate for an intentionally feature-flagged service
- `SECURITY.md` — added operational security section documenting that `railway variables` CLI exposes all secret values verbatim; directs all operators to use Railway dashboard instead

### Verification (Truthfulness Rule)
- Command: `cd api && npm ci` → Result: PASSED (0 vulnerabilities)
- Command: `node --check api/server.js api/middleware/auth.js api/routes/admin.js api/routes/api.js api/routes/public.js api/google.js api/services/email.js api/services/twilioService.js` → Result: PASSED (ALL SYNTAX OK)
- Command: `node tests/verify-security-fixes.test.js` → Result: PASSED (48/48)
- Command: `bash scripts/preflight.sh` → Result: PASSED (PRE-FLIGHT PASSED)
- Command: `cd api && npm audit` → Result: PASSED (0 vulnerabilities)

### Security Notes
- No secrets referenced or printed; no auth, CSRF, or session logic changed
- All changes are additive log statements only
- `console.warn` on missing credentials is safe — outputs config state, not secret values

### Remaining Risks
1. **Contact form uses `google.js/sendContactEmail` directly** (`api/routes/api.js` line 107) — Resend is NOT in this call path. Adding `RESEND_API_KEY` to Railway will make `[Startup] Resend configured: true` log, but the contact form notification will still fail silently because it bypasses `services/email.js` entirely. A follow-on PR is needed to route `POST /api/contacts` through `services/email.js/sendLeadNotification` so Resend is tried first. This is a behavior change and requires separate authorization.
2. **Gmail OAuth remains unconfigured** — 5 variables required; deferred per Phil's decision 2026-05-28
3. **`leads.js` unmounted** — `GOOGLE_GMAIL_USER` absence warn in `google.js` will fire if `leads.js` is ever mounted without Gmail credentials

### Recommended Next Task
1. (Phil) Add `RESEND_API_KEY` to Railway → redeploy → verify `[Startup] Resend configured: true` in Railway logs
2. (Phil) Verify live contact form submission delivers notification email
3. (Phil, separate authorization required) Route `POST /api/contacts` through `services/email.js` so Resend is the active path for contact form notifications

---

## 2026-05-31 — Codex — fix/public-navigation-links

### Objective
Repair repo truth after multiple overlapping agent sessions: identify the canonical production checkout, stop agents from using stale clones or the separate Next.js experiment for production fixes, rebase the public navigation repair onto current `origin/main`, and prepare the branch for PR.

### Changes Made
- `api/server.js` — existing branch change retained: static HTML files are served with extension resolution so `/listings` and `/37-advent` can resolve without `.html`.
- `api/routes/public.js` — existing branch change retained: legacy Advent SEO URL redirects to `/37-advent`.
- `docs/CANONICAL_MAP.md` — added canonical repo/domain/stack map and guardrails from local git state plus read-only live probes.
- `AGENTS.md` — added required reference to `docs/CANONICAL_MAP.md` and MalickLand domain guardrails.
- `PROJECT_STATE.md` — refreshed current repo, branch, PR, validation, and stale-checkout status.
- `ARCHITECTURE.md` and `README.md` — corrected frontend file tree and documented `/37-advent` extensionless static serving.
- `TASKS.md` — updated completed PR/test status and added follow-up for broken `/wv/*-county` links.
- `docs/agent-handoff.md` — demoted to deployment-state reference and removed stale PR #64-era source-of-truth language.

### Verification (Truthfulness Rule)
- Command: `git fetch origin --prune` → Result: PASSED.
- Command: `git rebase origin/main` → Result: PASSED.
- Command: `cd api && npm ci` → Result: PASSED (0 vulnerabilities).
- Command: `node --check server.js && node --check middleware/auth.js && node --check routes/admin.js && node --check routes/api.js && node --check routes/public.js` → Result: PASSED.
- Command: `node tests/verify-security-fixes.test.js` → Result: PASSED (48/48).
- Command: `PREFLIGHT_PORT=43137 bash scripts/preflight.sh` → Result: PASSED after rerun; an earlier parallel run failed before `npm ci` completed and was not a code failure.
- Command: local route smoke on port 43138 for `/37-advent` and `/advent-drive-land-hampshire-county-wv` → Result: PASSED (`/37-advent` 200, legacy URL 301 then 200).
- Command: `curl -fsS https://malickland.net/api/health` → Result: PASSED (200 JSON health response).
- Command: live read-only probes for `/listings`, `/37-advent`, and `/listings.html` → Result: VERIFIED current production still has extensionless 404s before this branch is merged.

### Security Notes
- No secrets read or printed.
- No production mutation, deploy, merge, database mutation, or destructive filesystem cleanup performed.
- Cloudflare Worker deploy remains explicitly blocked without human approval and route-ownership decision.

### Remaining Risks
1. Branch still needs push, PR, GitHub CI, merge, Railway deploy, and production verification.
2. Homepage county links under `/wv/*-county` still point to missing routes/pages; tracked separately in `TASKS.md`.
3. Old local branches and stale duplicate checkouts still exist; do not delete until unpushed work is reviewed.

### Recommended Next Task
Push `fix/public-navigation-links`, open a PR to `main`, wait for GitHub checks, merge after approval, then verify production `/listings`, `/37-advent`, `/advent-drive-land-hampshire-county-wv`, and `/api/health`.
