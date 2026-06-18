# AGENTS.md — AI Agent Operating Manual
# MalickLand / wv-property-intelligence

> **All AI agents must read this file before acting on this repository.**
> Repository documents are the authoritative source of truth. Agent assumptions and conversational context do not override them.

---

## Repository Authority Rule

All agents treat repository coordination documents as authoritative. In conflict, higher-ranked files win.

```
1. AGENTS.md              — agent behavior rules (this file)
2. SECURITY.md            — security policy, vulnerability reporting, scope
3. ARCHITECTURE.md        — system design, constraints, stability rules
4. DECISIONS.md           — recorded technical decisions
5. TASKS.md               — prioritized backlog
6. PROJECT_STATE.md       — current product completeness, resolved facts, open gates
7. Existing repository conventions — patterns already in the codebase
8. Agent assumptions       — lowest priority; must be documented when used
```

**When sources conflict:**
- Prefer the safer, more conservative implementation.
- Document the conflict and resolution in `DECISIONS.md`.
- Do not take destructive or irreversible action until the conflict is resolved and documented.
- Do not rely on conversational context, session memory, or prior agent output that is not committed to the repository.

`docs/CANONICAL_MAP.md` is the required repo/domain/stack disambiguation map for MalickLand production work.
`docs/agent-handoff.md` is a deployment-state reference only. It does not override AGENTS.md or other governance documents.

---

## State Ledger Rule

Every agent must read `PROJECT_STATE.md` before asking Phil for status, approval, or facts about current production work.

Agents must treat `PROJECT_STATE.md` as a gate ledger:

- **Resolved facts** are closed. Do not ask Phil to reconfirm them unless live evidence contradicts the ledger.
- **Closed gates** are not blockers. Do not re-litigate them, restate them as open, or ask whether they are still true.
- **Open gates** are the only valid source for user questions. Ask only for the specific missing field or approval named there.
- **Claimed facts** from another agent, chat, screenshot, or handoff remain unverified until checked against repo, GitHub, live endpoint, VPS, Railway, or another primary source.
- **Verified facts** must include proof in `PROJECT_STATE.md`, `WORK_LOG.md`, a PR comment, or the current response.

Before asking a user-facing question, an agent must be able to answer:

1. Which gate is open?
2. Who owns it?
3. What exact evidence would close it?
4. Why is it not already closed in `PROJECT_STATE.md`?

If the answer is "I am not sure," inspect `PROJECT_STATE.md`, `DECISIONS.md`, GitHub, and the relevant live system first. Do not ask Phil to re-answer closed gates because the chat context is long or confusing.

### Agent Triage Protocol

Before asking Phil to relay status between Claude, Codex, Gemini, GitHub, Squarespace, Railway, or the VPS, run:

```bash
bash scripts/agent-triage.sh
```

Use the script output plus `PROJECT_STATE.md` as the shared message bus:

- Pull current PR state from GitHub instead of asking Phil to copy/paste another agent's PR summary.
- Pull closed facts and open gates from `PROJECT_STATE.md` instead of asking Phil to restate them.
- Pull live health from `https://malickland.net/api/health` and `/api/config` instead of asking whether production is correct.
- Treat another agent's chat output as **CLAIMED** until verified by repository files, GitHub, live endpoints, VPS, Railway, or an official source.
- If the triage output already answers the question, act on it; do not ask Phil to mediate.

Manual chat relay is a last resort, not the operating model. Use it only when the needed source is unavailable to the current agent or requires a human-owned authentication step such as Squarespace login.

Detailed rules live in `docs/AGENT_TRIAGE_PROTOCOL.md`.

---

## Architectural Stability Rule

Agents **must not** substantially alter architecture, frameworks, database strategy, authentication model, deployment topology, or multi-agent governance unless:

1. The current implementation demonstrably fails a documented requirement, AND
2. The change is documented in `DECISIONS.md` with: problem, decision, reasoning, alternatives considered, migration impact, rollback strategy, and files affected, AND
3. The change has been committed to a branch and passed CI before any production action.

