# TASKS.md — Malickland 2.0 Backlog
> Format: Task — acceptance criteria — dependencies — owner/status
> Update when tasks change state. Completed tasks move to ## Completed.

---

## Critical

- [x] **Fix test suite** — 42/42 pass; tests updated to check route files (`routes/api.js`, `routes/admin.js`, `helpers.js`); Suite 9 added for governance file presence — **Claude Code** — COMPLETED 2026-05-27
- [ ] **Resolve leads.js** — decide: (A) implement missing `services/googleSheets.js` + add `twilio` to package.json, or (B) delete `leads.js` and its service deps — decision from ChatGPT required first — **ChatGPT decides / Claude implements**

---

## High Priority

- [ ] **Update docs/agent-handoff.md + AGENTS.md env vars** — document services layer env vars: `RESEND_API_KEY`, `FROM_EMAIL`, `NOTIFICATION_EMAIL`, `TWILIO_*`, `LEAD_ALERT_TO_NUMBER`; update architecture notes — no deps — Claude Code
- [ ] **Switch local repo to main** — `git checkout main && git pull origin main` before starting any new work; local is on stale `fix/hook-npm-save-patterns` — pre-condition for all new work — **developer action**
- [ ] **OpenHands executor activation** — provision fine-grained GitHub token; start executor; run first supervised task — waiting on developer action; Issue #66 is now fixed on main, so pick Issue #65 or new task — **developer action**

---

## Medium Priority

- [ ] **Delete stale remote branches** — remove merged `copilot/*`, old `claude/*` branches; keep only active feature branches — no deps — **Claude Code or developer**
- [ ] **Add twilio to package.json or remove Twilio path** — if leads feature is kept: `npm install twilio` (human approval required per AGENTS.md); if deleted: remove twilioService.js and references — depends on leads.js decision
- [ ] **Phase 1: Document Registry spec** — ChatGPT delivers schema, approval state machine, AI extraction JSON contract — no code deps — **ChatGPT**
- [ ] **Narrow CodeQL suppression** (Issue #65) — replace broad `js/missing-token-validation` query exclusion with per-file suppression — low risk, no deps — **Claude Code**

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
- [x] GitHub branch protection hardened — required checks, review approval, stale dismissal, admin enforcement
- [x] `production` GitHub environment locked — reviewer gate, main-only deploys
- [x] `brace-expansion` patched, `cookie` transitive vuln contained
- [x] Create PROJECT_STATE.md, TASKS.md, DECISIONS.md, QA_CHECKLIST.md — 2026-05-27 (Claude Code)
- [x] Create ARCHITECTURE.md, WORK_LOG.md — 2026-05-27 (Claude Code)
- [x] Rewrite AGENTS.md with repository authority hierarchy, 4 governance rules, env vars for services layer — 2026-05-27 (Claude Code)
