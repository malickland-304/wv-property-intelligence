# Agent Handoff — Source of Truth

> **All agents must read this file before acting on this repo.**

---

## Current Production State

| Item | Status |
|------|--------|
| HEAD | `18cc6bd4eb833c861e5bc227e9e65bc42e4e1613` |
| Branch | `main` |
| Railway deployment | SUCCESS (`d25f759b-4549-4b01-8275-f89d6f09f03a`) |
| Authenticated smoke | PASS (7/7) |
| npm audit | 0 vulnerabilities |
| Dependabot | clean |
| Production test artifacts | none |
| `API_KEY` in Railway | confirmed present |

---

## Recent Completed Work

- Authenticated admin smoke test added (`scripts/smoke-admin.sh`)
- macOS smoke portability fix
- Smoke body-handling subshell fix
- Smoke converted to non-mutating protected POST
- `EBADCSRFTOKEN` now returns 403
- `brace-expansion` patched via npm audit fix
- `cookie` transitive vulnerability contained via `overrides` in `package.json`

---

## Open Work

### Issue #62 — Replace `csurf` with `csrf-csrf`

**Priority:** P1

**Acceptance criteria:**
- Remove `csurf` dependency
- Add `csrf-csrf@^3.2.2` + `cookie-parser` (pin to `^3.2.2` — v4 has breaking API changes)
- Preserve existing admin auth behavior
- Preserve `smoke-admin.sh` compatibility (CSRF round-trip must still pass)
- Update `scripts/preflight.sh` dependency assertion (`npm ls csurf` → `npm ls csrf-csrf`)
- Remove `overrides.cookie` from `package.json` (no longer needed once `csurf` is gone)
- Update `server.js` and `middleware/auth.js`
- Validate with `ADMIN_PASSWORD=<pw> ./scripts/smoke-admin.sh`
- Deploy to Railway and confirm prod smoke passes
- **No direct push to `main`** — open a PR

**Other deferred:**
- `leads.js` — not mounted in `server.js`; decide: mount or delete
- `PROJECT.md` — severely stale, needs update
- Stale remote branches (`copilot/*`, some `claude/*`) — safe to delete

---

## Guardrails

- **This file reflects canonical production state, not necessarily any agent's local checkout. Verify local repo state (`git status`, `git branch`, `git rev-parse HEAD`) before acting.**
- Read this file before acting
- **Do not commit directly to `main`** unless explicitly approved by the user
- **Do not mutate production data** during smoke tests
- **Do not print or echo Railway secrets**
- Confirm deployment success before claiming production completion
- `ADMIN_PASSWORD` for smoke must be supplied at runtime — never hardcoded
- **Verify your branch before acting:** `git branch --show-current`. If not on the intended branch, `git fetch origin && git checkout main && git pull origin main` before starting work
- **Do not commit unrelated untracked files.** Always inspect `git status` before staging
- `git fetch` via SSH may hang in some environments — if it does, verify remote state via the GitHub web UI or switch to HTTPS remote

---

## Agent Roles

| Agent | Best for |
|-------|----------|
| **Claude Code** | Implementation, refactoring, PRs |
| **Codex** | Validation, ops automation, script hardening |
| **Gemini** | Architecture review, security analysis |

---

## Key Architecture Notes

- **CSRF:** Currently `csurf@1.11.0` (session-based). Migration to `csrf-csrf` tracked in Issue #62.
- **Google APIs:** `api/google.js` uses Node `https` directly — the `googleapis` npm package is NOT a dependency.
- **Routes:** `/api/properties` and `/api/listings` are alias routes for the same handler. `/properties/:slug` and `/listing/:slug` are both active.
- **Deploy:** Railway via Dockerfile, branch `main` auto-deploys.
- **Smoke scripts:** `scripts/preflight.sh`, `scripts/smoke-admin.sh`, `scripts/smoke-prod.sh`, `scripts/check-env.sh`
- **CI:** `.github/workflows/preflight.yml` runs `preflight.sh` on all PRs and pushes to `main`.
