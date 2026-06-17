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

## 2026-06-01 — leads.js mounted with local-safe adapters

**Problem:** `api/routes/leads.js` existed but was unmounted because `services/googleSheets.js` was missing.
**Decision:** Mount `/api/leads` behind JSON and same-origin guards, and add a no-op Google Sheets adapter so local SQLite capture works when sheet credentials are absent.
**Reasoning:** Server stability plus functional lead capture. Optional notification/sheet integrations should fail closed or no-op when credentials/packages are unavailable.
**Pending:** Real Google Sheets append support can be added later without changing the public route contract.
**Files:** `api/server.js`, `api/routes/leads.js`, `api/services/googleSheets.js`

---

## 2026-05-27 — Multi-agent governance roles defined

**Problem:** Multiple AI agents (Claude, Codex, Gemini, ChatGPT, OpenHands) need clear boundaries.
**Decision:** ChatGPT = orchestrator/PM; Claude Code = implementation; Codex = audit plus Phil-authorized scoped implementation; Gemini = architecture challenger (no code in active PRs); OpenHands = supervised worker.
**Reasoning:** Prevents conflicting implementations, ensures human review, preserves security posture.
**Files:** `AGENTS.md`

---

## 2026-06-03 — Codex may implement when explicitly authorized by Phil

**Problem:** The prior Codex audit-only rule blocked small, owner-requested fixes even when Phil explicitly wanted Codex to patch the repo.
**Decision:** Codex may make small, scoped repository edits when Phil explicitly authorizes implementation in the current task. Codex still may not push directly to `main`, deploy, print secrets, alter production secrets, mutate production data, or self-authorize architecture/schema-breaking changes.
**Reasoning:** Keeps the useful safety boundaries while removing unnecessary friction for narrow fixes and review follow-ups.
**Alternatives:** Keep Codex audit-only forever — rejected because it blocks authorized maintenance; grant Codex full autonomy — rejected because deployment, secrets, and architecture changes still need human control.
**Security impact:** Neutral to positive. Production access and irreversible actions remain blocked; authorized implementation can now fix discovered issues without handoff churn.
**Files:** `AGENTS.md`, `DECISIONS.md`, `docs/agent-handoff.md`

---

## 2026-05-31 — GitHub hygiene cleanup and branch-protection policy

**Problem:** GitHub had no open issues/PRs after cleanup, but repository metadata still contained stale remote branches, branch-protection drift, and misleading environment documentation.
**Decision:** Under Phil's direct instruction for a one-time GitHub cleanup, Codex may execute GitHub metadata hygiene for this task only: close stale PRs, delete stale non-`main` remote branches, and update branch protection. This does not grant Codex deploy authority or permission to bypass the scoped-implementation rule.
**Branch protection:** Preserve required status checks (`CodeQL`, `verify`, `check`, `CodeScan`, `semgrep-cloud-platform/scan`) and enable required conversation resolution. Keep required PR reviews and admin enforcement off to avoid solo-maintainer merge bottlenecks.
**Human gate:** Production deployments, production secrets, schema-breaking changes, and publication decisions still require Phil's explicit approval. Disabling required PR reviews does not grant any agent deploy authority.
**Reasoning:** Automated checks plus conversation resolution provide the useful GitHub safety gates without recreating the manual-review bottleneck that previously blocked repository throughput.
**Alternatives:** Required PR reviews/admin enforcement — rejected for now because the repo is operated by a solo maintainer and those settings can block emergency fixes or docs-only cleanup.
**Files:** `TASKS.md`, `PROJECT_STATE.md`, `docs/agent-handoff.md`, `WORK_LOG.md`

---

## 2026-06-10 — Public assistant gets a backend (`POST /api/chat`) instead of removing the widget

