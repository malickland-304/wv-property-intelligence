# Contributing to WV Property Intelligence

This document is for human contributors and AI agents. `AGENTS.md` is the higher-ranked authority: when any guidance here conflicts with `AGENTS.md`, `AGENTS.md` wins. AI agents must read `AGENTS.md` before acting.

---

## Who can contribute

Phil Malick ([@malickland-304](https://github.com/malickland-304)) is the sole maintainer and final approval authority for merges, production deploys, and architecture changes. External contributions are welcome as pull requests; all PRs require passing CI before merge.

---

## Development setup

```bash
cd api
cp .env.example .env   # fill in SESSION_SECRET and ADMIN_PASSWORD at minimum
npm ci
npm run dev            # nodemon server.js — listens on :3001
```

See `README.md` for the full environment variable reference and Docker workflow.

---

## Branch and PR conventions

- **Never push directly to `main`.**
- Branch naming: `feature/<desc>`, `fix/<desc>`, `chore/<desc>`.
- One logical change per branch. Keep scope tight.
- PR title must be concise and descriptive.
- Fill in the PR template completely — all sections are required.
- Reference the related issue: `Closes #N`.

---

## Required validation before opening a PR

Run all steps in order. Per the Verification Truthfulness Rule: only report a step as passing if you actually ran it and saw the output.

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

## Smoke scripts — non-mutation guarantee

Both smoke scripts (`scripts/smoke-prod.sh` and `scripts/preflight.sh`) issue **read-only HTTP GET requests only**. They do not write to the database, upload files, submit forms, mutate session state, or trigger any side-effectful endpoint. The production smoke path is safe to run against a live deployment.

---

## CI / required checks

All PRs must pass these checks before merge:

| Check | Tool |
|-------|------|
| `CodeQL` | GitHub Actions |
| `verify` | Syntax + security test suite |
| `check` | `node --check` |
| `CodeScan` | GitHub Advanced Security |
| `semgrep-cloud-platform/scan` | Semgrep Cloud |

A PR with a failing or queued required check is blocked from merge by branch protection on `main`.

---

## Security

- Do not hardcode secrets, passwords, or tokens.
- Do not modify `package-lock.json` directly — use `npm ci`.
- Do not add new top-level dependencies without explicit maintainer approval.
- Run `npm audit` and resolve any critical or high findings before opening a PR.
- See `SECURITY.md` for the vulnerability reporting policy.

---

## Stale issue and PR policy

| Type | Target age | Action |
|------|-----------|--------|
| Issues | 45 days without activity | Maintainer triages: close if no longer relevant, or update with current context |
| Pull requests | 21 days without activity | Author rebases or closes; maintainer may close if abandoned |

There is no automated stale-bot configured. The maintainer reviews open issues and PRs on a weekly cadence as part of the Monday sprint review. If you have an open PR that has stalled, leave a comment to re-engage review.

---

## Coordination documents

These files are the authoritative source of truth, ranked by precedence:

1. `AGENTS.md` — agent operating rules
2. `SECURITY.md` — security policy
3. `ARCHITECTURE.md` — system design constraints
4. `DECISIONS.md` — recorded technical decisions
5. `TASKS.md` — prioritized backlog
6. `PROJECT_STATE.md` — current completeness

When sources conflict, prefer the safer, more conservative path and document the conflict in `DECISIONS.md`.

---

## After your PR merges

- Append an entry to `WORK_LOG.md` summarizing what changed and why.
- If the change affects production state or deployment notes, update `docs/agent-handoff.md` as a deployment-state reference only; it does not override the canonical coordination documents above.
- Railway deployment (`main` branch) is triggered automatically on merge; only Phil Malick approves production deploys.
