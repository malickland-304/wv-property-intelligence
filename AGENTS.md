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
6. PROJECT_STATE.md       — current product completeness
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
- Railway + Docker deployment topology
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
| **Codex** | QA / Security Audit | Code review, security skepticism, CI forensics, readiness verdicts | Any repo mutation, commits, deploys |
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
- ❌ Deploy to Railway or any production environment
- ❌ Access or read production secrets (`SESSION_SECRET`, `ADMIN_PASSWORD`, `API_KEY`, `DATABASE_PATH`, `OPENAI_API_KEY`, `GOOGLE_*`, `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `LEAD_ALERT_TO_NUMBER`)
- ❌ Push directly to `main`
- ❌ Modify Railway environment variables
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
4. Codex audits PR → findings reported for Phil or implementing agent to record if needed
5. Gemini challenges if architecture/security significant → appended to WORK_LOG.md
6. Conflict resolution: repository docs decide; safer path wins
7. All CI checks pass → **Phil Malick** approves PR merge
8. **Phil Malick** approves → Railway deploy
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

Set in Railway. Do not hardcode, echo, print, or modify:

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
