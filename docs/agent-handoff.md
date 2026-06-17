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
| HEAD (main) | See `PROJECT_STATE.md` — verify with `git rev-parse origin/main` before work |
| Live deploy target | ✅ **Hostinger VPS** `srv1716268` / `31.97.58.203` — Docker container `wv-property-intelligence:vps` behind Traefik+LE; src @ `b9d1198`, container healthy (verified 2026-06-17). **Not Railway.** |
| Deploy method | ⚠️ **Manual** — `ssh root@31.97.58.203`, `git -C /docker/wv-property-intelligence/src fetch && checkout <sha>`, then `docker compose build && docker compose up -d`. Merging to `main` does **not** deploy (no webhook / CI deploy / watchtower) |
| Authenticated smoke | ✅ PASSED (7/7) — 2026-05-27 |
| Production smoke path | ✅ `scripts/smoke-prod.sh` is read-only (`GET` health + property page checks only) |
| npm audit | 0 vulnerabilities (main) |
| GitHub security queues | ✅ clean — open code-scanning, Dependabot, and secret-scanning alerts all zero on 2026-05-31 |
| GitHub branch protection | ✅ required checks + conversation resolution; PR review/admin gates intentionally off per `DECISIONS.md` 2026-05-31 |
| GitHub deployment environments | Legacy Railway statuses (`alert-laughter / production`) + `production`/`copilot` envs are non-gating and no longer reflect the live target (prod is the VPS) — clean up with the Railway decommission task |
| OpenHands executor | ⏳ NOT LIVE — awaiting token provisioning and runtime start |
| `API_KEY` in prod | set in the VPS `.env` (`/docker/wv-property-intelligence/.env`) |

---

## Recent Completed Work

- **csurf → csrf-csrf migration** (PR #63, merged 2026-05-27): double-submit cookie CSRF, session-bound, req.csrfToken() polyfill, 0 vulnerabilities
- **AI control plane bootstrap** (PR #64, merged 2026-05-27): AGENTS.md, .openhands/hooks.json (real OpenHands schema), issue templates, PR template, npm ci policy, GitHub settings docs, fail-closed audit
- **Lead hardening review followups** (PR #84, merged 2026-06-01): lead tables added to runtime/reference schema, county rendering hardened, all required PR checks green before merge
- **Governance follow-up** (PR #86, merged 2026-06-04): compliance copy refreshed; `CONTRIBUTING.md` and `.github/CODEOWNERS` now exist on `main`
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
3. ✅ GitHub required status checks configured (`CodeQL`, `verify`, `check`, `CodeScan`, `semgrep-cloud-platform/scan`)
4. ✅ GitHub branch protection finalized (required checks + conversation resolution)
5. ⏳ OpenHands fine-grained GitHub token — `contents: write`, `pull-requests: write`, `issues: write`; all other permissions set to `none`
6. ⏳ OpenHands executor started (`docker run ...` or `openhands start`)
7. ⏳ First supervised run — create or choose a current task; GitHub currently has no open issues and Issue #66 is already fixed

**Runtime activation** is the only remaining blocker. Required automated checks and conversation resolution are in place; PR review protection and admin enforcement are intentionally off per the 2026-05-31 `DECISIONS.md` branch-protection policy.

### Issue #66 — CLOSED

Issue #66 was fixed by merged PRs #68/#69. The OpenHands npm install blocker now covers the previously missed save-flag forms.

**Other deferred:**
- `PROJECT.md` — may be stale, needs review before use
- Stale local branches (`copilot/*`, some `claude/*`, superseded fix branches) — safe to delete only after confirming no unpushed work
- Closed stale GitHub PRs #60, #70, and #71 on 2026-05-31; do not revive them without re-cutting fresh branches from current `main`
- Deleted stale remote branches on 2026-05-31; only protected `main` remains on `origin`
- Manual hygiene cadence is documented in `CONTRIBUTING.md`; use that file as the authoritative reference for stale-work review timing

---

## Guardrails

- **This file is a deployment-state reference, not the canonical authority document and not proof of any agent's local checkout.** Verify: `git fetch origin && git status && git rev-parse HEAD`
- Read this file before acting
- **Do not commit directly to `main`** unless explicitly approved by the user
- **Do not mutate production data** during smoke tests
- **Do not print or echo production secrets** (the VPS `.env` at `/docker/wv-property-intelligence/.env`, or the dormant Railway twin)
- Confirm deployment success before claiming production completion
- `ADMIN_PASSWORD` for smoke must be supplied at runtime — never hardcoded
- **Verify your branch before acting:** `git branch --show-current`. If not on the intended branch, `git fetch origin && git checkout main && git pull origin main` before starting work
- **Do not commit unrelated untracked files.** Always inspect `git status` before staging
- `git fetch` via SSH may hang in some environments — if it does, verify remote state via the GitHub web UI or switch to HTTPS remote

### OpenHands (Supervised-Only — Permanent)

OpenHands operates in supervised sandboxed mode. Non-negotiable:
- ❌ No autonomous deploys
- ❌ No merge authority
- ❌ No production access (Hostinger VPS SSH or the dormant Railway twin)
- ❌ No production secrets in sandbox
- ❌ No direct `main` push
- Hard limits: 10 iterations max, 30 minutes max, fail closed
- Sandbox contains only GitHub repo access — no VPS SSH key, no Railway token, no prod DB, no prod API keys

---

## Agent Roles

See `AGENTS.md` for full operating rules, forbidden actions, and workflow.

| Agent | Best for |
|-------|----------|
| **ChatGPT** | Orchestration, task routing, QC adjudication |
| **Claude Code** | Implementation, refactoring, PRs |
| **Codex** | Audit, security review, CI forensics; small scoped implementation when Phil explicitly authorizes it in the current task |
| **Gemini** | Architecture critique, threat modeling — no code in active PRs |
| **OpenHands** | Supervised sandboxed implementation — supervised-only |

---

## Key Architecture Notes

- **CSRF:** `csrf-csrf@^3.2.2` active (PR #63 merged 2026-05-27). Double-submit cookie pattern, `req.csrfToken()` polyfill, session-bound. `csurf` fully removed.
- **Google APIs:** `api/google.js` uses Node `https` directly — the `googleapis` npm package is NOT a dependency.
- **Routes:** `/api/properties` and `/api/listings` are alias routes for the same handler. `/properties/:slug` and `/listing/:slug` are both active.
- **Deploy:** Hostinger VPS (`31.97.58.203`) — Docker + Traefik via `api/Dockerfile`; **manual** deploy (merge ≠ deploy). See `docs/CANONICAL_MAP.md`.
- **Smoke scripts:** `scripts/preflight.sh`, `scripts/smoke-admin.sh`, `scripts/smoke-prod.sh` (read-only), `scripts/check-env.sh`. For the lead capture→email path use the manual **`docs/SMOKE_CHECKLIST.md`** (it mutates prod: creates a row + sends a real email).
- **Lead capture:** `/api/leads` is mounted; the Google Sheets adapter is local-safe when sheet credentials are absent
- **CI:** `.github/workflows/preflight.yml` runs `preflight.sh` on all PRs and pushes to `main`.