**Problem:** The homepage "MalickLand Assistant" chat widget POSTs to `/api/chat`, but no such route existed on `main`, so the button 404'd in production. Two paths: (A) build the backend, or (B) remove/hide the widget.
**Decision:** Build the backend (option A). Add a public, per-IP rate-limited, same-origin `POST /api/chat` that reuses the gateway-aware AI plumbing from PR #90 (`resolveAiProvider` + the generalized `requestChat`, surfaced as `generateChatReply`). It routes through the Vercel AI Gateway when `AI_GATEWAY_API_KEY` is set (model `openai/gpt-5.4`, failover `anthropic/claude-haiku-4.5`) and falls back to direct OpenAI otherwise.
**Reasoning:** The widget is a complete, polished frontend (greeting → Q&A → lead handoff → analytics), and the gateway plumbing was merged specifically to be reused — the backend was the known follow-up to PR #90. Removing a finished feature is the wasteful path. The route is safe-by-default (graceful fallback when no AI key) so it cannot break the Railway auto-deploy.
**Brokerage-safety:** A strict server-injected system prompt forbids ROI/appreciation/legal/tax/financing claims and inventing listings/prices; valuations are routed to a CMA from Phil. The client cannot override it — `sanitizeChatMessages()` strips any client-supplied `system` role. This aligns with the WV first-screen disclosure posture and mirrors `buildPrompt` in `ai-generator.js`.
**Cost control:** Per-IP rate limit (15/min), trimmed history (≤10 turns / ≤6000 chars), capped output (~500 tokens). The endpoint is a no-op cost-wise until `AI_GATEWAY_API_KEY` is set in Railway.
**Alternatives considered:** (B) remove the widget — rejected; throws away finished UX and the planned feature. Giving the model live DB/listing context — deferred to a follow-up to keep this change conservative and avoid fabrication risk.
**Security impact:** Neutral-to-positive — new public endpoint, but defended in depth (same-origin + JSON guards reused from the lead routes, rate limit, prompt-injection stripping, server-controlled prompt, bounded I/O). No new dependencies.
**Files:** `api/ai-generator.js`, `api/utils/chatAssistant.js`, `api/routes/chat.js`, `api/middleware/rate-limits.js`, `api/server.js`, `scripts/preflight.sh`, `tests/chat-assistant.test.js`, `api/.env.example`

---

## 2026-06-17 — Production migrated from Railway to Hostinger VPS (Docker + Traefik); deploy is manual

**Problem:** The live site needed a consolidated, owner-controlled host alongside Phil's other services (OpenClaw, BloFin bots). Meanwhile the repo docs still described Railway as production with auto-deploy on merge, which misleads agents into assuming a merge ships to production.
**Decision:** Production runs as a Docker container (`wv-property-intelligence:vps`, built from `api/Dockerfile`) on Phil's Hostinger VPS `srv1716268` (`31.97.58.203`), behind **Traefik** + Let's Encrypt. Apex DNS A → `31.97.58.203` (Cloudflare is DNS-only, not proxying/terminating TLS). Deploy is **manual**: SSH to the VPS, `git -C /docker/wv-property-intelligence/src fetch && checkout <sha>`, then `docker compose build && docker compose up -d`. There is **no** auto-deploy on merge (no webhook, no CI deploy step, no watchtower). Data persists on the Docker named volume `wv-property-intelligence_wv-data` (`/data`, `DATABASE_PATH=/data/wv_property.db`); secrets in `/docker/wv-property-intelligence/.env`.
**Reasoning:** Single owner-controlled box co-located with Phil's other infra, no platform lock-in; the manual deploy keeps an explicit human gate on production for a solo-maintainer site.
**Alternatives considered:** Stay on Railway — rejected (consolidation + coupling); add auto-deploy on the VPS (watchtower/CI) — deferred, manual deploy preferred for now as the human gate.
**Migration impact / rollback:** The Railway service (`alert-laughter` / `wv-property-intelligence`) is no longer the live target (DNS bypasses it) and is on **standby** as the rollback path pending a decommission decision. `railway.json` and the legacy GitHub deployment environments are retained only for that twin.
**Verification (2026-06-17, live):** `GET https://malickland.net/api/health` → 200 served by `31.97.58.203`; container `wv-property-intelligence` healthy; VPS `src` HEAD == `origin/main` (`b9d1198`); Traefik routers `Host(malickland.net) || Host(www.malickland.net)` → container `:3000`.
**Files:** `README.md`, `ARCHITECTURE.md`, `CONTEXT.md`, `PROJECT_STATE.md`, `QA_CHECKLIST.md`, `SECURITY.md`, `CONTRIBUTING.md`, `AGENTS.md`, `docs/CANONICAL_MAP.md`, `docs/agent-handoff.md`, `TASKS.md`
