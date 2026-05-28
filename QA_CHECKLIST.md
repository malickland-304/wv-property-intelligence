# QA_CHECKLIST.md — Malickland 2.0
> Complete all applicable checks before marking any task done or opening a PR.

---

## Pre-PR Checklist (All Changes)

### Syntax & Dependency
- [ ] `cd api && npm ci` — succeeds, no lockfile changes
- [ ] `node --check api/server.js` — passes
- [ ] `node --check api/middleware/auth.js` — passes
- [ ] `node --check api/routes/admin.js` — passes
- [ ] `node --check api/routes/api.js` — passes
- [ ] `node --check api/routes/public.js` — passes
- [ ] `cd api && npm audit` — 0 critical/high vulnerabilities

### Automated Tests
- [ ] `node tests/verify-security-fixes.test.js` — exits 0 (all tests pass)

### Preflight (Required)
- [ ] `bash scripts/preflight.sh` — all checks pass (starts server, hits endpoints, validates CSRF, auth redirect)

### Code Review (Self-Review)
- [ ] No hardcoded secrets, tokens, or credentials anywhere in the diff
- [ ] No `console.log` of request data, secrets, or PII
- [ ] All untrusted inputs (request body, params, query) validated before use
- [ ] Authorization checked server-side (not just frontend)
- [ ] SQL uses prepared statements (no string interpolation in queries)
- [ ] New env vars documented in `AGENTS.md` and `docs/agent-handoff.md`
- [ ] No `npm install` (use `npm ci`); no new deps added without human approval
- [ ] No direct push to `main`; changes are on a feature/fix/chore branch

### Functionality
- [ ] Normal flow works as expected
- [ ] Edge cases tested (empty inputs, invalid data, missing fields)
- [ ] Failure paths return appropriate status codes and messages
- [ ] No obvious regression in related endpoints

### Documentation
- [ ] `docs/agent-handoff.md` updated if architecture, env vars, or routes changed
- [ ] `PROJECT_STATE.md` updated if product completeness changed
- [ ] `TASKS.md` updated: in-progress task marked complete, new tasks added
- [ ] `DECISIONS.md` updated if a significant technical decision was made

---

## Additional Checks for Security-Sensitive Changes

- [ ] Auth/session changes: verify admin-only routes still reject unauthenticated requests
- [ ] CSRF changes: verify `POST /admin/*` returns 403 without CSRF token
- [ ] File upload changes: verify path traversal protection (no raw user input in file paths)
- [ ] Database schema changes: migration tested; rollback plan documented
- [ ] New external HTTP calls: no SSRF risk; URL is not controlled by user input

---

## Additional Checks for UI/Frontend Changes

- [ ] Keyboard navigation preserved
- [ ] No color-only communication (accessible error/status states)
- [ ] Mobile/responsive layout not broken
- [ ] Content Security Policy not violated (check browser console)

---

## Pre-Deploy Checklist (Railway Production)

- [ ] All required CI checks green on GitHub
- [ ] Smoke test passed locally (`bash scripts/smoke-prod.sh <BASE_URL>`)
- [ ] No new secrets introduced in code
- [ ] Rollback plan: note prior Railway deployment ID
- [ ] Human explicitly approved deploy

---

## Production Readiness Gate

Do NOT declare production-ready unless ALL of the following are true:
- [ ] Test suite exits 0
- [ ] Preflight script passes
- [ ] npm audit shows 0 critical/high vulnerabilities
- [ ] No known unresolved security issues
- [ ] Environment variables documented and confirmed in Railway
- [ ] `docs/agent-handoff.md` reflects current production state
