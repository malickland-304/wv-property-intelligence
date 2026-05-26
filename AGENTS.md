# AGENTS.md — AI Agent Operating Manual
# MalickLand / wv-property-intelligence

> **All AI agents must read this file before acting on this repository.**
> Canonical source-of-truth order: `docs/agent-handoff.md` > this file > all other docs.

---

## Source-of-Truth Hierarchy

```
1. docs/agent-handoff.md   — current production state, open work, recent changes
2. AGENTS.md               — agent roles, rules, workflow
3. .openhands/instructions.md — OpenHands-specific behavioral rules
4. GitHub Issues / PRs     — task-level context (temporary)
```

When sources conflict, higher numbers lose.

---

## Agent Roles

| Agent | Role | Allowed | Forbidden |
|-------|------|---------|-----------|
| **ChatGPT** | Orchestrator / PM | Task definition, routing, QC adjudication, architecture decisions | — |
| **Claude Code** | Implementation | Branch work, code changes, PRs, repo bootstrap | Direct main push, deploy, printing secrets |
| **Codex** | QA / Security Audit | Code review, security skepticism, CI forensics, readiness verdicts | Any repo mutation, commits, deploys |
| **Gemini** | Architecture Challenger | Architecture critique, threat modeling, vendor analysis | Touching code in active PRs |
| **OpenHands** | Supervised Worker | Sandboxed implementation, branch edits, opening PRs | See restrictions below |

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
- ❌ Access or read production secrets (`SESSION_SECRET`, `ADMIN_PASSWORD`, `API_KEY`, `DATABASE_PATH`, `OPENAI_API_KEY`, `GOOGLE_*`)
- ❌ Push directly to `main`
- ❌ Modify Railway environment variables
- ❌ Run smoke tests against production (`malickland.net`) without explicit human approval
- ❌ Mutate production database
- ❌ Print or log any secret values

### Hard Limits
- Max iterations per run: **10**
- Max runtime per run: **30 minutes**
- Failure mode: **fail closed** (stop and report, do not continue)
- Sandbox must contain NO production credentials — GitHub repo access only

---

## Workflow (Standard Feature)

```
1. ChatGPT defines task → GitHub Issue (AI Task template)
2. OpenHands or Claude implements → feature branch
3. Codex audits PR → findings returned to ChatGPT
4. Gemini challenges (if architecture/security significant)
5. ChatGPT adjudicates any conflicts
6. Human approves → merge
7. Human approves → Railway deploy
8. Claude or Codex verifies smoke
```

No step may be skipped. No agent may self-authorize a step above their role.

---

## Pull Request Rules (All Agents)

- **Never push directly to `main`**
- One logical change per branch
- Branch naming: `feature/<desc>`, `fix/<desc>`, `chore/<desc>`
- PR must include: what changed, why, how to validate
- PR must reference the issue: `Closes #N`
- All required CI checks must pass before merge

---

## Merge Decision Policy

**No merge if:**
- Claude says "works" but Codex says "unsafe"
- Gemini flags an architectural flaw
- Any required CI check is failing
- A security alert is unresolved (not dismissed with documented rationale)

Conflicts are adjudicated by ChatGPT (human orchestrator). Agents do not self-adjudicate.

---

## Dependency Hygiene Policy (Non-Negotiable)

- **Always use `npm ci`**, never `npm install` in agent context
  - `npm ci` is deterministic: installs exactly what's in `package-lock.json`
  - `npm install` can silently update or resolve packages differently across environments
- **Never add top-level dependencies** without explicit human approval
- **Never run `npm install <package>`** without approval — propose it in a PR comment instead
- **Lockfile is canonical** — never delete or modify `package-lock.json` directly
- Rationale: arbitrary dependency additions are a supply-chain attack vector; lockfile enforcement is the first defense

---

## Required Validation Before Any PR

Run in order. All must pass.

```bash
cd api && npm ci
node --check server.js
node --check middleware/auth.js
node --check routes/admin.js
cd ..
bash scripts/preflight.sh
```

---

## CI / Security Gates (Required — No Merge Without)

| Gate | Tool | Owner |
|------|------|-------|
| Preflight (start server, hit endpoints) | `scripts/preflight.sh` | Claude + Codex |
| Syntax check | `node --check` | Claude |
| Dependency audit | `npm audit` | Codex |
| CodeQL security scan | GitHub Actions | Automated |
| Secret scanning | GitHub Advanced Security | Automated |
| Semgrep | Semgrep cloud | Automated |

### Recommended Additions (not yet active)
- Trufflehog for git-history secret scanning
- Dependency review on every PR
- Required reviewer (human or Codex) before merge

---

## Git Safety Rules

```bash
# Always check before staging
git status --short --untracked-files

# Stage only specific files — never git add -A or git add .
git add <specific-file> [<specific-file>...]

# Verify staged diff before committing
git diff --cached
```

---

## Production Safety Gates (Pre-Deploy)

Before any production deployment:
- [ ] All required CI checks green
- [ ] Smoke test passed locally or in staging
- [ ] Rollback plan exists (prior Railway deployment ID noted)
- [ ] No new secrets introduced in code
- [ ] Human explicitly approved deploy

---

## Environment Variables (Never Touch in Code)

Set in Railway. Do not hardcode, echo, print, or modify:
- `SESSION_SECRET`
- `ADMIN_PASSWORD`
- `API_KEY`
- `DATABASE_PATH`
- `OPENAI_API_KEY`
- `GOOGLE_*` variables

---

## When to Stop and Report

Any agent must stop immediately and report to ChatGPT if:
- Test failure cannot be explained
- Security issue found outside task scope
- About to touch production secrets
- Action is irreversible and uncertain
- Task requires more than 5 files changed (flag for scope review)
- OpenHands iteration limit (10) is reached before task completion

---

## GitHub Task Memory (Temporary)

GitHub Issues are the current task memory system. This is temporary.

**Linear** is planned as canonical task memory. Until then:
- Use GitHub Issues with the provided templates
- Keep issues scoped (one task = one issue)
- Do not use GitHub comments as long-term architectural decisions — promote to `docs/agent-handoff.md` if a decision is permanent

---

## Stale Documentation

The following files are **historical only** and should not be used to infer current system state:

- `PROJECT.md` — superseded by `docs/agent-handoff.md`
- `SECURITY_VERIFICATION.md` — historical audit report from 2026-04-05; does not reflect current state
- `CONTEXT.md` — may contain outdated architectural assumptions; verify against current code before relying on it
