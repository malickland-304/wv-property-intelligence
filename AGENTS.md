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
- **Claimed facts** from another agent, chat, screenshot, or handoff remain unverified until checked against repo, GitHub, live endpoint, VPS, or another primary source. For `malickland.net` production, the old Railway twin is deleted and is not production proof.
- **Verified facts** must include proof in `PROJECT_STATE.md`, `WORK_LOG.md`, a PR comment, or the current response.

Before asking a user-facing question, an agent must be able to answer:

1. Which gate is open?
2. Who owns it?
3. What exact evidence would close it?
4. Why is it not already closed in `PROJECT_STATE.md`?

If the answer is "I am not sure," inspect `PROJECT_STATE.md`, `DECISIONS.md`, GitHub, and the relevant live system first. Do not ask Phil to re-answer closed gates because the chat context is long or confusing.

### Agent Triage Protocol

Before asking Phil to relay status between Claude, Codex, Gemini, GitHub, or the VPS, run:

```bash
bash scripts/agent-triage.sh
```

Use the script output plus `PROJECT_STATE.md` as the shared message bus:

- Pull current PR state from GitHub instead of asking Phil to copy/paste another agent's PR summary.
- Pull closed facts and open gates from `PROJECT_STATE.md` instead of asking Phil to restate them.
- Pull live health from `https://malickland.net/api/health` and `/api/config`, then prove the VPS SHA/container with `EXPECTED_SHA=<full-sha> bash scripts/verify-vps-prod.sh` before claiming production is current.
- Treat another agent's chat output as **CLAIMED** until verified by repository files, GitHub, live endpoints, VPS, or an official source.
- If the triage output already answers the question, act on it; do not ask Phil to mediate.

Manual chat relay is a last resort, not the operating model. Use it only when the needed source is unavailable to the current agent or requires a human-owned authentication step.

Detailed rules live in `docs/AGENT_TRIAGE_PROTOCOL.md`.

### Production Proof Rule

`malickland.net` production truth is DNS + VPS + container state. A Railway deployment, Railway healthcheck, GitHub deployment environment, or generic `curl /api/health` without SHA proof is not enough.

Required proof before saying a commit is live:

```bash
EXPECTED_SHA=<full-git-sha> bash scripts/verify-vps-prod.sh
```

That command must show DNS includes `31.97.58.203`, `/docker/wv-property-intelligence/src` is at the expected SHA, the `wv-property-intelligence` container is running healthy, and read-only live smoke passes.

---

## Architectural Stability Rule

Agents **must not** substantially alter architecture, frameworks, database strategy, authentication model, deployment topology, or multi-agent governance unless:

1. The current implementation demonstrably fails a documented requirement, AND
2. The change is documented in `DECISIONS.md` with: problem, decision, reasoning, alternatives considered, migration impact, rollback strategy, and files affected, AND
3. The change has been committed to a branch and passed CI before any production action.

Agents that cannot satisfy all three conditions must stop, document the blocker in `WORK_LOG.md`, and select a different task.

Stable foundations (do not redesign without the above):
- Node.js 24 / Express 5 runtime
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
- ❌ Access or read production secrets (`SESSION_SECRET`, `ADMIN_PASSWORD`, `API_KEY`, `DATABASE_PATH`, `OPENAI_API_KEY`, `GOOGLE_*`, `RESEND_API_KEY`)
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

Prerequisites: Node and `jq` (`scripts/preflight.sh` runs the `pr-readiness.sh` jq filter and stops with a clear message if `jq` is missing).

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
- `LISTINGS_ROOT`

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
- `LEAD_AUTO_REPLY_ENABLED` (customer auto-reply; must stay unset unless Phil approves in writing)

**Inquiry intake forward to n8n (optional):**
- `INQUIRY_WEBHOOK_URL`
- `INQUIRY_WEBHOOK_SECRET`
- `INQUIRY_BRAND`

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

> **Codex is unavailable as of 2026-11-16.** Use the interim gate in "When Codex is unavailable" at the end of this section.

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

### When Codex is unavailable (interim gate, adopted 2026-11-16)

Phil reported Codex down indefinitely on 2026-11-16 (`DECISIONS.md`, same date; open gate in `PROJECT_STATE.md`). Until Codex is back, its two jobs are split. **The READY conditions above do not change.** Only who checks them changes.