Agents that cannot satisfy all three conditions must stop, document the blocker in `WORK_LOG.md`, and select a different task.

Stable foundations (do not redesign without the above):
- Node.js 20 / Express 5 runtime
- SQLite via `better-sqlite3` (no PostgreSQL migration unless Phase 1 spec requires it)
- `csrf-csrf` v3 double-submit CSRF protection
- `express-session` + Bearer API key auth model
- Hostinger VPS + Docker + Traefik deployment topology (manual deploy; migrated off Railway — see `DECISIONS.md` 2026-06-17)
- Vanilla HTML/JS/CSS frontend (no build step)

---

## Autonomous Safety Stop Rule

Any agent **must stop immediately** and append a blocker entry to `WORK_LOG.md` when:

- Requirements are contradictory or undocumented for the proposed action.
- Security implications of a change are unclear.
- A destructive or irreversible action is required (database migrations, dropping tables, schema changes, file deletion, production deploys).
- Production data could be affected.
- Credentials or infrastructure access are missing or ambiguous.
- A task requires touching more than 5 files beyond the stated scope (flag for scope review).
- The OpenHands iteration limit (10) is reached before task completion.

Do not improvise solutions to blockers. Document them and stop.

---

## Verification Truthfulness Rule

Agents may only report:
- Checks **actually run** in the current session.
- Tests **actually executed** with their real output.
- Builds **actually completed** with their real result.

Simulated, assumed, inferred, or estimated verification **must be explicitly labeled as unverified**.

Never report: "tests pass", "build succeeds", "no vulnerabilities" unless the command was run and the output confirms it in this session.

---

## Agent Roles

| Agent | Role | Allowed | Forbidden |
|-------|------|---------|-----------|
| **Claude Code** | Implementation | Branch work, code changes, PRs, documentation | Direct main push, deploy, printing secrets, self-authorized architecture changes |
| **Codex** | Audit + Phil-authorized implementation | Code review, security skepticism, CI forensics, readiness verdicts; small scoped repo edits only when Phil explicitly authorizes implementation in the current task | Direct main push, deploys, printing secrets, self-authorized architecture/schema changes |
| **Gemini** | Architecture Challenger | Architecture critique, threat modeling, vendor analysis | Touching code in active PRs |
| **ChatGPT** | Spec / Orchestration | Task definition, phase specs, API contracts | Architecture decisions without DECISIONS.md entry |
| **OpenHands** | Supervised Worker | Sandboxed implementation, branch edits, opening PRs | See restrictions below |

**Conflict resolution:** Conflicts between agent outputs are resolved by the repository documents, not by agent adjudication. When agents disagree:
1. Both positions are documented in `DECISIONS.md`.
2. The safer, more conservative implementation is chosen by default.
3. **Phil Malick** (repository owner) is the final human approval authority for merges, production deployments, schema-breaking changes, and publication of AI-generated listing or operational content. No agent may self-authorize these actions.

---

## OpenHands — Supervised-Only Restrictions

OpenHands operates in **supervised sandboxed mode only**. These are permanent constraints.

### Allowed
- Create branches
- Edit code files
- Run local tests (non-production)
- Open pull requests
- Read repository files

