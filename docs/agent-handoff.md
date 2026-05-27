# Agent Handoff — Source of Truth

> **All agents must read this file before acting on this repo.**

---

> **This file reflects canonical production state, not necessarily any agent's local checkout.**
> Always verify local repo state with `git fetch origin && git status` before acting.

## Current Production State

| Item | Status |
|------|--------|
| HEAD (main) | `ed2b977` (`feat(security): replace deprecated csurf with csrf-csrf`) |
| Railway deployment | DEPLOYING — auto-triggered by merge of `ed2b977`; run smoke after deploy |
| Authenticated smoke | PENDING — must run `ADMIN_PASSWORD=<pw> ./scripts/smoke-admin.sh` after deploy |
| npm audit | 0 vulnerabilities (main) |
| Dependabot | clean |
| Production test artifacts | none |
| `API_KEY` in Railway | confirmed present |

---

## Recent Completed Work

- **csurf → csrf-csrf migration** (PR #63, merged 2026-05-27): double-submit cookie CSRF, session-bound, req.csrfToken() polyfill, 0 vulnerabilities
- AI agent control plane bootstrap (PR #64, open): AGENTS.md, .openhands/hooks.json, issue templates, PR template, npm ci policy
- Authenticated admin smoke test added (`scripts/smoke-admin.sh`)
- macOS smoke portability fix; smoke body-handling subshell fix
- Smoke converted to non-mutating protected POST; `EBADCSRFTOKEN` → 403
- `brace-expansion` patched via npm audit fix; `cookie` transitive vuln contained

---

## Open Work

### Issue #62 — CLOSED (merged 2026-05-27, PR #63)

csurf removed. csrf-csrf@^3.2.2 in production. See Recent Completed Work.

**Pending owner action:** run `ADMIN_PASSWORD=<pw> ./scripts/smoke-admin.sh` against prod after Railway deploy completes. Must see `PASSED (7/7)`.

### Tech Debt — CodeQL query exclusion (open, low priority)

`.github/codeql/codeql-config.yml` globally excludes `js/missing-token-validation` as a false-positive workaround (csrf-csrf is not in CodeQL's recognized CSRF library list). This is safe while csrf-csrf is in use but broader than ideal. Future work: replace with a narrower per-file suppression or contribute csrf-csrf recognition upstream.

### AI Control Plane Bootstrap (PR #64 — open, awaiting merge)

Branch: `chore/ai-control-plane-bootstrap`
AGENTS.md, hooks.json, issue templates, PR template, npm ci policy. Review before merging.

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
