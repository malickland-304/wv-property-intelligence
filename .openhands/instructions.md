# OpenHands Agent Instructions — wv-property-intelligence

> Read this file before taking any action in this repository.

---

## Identity and Scope

This is a production Node/Express application serving MalickLand.net — a live WV real estate site with real listings and real leads. Actions taken here have real consequences.

You are an engineering agent. Your job is to implement specific, scoped tasks safely and correctly — not to explore, refactor broadly, or make autonomous architectural decisions.

---

## Before Acting — Always Do This

```bash
# Verify your actual context
git status --short --branch --untracked-files
git rev-parse HEAD
cat docs/agent-handoff.md
```

`docs/agent-handoff.md` is the canonical source of truth for production state, open work, and operational guardrails. If it contradicts anything else you know, trust the handoff doc and flag the conflict.

---

## Workflow Rules (Non-Negotiable)

### Branching
- **Never push directly to `main`**
- All changes go through a feature branch + PR
- Branch naming: `feature/<short-description>`, `fix/<short-description>`, `chore/<short-description>`
- One logical change per branch

### Pull Requests
- Open a PR for every change, no matter how small
- PR title must be descriptive and accurate
- PR body must explain: what changed, why, and how to validate
- Tag the relevant GitHub issue with `Closes #N` when applicable

### Validation Before PR
Run in order:
```bash
cd api && npm ci
node --check server.js
node --check middleware/auth.js
node --check routes/admin.js
cd ..
bash scripts/preflight.sh
```
All must pass before opening a PR.

### Commit Messages
Follow the format: `type(scope): description`
Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`

---

## Hard Stops — Do Not Cross

| Action | Rule |
|--------|------|
| Push to `main` | ❌ Never — PR only |
| Deploy to Railway | ❌ Never without explicit user approval |
| Modify Railway environment variables | ❌ Never |
| Print or log `SESSION_SECRET`, `ADMIN_PASSWORD`, API keys | ❌ Never |
| Run `smoke-admin.sh` against production without approval | ❌ Never |
| Mutate production data during any test | ❌ Never |
| Commit `.env` files or secrets | ❌ Never |
| Commit unrelated untracked files | ❌ Never — always `git status` before staging |
| Broad refactors outside task scope | ❌ Never |

---

## Production Architecture (Do Not Break)

- **Runtime:** Node.js + Express 5, SQLite (`better-sqlite3`)
- **Deploy:** Railway via Dockerfile — `main` branch auto-deploys
- **CSRF:** `csrf-csrf@3.2.2` (double-submit cookie), session-bound via `req.sessionID`
- **Session:** `express-session` + `better-sqlite3-session-store`
- **Auth:** Admin password via `ADMIN_PASSWORD` env var + session cookie
- **CI Gate:** `.github/workflows/preflight.yml` runs `scripts/preflight.sh` on every PR and push to `main`
- **Smoke:** `scripts/smoke-admin.sh` — authenticated CSRF round-trip (run against Railway after merge, not during CI)

---

## Environment Variables (Never Touch in Code)

These are set in Railway. Do not hardcode, echo, or modify:
- `SESSION_SECRET`
- `ADMIN_PASSWORD`
- `API_KEY`
- `DATABASE_PATH`
- `OPENAI_API_KEY`
- `GOOGLE_*` variables

---

## Validation Commands Reference

```bash
# Dependency check
cd api && npm ls express better-sqlite3 csrf-csrf

# Syntax check
node --check api/server.js

# Full preflight gate (starts server, hits endpoints)
bash scripts/preflight.sh

# Authenticated smoke (requires ADMIN_PASSWORD, Railway target)
ADMIN_PASSWORD=<pw> BASE_URL=https://malickland.net ./scripts/smoke-admin.sh

# Audit
cd api && npm audit
```

---

## Scoping Rules

- Implement exactly what the task/issue specifies
- Do not refactor code outside the task scope
- Do not update unrelated dependencies
- If you discover a related issue, create a GitHub issue for it — do not fix it in the same PR
- If you are uncertain about scope, stop and ask

---

## Git Safety

```bash
# Always check before staging
git status --short --untracked-files

# Stage only specific files — never git add -A or git add .
git add <specific-file> [<specific-file>...]

# Verify staged diff before committing
git diff --cached
```

---

## When to Stop and Report

Stop immediately and report if:
- You encounter a test failure you cannot explain
- You find a security issue outside task scope
- You are about to touch production secrets
- You are unsure whether an action is reversible
- The task requires more than 5 files changed (flag for scope review)
