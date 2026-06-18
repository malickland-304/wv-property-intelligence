# TASKS.md — Malickland 2.0 Backlog
> Format: Task — acceptance criteria — dependencies — owner/status
> Update when tasks change state. Completed tasks move to ## Completed.

---

## Critical

- [x] **Fix test suite** — 48/48 pass; tests updated to check route files (`routes/api.js`, `routes/admin.js`, `helpers.js`); Suite 9 added for governance file presence — **Claude Code** — COMPLETED 2026-05-27 / reverified 2026-05-31
- [x] **Resolve leads.js** — mounted `/api/leads`, added local-safe `services/googleSheets.js` adapter, and guarded lead/contact POSTs in `server.js` — **Codex** — COMPLETED 2026-06-01

---

## High Priority

- [ ] **Railway twin final deletion after retention** — audit ✅ (Railway `contacts`/`leads` == VPS, hashes match, no un-migrated leads), full `/data` backup ✅ (downloaded to `~/railway-decommission-backup-2026-06-17/`, retain 30-90 days), deployments ✅ **REMOVED**, GitHub auto-deploy ✅ **disabled** and proven by the #102 merge not reviving Railway. See `DECISIONS.md` 2026-06-17. **Remaining after retention:** (1) hard-delete the service/volume; (2) remove `railway.json` + the legacy GitHub deployment environments from the repo; (3) rotate/retire any retained Railway copy of production secrets as part of final deletion. ⚠️ **Human-only** (real lead PII + prod secrets). — **Phil**
- [ ] **Deploy persistent `LISTINGS_ROOT` on the VPS** — repo support added for configurable listing storage; next deploy must set `LISTINGS_ROOT=/data/listings` in `/docker/wv-property-intelligence/.env`, create/migrate any existing `/workspace/listings` files into `/data/listings`, restart, and verify `/images/*` still serves. Google Drive remains the off-box media backup path. — depends on Phil-approved VPS deploy window — **Phil / Claude Code**
- [ ] **Public assistant backend (`POST /api/chat`)** — homepage "MalickLand Assistant" widget had no backend (404 in prod). Added a public, per-IP rate-limited, same-origin chat route reusing the PR #90 gateway-aware AI plumbing (`generateChatReply`); strict brokerage-safe system prompt; safe-by-default with no AI key. Acceptance: security suite 52/52, new chat suite 14/14, preflight green (incl. assistant smoke). **Phil (human-only)** — configuring the AI key requires production SSH + secret access, which agents must not do per AGENTS.md; a human sets it in the VPS `.env` (not Railway) to enable live replies.
- [ ] **OpenHands executor activation** — provision fine-grained GitHub token; start executor; run first supervised task — waiting on developer action; Issue #66 is fixed and Issue #65 is closed, so create or pick a current task — **developer action**

---

## Medium Priority

- [ ] **Delete stale local branches** — remote branches are cleaned up; remove superseded local `copilot/*`, old `claude/*`, and merged fix branches after confirming no unpushed work — no deps — **Claude Code or developer**
- [ ] **Add twilio to package.json or remove Twilio path** — optional SMS alert follow-up; current code fails gracefully when `twilio` is unavailable — no longer blocks lead route mounting
- [ ] **Phase 1: Document Registry spec** — ChatGPT delivers schema, approval state machine, AI extraction JSON contract — no code deps — **ChatGPT**

---

## Low Priority

- [ ] **Phase 1: Document Registry implementation** — new SQLite tables: `documents`, `document_versions`, `audit_events`, `integration_events`, `extracted_claims` (placeholder); API skeleton `/api/documents`; tests — depends on Phase 1 spec from ChatGPT — **OpenHands or Claude Code**
- [ ] **Phase 2: AI Review Queue** — depends on Phase 1 complete + ChatGPT spec
- [ ] **Phase 3: Drive event automation** — depends on Phase 2 — **Gemini leads**
- [ ] **Phase 4: Gmail intake** — depends on Phase 3 — **Gemini leads**
- [ ] **CORS origin restriction review** — evaluate if `cors()` without origin list is appropriate as API scope grows
- [ ] **Add integration/E2E tests** — currently only unit-style static-analysis tests; add real HTTP tests using supertest or similar

---

## Completed