1. **Mechanical verdict (replaces the Codex Verification Response).** Run:

   ```bash
   bash scripts/pr-readiness.sh <pr-number> <expected-head-sha>
   # also check the VPS for an unapproved deploy (needs SSH, closed by default):
   EXPECT_VPS_SHA=<sha> bash scripts/pr-readiness.sh <pr-number> <expected-head-sha>
   ```

   Both SHAs are full 40-character hex SHAs (either case), compared exactly. A missing expected head SHA is a blocking fact. It checks the conditions live against GitHub: PR open and not a draft, head SHA, `mergeable_state` clean, every check run on the head commit completed green, and 0 unresolved non-outdated review threads. It prints `VERDICT: READY / NOT READY` in the format above. Exit codes: 0 READY with everything checked; 1 NOT READY; 2 usage or tooling error; 3 READY on the GitHub conditions only, printed as `VERDICT: READY (GitHub conditions only; see "Not checked:")`. It **fails closed** on every GitHub condition: anything it cannot verify there counts as a blocking fact. Review threads need GraphQL, so run it with an authenticated `gh` or `GITHUB_TOKEN` (Phil's terminal works; the agent sandbox does not, and there it always says NOT READY).
   - **The VPS condition** ("no production deploy unless Phil approved it") is checked only with `EXPECT_VPS_SHA`, because SSH is closed by default. With it set, a mismatch or an unreachable VPS blocks. Without it, the output lists the VPS under **"Not checked:"** (printed right after "Blocking facts:"), never under "Verified:", and the verdict line and exit code 3 say that READY covers the GitHub conditions only. Phil confirms the VPS condition himself before merging (deploys are manual and his).
   - Text that PR authors and commenters control (check-run names, the branch name, review-comment excerpts) is stripped of every control character and every Unicode format/separator character (Cc, Cf, Zl, Zp: bidi marks including U+061C, zero-width, tag characters) before printing; `tests/pr-readiness-clean.test.js` checks this against Node's Unicode tables in preflight, so it cannot redraw the verdict or reorder a line in the terminal or in the posted comment.
   - Anyone may run it, including the implementing agent. The output is evidence of live state, not an opinion. Post the **verbatim** output as a PR comment.
   - It goes stale on any push, new review, or new check run. Re-run it **immediately before merge**. Within a run, it re-reads the PR at the end: if the head, state, draft flag, merge state, base, check runs, commit statuses, reviews, review threads or (with `EXPECT_VPS_SHA`) the VPS SHA moved while it was checking (or the re-read fails), the verdict is NOT READY.
2. **Independent review (replaces Codex's audit).** The implementing agent still may not judge its own PR. Every PR gets a review from a reviewer that did not write it:
   - the review bots that still post (Sourcery; the Codex GitHub review bot when it runs), **and**
   - for any PR that touches `api/`, `scripts/`, `.github/`, `compose.yml`, or governance docs: a fresh Claude Code session with no shared context with the implementer. It reads the diff and posts its findings on the PR as review comments.

   The implementing agent fixes or answers every finding. Threads must reach 0 unresolved, and the script enforces that.
3. **Phil merges** only with a READY output for the current head SHA posted on the PR, the independent review done, and any "Not checked:" line confirmed by him. Merge still ≠ deploy.

When Codex is back: Codex resumes the gatekeeper role and re-verifies any PR merged under this interim gate, then the `PROJECT_STATE.md` gate is closed. The script stays as the mechanical check Codex can run too.

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

---

## Zero-Waste Workflow (MalickLand standard)

Applies on top of every rule above; where two rules conflict, the stricter one wins. Full text with the copy/paste prompts: `AGENTS.md` in `MalickLand/MEDjAi`.

**No answer = no build.** Before writing code, answer with file-path evidence:

1. What is the current truth?
2. What exact outcome are we creating?
3. Which files, services, routes, env vars, databases or deploy configs may be touched?
4. How will we prove it works?
5. Who receives the next handoff?

**Handoff chain:** Claude Code (Truth Lock, read-only) → Gemini (architecture reconciliation, no edits) → Codex (`READY TO BUILD` or `NOT READY — BLOCKERS`) → Phil approves a written scope → Claude Code builds the smallest safe change → Codex post-build `PASS` / `FAIL` → Phil approves deploy → production verification → document.

- A Truth Lock report separates **Confirmed / Assumed / Unknown / Contradicted**. Do not build on an Unknown.
- Deployment defaults to **NO**. Keep the existing architecture unless Phil approves a change. Touch only approved files.
- A task is done only when tests ran, the smoke test passed, nothing unrelated changed, and rollback and next owner are written down.

Every task ends with:

```
Done:
Verified by:
Remaining risk:
Next owner:
Next action:
Approval needed:
```

**MalickLand minimum production smoke test** (after any approved deploy): homepage loads; `/37-advent` loads; `/admin` loads; `GET /api/properties` works; `POST /api/contacts` accepts a test lead and the lead is stored; notification path verified or marked not configured; brokerage disclosure (`WV Real Estate Agency, LLC` · `Broker: Sheila Judy`) visible on every public page; MLS number shown on listing marketing where applicable. Health check is `/api/health`.