### Forbidden (hard stops — no exceptions)
- ❌ Merge pull requests
- ❌ Deploy to any production environment (Hostinger VPS or the dormant Railway twin)
- ❌ Access or read production secrets (`SESSION_SECRET`, `ADMIN_PASSWORD`, `API_KEY`, `DATABASE_PATH`, `OPENAI_API_KEY`, `GOOGLE_*`, `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `LEAD_ALERT_TO_NUMBER`)
- ❌ Push directly to `main`
- ❌ Modify production environment variables (the VPS `.env`, or the dormant Railway twin)
- ❌ Run smoke tests against production (`malickland.net`) without explicit human approval
- ❌ Mutate production database
- ❌ Print or log any secret values

### Hard Limits
- Max iterations per run: **10**
- Max runtime per run: **30 minutes**
- Failure mode: **fail closed** (stop and append to WORK_LOG.md, do not continue)
- Sandbox must contain NO production credentials — GitHub repo access only

---

## Standard Feature Workflow

```
1. Task defined → TASKS.md entry created (with acceptance criteria)
2. ChatGPT delivers spec for complex features (schema, contracts, state machine)
3. OpenHands or Claude Code implements → feature branch
4. Codex audits PR or implements a Phil-authorized scoped task → findings/changes reported for Phil or implementing agent to record if needed
5. Gemini challenges if architecture/security significant → appended to WORK_LOG.md
6. Conflict resolution: repository docs decide; safer path wins
7. All CI checks pass → **Phil Malick** approves PR merge
8. **Phil Malick** approves → **manual** deploy to the Hostinger VPS (SSH + `docker compose build && docker compose up -d`); merging does not auto-deploy
9. Claude or Codex verifies smoke → result appended to WORK_LOG.md
```

No step may be skipped. No agent may self-authorize a step beyond their role.

---

## Pull Request Rules (All Agents)

- **Never push directly to `main`**
- One logical change per branch
- Branch naming: `feature/<desc>`, `fix/<desc>`, `chore/<desc>`
- PR must include: what changed, why, how to validate
- PR must reference the issue: `Closes #N`
- All required CI checks must pass before merge

---

## Dependency Hygiene Policy (Non-Negotiable)

- **Always use `npm ci`** — deterministic; never `npm install` in agent context
- **Never add top-level dependencies** without explicit human approval
- **Never run `npm install <package>`** — propose in PR comment instead
- **Lockfile is canonical** — never delete or modify `package-lock.json` directly

---

## Required Validation Before Any PR

Run in order. All must pass. Per Verification Truthfulness Rule: only report passing if these were actually run.

```bash
cd api && npm ci
node --check server.js
node --check middleware/auth.js
node --check routes/admin.js
node --check routes/api.js
node --check routes/public.js
cd ..
node tests/verify-security-fixes.test.js
bash scripts/preflight.sh
```

---

## CI / Security Gates (Required — No Merge Without)

| Gate | Tool | Owner |
|------|------|-------|
| Preflight (dependency check, syntax check, server startup, public endpoint smoke) | `scripts/preflight.sh` | Claude + Codex |
| Syntax check | `node --check` | Claude |
| Test suite | `node tests/verify-security-fixes.test.js` | All |
| Dependency audit | `npm audit` | Codex |
| CodeQL security scan | GitHub Actions | Automated |
| Secret scanning | GitHub Advanced Security | Automated |
| Semgrep | Semgrep cloud | Automated |

---

## Environment Variables (Never Touch in Code)

Set in the production environment — the Hostinger VPS `.env` at `/docker/wv-property-intelligence/.env` (the dormant Railway twin also holds a copy). Do not hardcode, echo, print, or modify:

**Core (required):**
- `SESSION_SECRET`
- `ADMIN_PASSWORD`
- `API_KEY`
- `DATABASE_PATH`

**OpenAI:**
- `OPENAI_API_KEY`

**Google (Drive + Gmail):**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_GMAIL_USER`

**Email (Resend — primary path):**
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `NOTIFICATION_EMAIL`

**SMS (Twilio — optional, feature-flagged):**
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `LEAD_ALERT_TO_NUMBER`

**Analytics (optional):**
- `GA_MEASUREMENT_ID`
- `META_PIXEL_ID`

---

## Git Safety Rules

```bash
git status --short --untracked-files
git add <specific-file> [<specific-file>...]   # never git add -A or git add .
git diff --cached                              # verify before commit
```

---

## WORK_LOG.md — Coordination Ledger

Every agent session that makes changes must append an entry to `WORK_LOG.md`. This is the memory layer between agents. Format:

```markdown
## YYYY-MM-DD — Agent Name

### Objective
...

### Changes Made
- file/path — what changed and why

### Verification (Truthfulness Rule applies)
- Command: `...` → Result: PASSED / FAILED / NOT RUN

### Security Notes
...

### Remaining Risks
...

### Recommended Next Task
...
```

---

## Codex Gatekeeper Protocol (PR Readiness)

Adopted 2026-06-17 after PR #97 review thrash. **Codex is the independent readiness gatekeeper. GitHub and the live VPS are the only final sources of truth.**

The implementing agent (Claude Code or any other) **may not** call a PR "ready" from its own summary. Review bots (Codex / Gemini / Sourcery) re-review **asynchronously**, so a point-in-time "CLEAN" goes stale; and an all-green-CI PR can still be `BLOCKED` by unresolved threads. READY is declared only after Codex independently verifies the live GitHub + deployment state.

A PR is **READY** only when ALL of these hold (Codex-verified, live):

- Required checks green (`statusCheckRollup`)
- `mergeStateStatus` clean / `mergeable`
- Unresolved, non-outdated review threads = **0**
- Head SHA matches the expected commit
- No production deploy has happened unless Phil approved it (deploy is **manual** — merge ≠ deploy; see `docs/CANONICAL_MAP.md`)

### Claude Handoff Format

When an implementing agent finishes a chunk of work, hand off using exactly this format:

```text
CLAUDE HANDOFF
PR: <url or number>
Head SHA: <sha>
What changed: <brief description>
What was tested: <tests actually run + results>
Known unresolved: <known issues / open threads>
Do not claim ready until Codex verifies:
- gh pr view
- gh pr checks
- reviewThreads unresolved=0
- VPS SHA unchanged unless deploy approved
```

### Codex Verification Response

Codex independently verifies against GitHub/VPS and replies **only** with this format:

```text
VERDICT: READY / NOT READY

Blocking facts:
- <failing checks, unresolved threads, merge-state, SHA mismatch, ...>

Verified:
- checks
- threads
- merge state
- head SHA
- VPS SHA
```

### Live-verify commands

```bash
gh pr view <n> --json headRefOid,mergeStateStatus,mergeable,statusCheckRollup
gh pr checks <n>
# unresolved threads (GraphQL): reviewThreads where isResolved==false AND isOutdated==false
ssh root@31.97.58.203 'git -C /docker/wv-property-intelligence/src rev-parse --short HEAD'   # live deploy SHA
```

Drive the review loop to convergence by reading bot threads **directly off the PR** (do not rely on a human to relay them), and re-verify live immediately before declaring readiness — cite the commit SHA. Context lives in the repository (PRs + tracked `*.md` docs), not in any single agent's session state.

---

## Canonical workspace

Active development repo: **`/Users/yhyh7/Projects/wv-property-intelligence`**. Workspace path, branch, merged PRs, and stale clone warnings are in `PROJECT_STATE.md`. Do not treat `~/Documents/GitHub/wv-property-intelligence`, `~/Projects/wv-realestate`, or the separate Next.js `malickland.net` tree as this product.

## MalickLand Domain Guardrails

1. Production website code lives in this repo unless a recorded architecture decision changes that.
2. Do not edit `malickland-304/malickland.net` for production fixes; it is a separate Next.js experiment/prototype.
3. Health check URL is `https://malickland.net/api/health`, not `/health`.
4. Read `docs/CANONICAL_MAP.md` before malickland.net infrastructure or deployment work.
5. Never run `wrangler deploy` for `listing-system/workers/` without explicit human approval and a recorded route-ownership decision.
6. `malickland.cloud` is not `malickland.net`; treat OpenClaw/trading work as a separate project.

---

## Stale Documentation Notice

The following files are historical reference only:

- `PROJECT.md` — superseded by `PROJECT_STATE.md`
- `CONTEXT.md` — may contain outdated architectural assumptions; verify against code
- `SECURITY_VERIFICATION.md` — historical audit from 2026-04-05; does not reflect current state
- `docs/agent-handoff.md` — deployment/guardrail notes only; may lag `main` — see STALE banner; does not override AGENTS.md
