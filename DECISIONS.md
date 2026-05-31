# DECISIONS.md — Malickland 2.0 Technical Decisions
> Record important decisions here so agents don't re-litigate them.
> Format: Date | Problem | Decision | Reasoning | Alternatives | Impact | Files

---

## 2026-05-27 — csurf replaced with csrf-csrf

**Problem:** `csurf` is deprecated and flagged by npm audit.
**Decision:** Replace with `csrf-csrf@^3.2.2` (double-submit cookie pattern).
**Reasoning:** Active maintenance, correct for Express 5, session-bound via `req.sessionID`.
**Alternatives considered:** `lusca`, `tiny-csrf` — less maintained.
**Security impact:** Positive — eliminates deprecated dep, maintains CSRF protection.
**Files:** `api/middleware/csrf.js`, `api/server.js`
**Notes:** CodeQL false-positive (`js/missing-token-validation`) suppressed in `.github/codeql/codeql-config.yml` because csrf-csrf is not yet in CodeQL's recognized library list. Tracked in Issue #65.

---

## 2026-05-27 — OpenHands operates supervised-only, permanent

**Problem:** AI coding agent could cause irreversible harm if autonomous.
**Decision:** OpenHands is permanently sandboxed: no merge authority, no Railway/production access, no production secrets, max 10 iterations/30 min, fail closed.
**Reasoning:** Defense in depth; human review gate is non-negotiable for deploy.
**Alternatives:** Full autonomy — rejected on security/safety grounds.
**Security impact:** Eliminates autonomous deploy risk.
**Files:** `AGENTS.md`, `.openhands/instructions.md`, `.openhands/hooks/pre-tool-use.sh`

---

## 2026-05-27 — npm ci mandatory in agent context

**Problem:** `npm install` can silently resolve packages differently, enabling supply-chain drift.
**Decision:** All agents must use `npm ci`; never `npm install` in agent context. New top-level deps require explicit human approval.
**Reasoning:** Lockfile determinism; supply-chain attack surface reduction.
**Files:** `AGENTS.md`, `.openhands/setup.sh`, `.openhands/hooks/pre-tool-use.sh`

---

## 2026-05-27 — googleapis SDK not used; raw HTTPS instead

**Problem:** `googleapis` npm package adds significant dep weight and OAuth complexity.
**Decision:** `api/google.js` uses Node's built-in `https` module directly for all Google API calls (Gmail, Drive).
**Reasoning:** Fewer deps, smaller attack surface, sufficient for current usage.
**Files:** `api/google.js`

---

## 2026-05-27 — SQLite for primary datastore (not PostgreSQL)

**Problem:** Datastore selection for a single-server low-traffic real estate site.
**Decision:** SQLite via `better-sqlite3`. No PostgreSQL migration planned until Phase 1+ requires it.
**Reasoning:** Zero infrastructure overhead, synchronous API (simpler code), adequate for current scale, Railway-compatible with persistent volume.
**Alternatives:** PostgreSQL (Neon, Railway Postgres) — planned for Phase 1+ if concurrent writes become bottleneck.
**Files:** `api/db.js`, `database/schema.sql`

---

## 2026-05-27 — leads.js NOT mounted (pending decision)

**Problem:** `api/routes/leads.js` exists but requires missing `services/googleSheets.js` and the `twilio` package (not in package.json). Mounting it would crash the server.
**Decision (interim):** Keep unmounted. Do not mount until: (A) missing deps are implemented, OR (B) the file is deleted.
**Reasoning:** Server stability. The missing `googleSheets.js` suggests the service was planned but not built.
**Pending:** ChatGPT to decide: implement leads feature (requires googleSheets.js + twilio) or delete leads.js.
**Files:** `api/routes/leads.js`, `api/services/` (missing `googleSheets.js`)

---

## 2026-05-27 — Multi-agent governance roles defined

**Problem:** Multiple AI agents (Claude, Codex, Gemini, ChatGPT, OpenHands) need clear boundaries.
**Decision:** ChatGPT = orchestrator/PM; Claude Code = implementation; Codex = audit-only (no mutations); Gemini = architecture challenger (no code in active PRs); OpenHands = supervised worker.
**Reasoning:** Prevents conflicting implementations, ensures human review, preserves security posture.
**Files:** `AGENTS.md`

---

## 2026-05-31 — GitHub hygiene cleanup and branch-protection policy

**Problem:** GitHub had no open issues/PRs after cleanup, but repository metadata still contained stale remote branches, branch-protection drift, and misleading environment documentation.
**Decision:** Under Phil's direct instruction for a one-time GitHub cleanup, Codex may execute GitHub metadata hygiene for this task only: close stale PRs, delete stale non-`main` remote branches, and update branch protection. This is not a standing change to the Codex audit-only role.
**Branch protection:** Preserve required status checks (`CodeQL`, `verify`, `check`, `CodeScan`, `semgrep-cloud-platform/scan`) and enable required conversation resolution. Keep required PR reviews and admin enforcement off to avoid solo-maintainer merge bottlenecks.
**Human gate:** Production deployments, production secrets, schema-breaking changes, and publication decisions still require Phil's explicit approval. Disabling required PR reviews does not grant any agent deploy authority.
**Reasoning:** Automated checks plus conversation resolution provide the useful GitHub safety gates without recreating the manual-review bottleneck that previously blocked repository throughput.
**Alternatives:** Required PR reviews/admin enforcement — rejected for now because the repo is operated by a solo maintainer and those settings can block emergency fixes or docs-only cleanup.
**Files:** `TASKS.md`, `PROJECT_STATE.md`, `docs/agent-handoff.md`, `WORK_LOG.md`
