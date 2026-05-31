# TASKS.md — Malickland 2.0 Backlog
> Format: Task — acceptance criteria — dependencies — owner/status
> Update when tasks change state. Completed tasks move to ## Completed.

---

## Critical

- [x] **Fix test suite** — 48/48 pass; tests updated to check route files (`routes/api.js`, `routes/admin.js`, `helpers.js`); Suite 9 added for governance file presence — **Claude Code** — COMPLETED 2026-05-27 / reverified 2026-05-31
- [ ] **Resolve leads.js** — decide: (A) implement missing `services/googleSheets.js` + add `twilio` to package.json, or (B) delete `leads.js` and its service deps — decision from ChatGPT required first — **ChatGPT decides / Claude implements**

---

## High Priority

- [ ] **Update docs/agent-handoff.md service notes** — keep deployment-state reference aligned with current service env vars and merged PR state; do not let it override AGENTS.md — no deps — Claude Code
- [ ] **OpenHands executor activation** — provision fine-grained GitHub token; start executor; run first supervised task — waiting on developer action; Issue #66 is fixed and Issue #65 is closed, so create or pick a current task — **developer action**

---

## Medium Priority

- [ ] **Delete stale local branches** — remote branches are cleaned up; remove superseded local `copilot/*`, old `claude/*`, and merged fix branches after confirming no unpushed work — no deps — **Claude Code or developer**
- [ ] **Add twilio to package.json or remove Twilio path** — if leads feature is kept: `npm install twilio` (human approval required per AGENTS.md); if deleted: remove twilioService.js and references — depends on leads.js decision
- [ ] **Resolve broken county links** — homepage links `/wv/hampshire-county`, `/wv/hardy-county`, `/wv/morgan-county`, and other county paths, but no static pages or Express route exists; decide whether to create county pages or replace links with listing filters — no deps
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
- [x] GitHub branch protection finalized — required checks + conversation resolution enabled; manual PR review/admin gates intentionally off for low-friction solo operation — 2026-05-31
- [x] GitHub remote branch cleanup — 73 stale non-`main` remote branches deleted; only protected `main` remains — 2026-05-31
- [x] GitHub security queues audited — open CodeQL/code-scanning alerts, Dependabot alerts, and secret-scanning alerts all zero — 2026-05-31
- [x] GitHub environments audited — Railway deployments report to `alert-laughter / production`; unused `production`/`copilot` environments documented as non-gating — 2026-05-31
- [x] `brace-expansion` patched, `cookie` transitive vuln contained
- [x] Create PROJECT_STATE.md, TASKS.md, DECISIONS.md, QA_CHECKLIST.md — 2026-05-27 (Claude Code)
- [x] Create ARCHITECTURE.md, WORK_LOG.md — 2026-05-27 (Claude Code)
- [x] Rewrite AGENTS.md with repository authority hierarchy, 4 governance rules, env vars for services layer — 2026-05-27 (Claude Code)
