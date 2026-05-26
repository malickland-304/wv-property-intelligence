# Agent Handoff — Source of Truth

> **All agents must read this file before acting on this repo.**

---

> **This file reflects canonical production state, not necessarily any agent's local checkout.**
> Always verify local repo state with `git fetch origin && git status` before acting.

## Current Production State

| Item | Status |
|------|--------|
| HEAD (main) | `9330fe5` (`docs: add agent handoff source of truth`) |
| Railway deployment | SUCCESS — running `18cc6bd` + smoke patches |
| Authenticated smoke | PASS (7/7) on deployed revision |
| npm audit | 0 vulnerabilities (main) |
| Dependabot | clean |
| Production test artifacts | none |
| `API_KEY` in Railway | confirmed present |
| Active PR | #63 `feature/replace-csurf` — csurf → csrf-csrf migration (awaiting CodeQL gate) |

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

### Issue #62 — Replace `csurf` with `csrf-csrf` — IN PROGRESS (PR #63)

**Priority:** P1 | **Branch:** `feature/replace-csurf` | **PR:** #63

**Status:** Implementation complete. CodeQL false-positive dismissed (alert #126, `js/missing-token-validation`). Awaiting CodeQL check to pass after dismissal + retrigger commit.

**What was done:**
- Removed `csurf` → added `csrf-csrf@^3.2.2` + `cookie-parser`
- Double-submit cookie pattern via `doubleCsrfProtection`
- `req.csrfToken()` polyfill preserves `auth.js` and `admin.js` compatibility without modifying them
- `getSessionIdentifier: (req) => req.sessionID` binds tokens to session
- Production guard: throws if `SESSION_SECRET` unset in production
- `cookieParser` scoped to `/admin` chain only
- Multipart body guard: `(req.body && req.body._csrf) || req.headers['x-csrf-token']`
- `preflight.sh` updated: `npm ls csrf-csrf`
- `overrides.cookie` removed from `package.json`

**Acceptance criteria remaining:**
- [ ] CodeQL required check passes
- [ ] Human merge approval
- [ ] Railway deploy
- [ ] `ADMIN_PASSWORD=<pw> ./scripts/smoke-admin.sh` passes on production

**Other deferred:**
- `leads.js` — not mounted in `server.js`; decide: mount or delete
- `PROJECT.md` — severely stale, needs update
- Stale remote branches (`copilot/*`, some `claude/*`) — safe to delete

---

## Guardrails

- **This file reflects canonical production state, not necessarily any agent's local checkout. Verify local repo state (`git status`, `git branch`, `git rev-parse HEAD`) before acting.**
- Read this file before acting
- **This file reflects canonical production state, not any agent's local checkout.** Verify branch and commit: `git fetch origin && git status && git rev-parse HEAD`
- **Do not commit directly to `main`** unless explicitly approved by the user
- **Do not mutate production data** during smoke tests
- **Do not print or echo Railway secrets**
- Confirm deployment success before claiming production completion
- `ADMIN_PASSWORD` for smoke must be supplied at runtime — never hardcoded
- **Verify your branch before acting:** `git branch --show-current`. If not on the intended branch, `git fetch origin && git checkout main && git pull origin main` before starting work
- **Do not commit unrelated untracked files.** Always inspect `git status` before staging
- `git fetch` via SSH may hang in some environments — if it does, verify remote state via the GitHub web UI or switch to HTTPS remote

### OpenHands (Supervised-Only — Permanent)

OpenHands operates in supervised sandboxed mode. Non-negotiable:
- ❌ No autonomous deploys
- ❌ No merge authority
- ❌ No Railway production access
- ❌ No production secrets in sandbox
- ❌ No direct `main` push
- Hard limits: 10 iterations max, 30 minutes max, fail closed
- Sandbox contains only GitHub repo access — no Railway token, no prod DB, no prod API keys

---

## Agent Roles

See `AGENTS.md` for full operating rules, forbidden actions, and workflow.

| Agent | Best for |
|-------|----------|
| **ChatGPT** | Orchestration, task routing, QC adjudication |
| **Claude Code** | Implementation, refactoring, PRs |
| **Codex** | Audit, security review, CI forensics — no mutations |
| **Gemini** | Architecture critique, threat modeling — no code in active PRs |
| **OpenHands** | Supervised sandboxed implementation — supervised-only |

---

## Key Architecture Notes

- **CSRF:** Migration from `csurf@1.11.0` → `csrf-csrf@^3.2.2` in progress (PR #63). Double-submit cookie pattern, `req.csrfToken()` polyfill preserves auth.js/admin.js compatibility.
- **Google APIs:** `api/google.js` uses Node `https` directly — the `googleapis` npm package is NOT a dependency.
- **Routes:** `/api/properties` and `/api/listings` are alias routes for the same handler. `/properties/:slug` and `/listing/:slug` are both active.
- **Deploy:** Railway via Dockerfile, branch `main` auto-deploys.
- **Smoke scripts:** `scripts/preflight.sh`, `scripts/smoke-admin.sh`, `scripts/smoke-prod.sh`, `scripts/check-env.sh`
- **CI:** `.github/workflows/preflight.yml` runs `preflight.sh` on all PRs and pushes to `main`.