- [x] **Repo support for persistent listing uploads** — `LISTINGS_ROOT` now controls listing/photo storage and `/images` serving; default remains local repo `listings/`, VPS target is `/data/listings` on the existing persistent volume — 2026-06-18
- [x] **Agent triage protocol** — added `scripts/agent-triage.sh` and `docs/AGENT_TRIAGE_PROTOCOL.md`; agents must run/read durable state before asking Phil to relay Claude/Codex/GitHub/production status — 2026-06-18
- [x] **Broken county links** — resolved: `/wv/:slug` county-page route exists (`api/routes/public.js:161`); serves county pages when `PUBLIC_LISTINGS_ENABLED=true`, gracefully `302`→`/` when off; homepage `/wv/<county>-county` links are hidden by the listings-off CSS — no 404s (verified live 2026-06-18: `/wv/hampshire-county` → 302)
- [x] csurf → csrf-csrf migration — PR #63 merged 2026-05-27 — Codex verified, smoke PASSED
- [x] AI control plane bootstrap (AGENTS.md, OpenHands hooks, issue templates) — PR #64 merged 2026-05-27
- [x] Handoff doc update post-PR #64 — PR #67 merged
- [x] Block `npm install --save` / `npm i -S` in pre-tool hook — PR #68 merged 2026-05-27 (copilot fix for Issue #66)
- [x] GitHub stale PR cleanup — PRs #60, #70, and #71 closed with evidence comments; linked Issues #65/#66 already closed — 2026-05-31
- [x] CodeQL suppression narrowing attempt closed — PR #71 failed CodeQL; broad false-positive exclusion remains documented until a fresh green approach exists
- [x] Governance test suite repair — PR #73 merged 2026-05-28
- [x] Startup notification observability — PR #75 merged 2026-05-28
- [x] Canonical production map created — `docs/CANONICAL_MAP.md` added 2026-05-31
- [x] Public navigation repair PR opened — PR #76 opened 2026-05-31
- [x] Public navigation repair merged — PR #76 merged to `main` (`dc8cc53`) 2026-05-31
- [x] Public navigation repair deployed and smoke-tested — production `/api/health`, `/listings`, `/37-advent`, and legacy Advent redirect verified 2026-05-31
- [x] GitHub required status checks configured — `CodeQL`, `verify`, `check`, `CodeScan`, `semgrep-cloud-platform/scan`
- [x] GitHub branch protection finalized — required checks + conversation resolution enabled; manual PR review/admin gates intentionally off per `DECISIONS.md` 2026-05-31 — 2026-05-31
- [x] GitHub remote branch cleanup — 73 stale non-`main` remote branches deleted; only protected `main` remains — 2026-05-31
- [x] GitHub security queues audited — open CodeQL/code-scanning alerts, Dependabot alerts, and secret-scanning alerts all zero — 2026-05-31
- [x] GitHub environments audited — Railway deployments report to `alert-laughter / production`; unused `production`/`copilot` environments documented as non-gating — 2026-05-31
- [x] Issue #85 governance follow-up — added `CONTRIBUTING.md`, `.github/CODEOWNERS`, manual stale-work cadence, and non-mutating smoke guidance — 2026-06-04
- [x] `docs/agent-handoff.md` refresh — corrected merged PR state, lead-route status, and maintenance notes — 2026-06-04
- [x] `brace-expansion` patched, `cookie` transitive vuln contained
- [x] Create PROJECT_STATE.md, TASKS.md, DECISIONS.md, QA_CHECKLIST.md — 2026-05-27 (Claude Code)
- [x] Create ARCHITECTURE.md, WORK_LOG.md — 2026-05-27 (Claude Code)
- [x] Rewrite AGENTS.md with repository authority hierarchy, 4 governance rules, env vars for services layer — 2026-05-27 (Claude Code)
- [x] Advent close + $299 broker admin-fee disclosure deployed — #101 merged/deployed; live DB row `sold` / `$170,000` / `2026-05-29`; broker disclosure live — 2026-06-17
- [x] Production smoke flag fix — #102 merged; `scripts/smoke-prod.sh` respects `PUBLIC_LISTINGS_ENABLED` and validates listings-off behavior — 2026-06-17
- [x] Railway auto-deploy disabled — deployments removed and #102 merge did not revive the dormant twin — 2026-06-17
