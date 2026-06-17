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
- [ ] `bash scripts/preflight.sh` — all checks pass (dependency check, syntax check, server startup, public endpoint smoke)

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

## Pre-Deploy Checklist (Hostinger VPS — Manual Deploy)

> Production runs on the Hostinger VPS (`31.97.58.203`), Docker + Traefik. Deploy is **manual** — merging to `main` does **not** update production. Deploy a specific reviewed, Phil-approved commit.

- [ ] All required CI checks green on GitHub for the target commit
- [ ] Smoke test passed (`bash scripts/smoke-prod.sh <BASE_URL>` — read-only)
- [ ] No new secrets in code; any new env vars added to the VPS `.env` (`/docker/wv-property-intelligence/.env`)
- [ ] Rollback plan: record the current live SHA before deploying — `ssh root@31.97.58.203 'git -C /docker/wv-property-intelligence/src rev-parse --short HEAD'`
- [ ] Human (Phil) explicitly approved deploy
- [ ] Deploy: SSH → `git -C /docker/wv-property-intelligence/src fetch && checkout <sha>` → `cd /docker/wv-property-intelligence && docker compose build && docker compose up -d`
- [ ] Post-deploy verify: container healthy + live `GET /api/health` → 200

---

## Production Readiness Gate

Do NOT declare production-ready unless ALL of the following are true:
- [ ] Test suite exits 0
- [ ] Preflight script passes
- [ ] npm audit shows 0 critical/high vulnerabilities
- [ ] No known unresolved security issues
- [ ] Environment variables documented and confirmed in the VPS `.env` (`/docker/wv-property-intelligence/.env`)
- [ ] `docs/agent-handoff.md` reflects current production state
