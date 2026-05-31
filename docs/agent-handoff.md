# Agent Handoff — Deployment reference

> **All agents must read this file before acting on this repo.**

---

> **⚠️ STALE RISK — Product/repo workspace truth lives in [`PROJECT_STATE.md`](../PROJECT_STATE.md).**
> This file may lag GitHub `main` (HEAD, merged PRs, branch paths). Before acting: use canonical repo `/Users/yhyh7/Projects/wv-property-intelligence`, `git fetch origin`, compare `git rev-parse origin/main`. Do **not** use stale clones under `~/Documents/GitHub/` or the separate Next.js `malickland.net` tree.

---

> **This file reflects deployment/guardrail notes, not necessarily any agent's local checkout.**
> Always verify with `git fetch origin && git status` before acting.

## Current Production State

| Item | Status |
|------|--------|
| HEAD (main) | See `PROJECT_STATE.md` — verify with `git rev-parse origin/main` (was `2c4b71e` at 2026-05-31 doc pass) |
| Railway deployment | ✅ Tracks `main` — confirm HEAD in Railway Dashboard → Deployments |
| Authenticated smoke | ✅ PASSED (7/7) — 2026-05-27 |
| npm audit | 0 vulnerabilities (main) |
| Dependabot | clean |
| GitHub branch protection | ✅ hardened — required checks, review approval, stale dismissal, conversation resolution, admin enforcement |
| GitHub `production` environment | ✅ locked — reviewer gate, admin bypass disabled, `main`-only deploys |
| OpenHands executor | ⏳ NOT LIVE — awaiting token provisioning and runtime start |
| `API_KEY` in Railway | confirmed present |

---

## Recent Completed Work

- **csurf → csrf-csrf migration** (PR #63, merged 2026-05-27): double-submit cookie CSRF, session-bound, req.csrfToken() polyfill, 0 vulnerabilities
- **AI control plane bootstrap** (PR #64, merged 2026-05-27): AGENTS.md, .openhands/hooks.json (real OpenHands schema), issue templates, PR template, npm ci policy, GitHub settings docs, fail-closed audit
- Authenticated admin smoke test added (`scripts/smoke-admin.sh`)
- macOS smoke portability fix; smoke body-handling subshell fix
- Smoke converted to non-mutating protected POST; `EBADCSRFTOKEN` → 403
- `brace-expansion` patched via npm audit fix; `cookie` transitive vuln contained

---

## Open Work

### Issue #62 — CLOSED (merged 2026-05-27, PR #63)

csurf removed. csrf-csrf@^3.2.2 in production. See Recent Completed Work.

**Smoke result:** ✅ PASSED (7/7) — 2026-05-27. Production is clean.

### Tech Debt — CodeQL query exclusion (open, low priority)

`.github/codeql/codeql-config.yml` globally excludes `js/missing-token-validation` as a false-positive workaround (csrf-csrf is not in CodeQL's recognized CSRF library list). This is safe while csrf-csrf is in use but broader than ideal. Future work: replace with a narrower per-file suppression or contribute csrf-csrf recognition upstream.

### AI Control Plane Bootstrap — MERGED (PR #64, 2026-05-27)

Governance layer is live on `main`. Includes:
- `AGENTS.md` — agent roles, supervised-only restrictions, dependency hygiene, required GitHub settings
- `.openhands/hooks.json` — documented OpenHands schema (array/matcher format)
- `.openhands/hooks/pre-tool-use.sh` — stdin JSON parsing, exit 2 deny, secret-safe output
- `.openhands/hooks/on-stop.sh` — structured stop report
- `.openhands/setup.sh` — fail-closed npm audit, npm ci enforcement
- `.openhands/instructions.md` — agent operating rules
- `.github/pull_request_template.md` — QC checklist
- `.github/ISSUE_TEMPLATE/` — AI task templates

**OpenHands is NOT YET LIVE.** Pre-flight checklist status (2026-05-27):
1. ✅ PR #64 merged
2. ✅ Production smoke — PASSED (7/7)
3. ✅ GitHub branch protection hardened
4. ✅ `production` GitHub environment locked (reviewer gate, main-only)
5. ⏳ OpenHands fine-grained GitHub token — `contents: write`, `pull-requests: write`, `issues: write`; all other permissions set to `none`
6. ⏳ OpenHands executor started (`docker run ...` or `openhands start`)
7. ⏳ First supervised run — choose a current open issue; Issue #66 is already fixed

**Runtime activation** is the only remaining blocker. All governance controls are in place.

### Issue #66 — CLOSED

Issue #66 was fixed by merged PRs #68/#69. The OpenHands npm install blocker now covers the previously missed save-flag forms.

**Other deferred:**
- `leads.js` — not mounted in `server.js`; decide: mount or delete
- `PROJECT.md` — may be stale, needs review before use
- Stale local branches (`copilot/*`, some `claude/*`, superseded fix branches) — safe to delete only after confirming no unpushed work

---

## Guardrails

- **This file is a deployment-state reference, not the canonical authority document and not proof of any agent's local checkout.** Verify: `git fetch origin && git status && git rev-parse HEAD`
- Read this file before acting
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

- **CSRF:** `csrf-csrf@^3.2.2` active (PR #63 merged 2026-05-27). Double-submit cookie pattern, `req.csrfToken()` polyfill, session-bound. `csurf` fully removed.
- **Google APIs:** `api/google.js` uses Node `https` directly — the `googleapis` npm package is NOT a dependency.
- **Routes:** `/api/properties` and `/api/listings` are alias routes for the same handler. `/properties/:slug` and `/listing/:slug` are both active.
- **Deploy:** Railway via Dockerfile, branch `main` auto-deploys.
- **Smoke scripts:** `scripts/preflight.sh`, `scripts/smoke-admin.sh`, `scripts/smoke-prod.sh`, `scripts/check-env.sh`
- **CI:** `.github/workflows/preflight.yml` runs `preflight.sh` on all PRs and pushes to `main`.
