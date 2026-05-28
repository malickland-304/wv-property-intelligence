# PROJECT_STATE.md — Malickland 2.0
> Last verified: 2026-05-27 | Verified by: Claude Code audit
> This file covers current product completeness and known gaps. For production deployment state, see `docs/agent-handoff.md` (deployment-state reference only — not authoritative per AGENTS.md).

---

## Production Health (2026-05-27)

| Item | Status |
|------|--------|
| Live URL | https://malickland.net |
| Railway deploy | ✅ HEAD `a312aa6` (PR #68 merged) |
| npm audit | ✅ 0 vulnerabilities |
| Smoke test (7/7) | ✅ PASSED 2026-05-27 |
| CI gates | ✅ CodeQL, Semgrep, preflight.yml |
| Branch protection | ✅ hardened |
| Local repo branch | ⚠️ `fix/hook-npm-save-patterns` — stale, superseded by PR #68; switch to `main` before new work |

---

## Technology Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 20 / Express 5 |
| Database | SQLite via `better-sqlite3` |
| Frontend | Vanilla HTML/JS/CSS (no build step) |
| Auth | `express-session` (admin) + Bearer API key (REST) |
| CSRF | `csrf-csrf` v3 (double-submit cookie) |
| Email | Resend (primary) or Gmail OAuth (fallback) — `api/services/email.js` |
| SMS | Twilio — `api/services/twilioService.js` (twilio pkg NOT in package.json — feature disabled) |
| AI | OpenAI GPT-4o via HTTPS — `api/ai-generator.js` |
| Google | Drive + Gmail via `api/google.js` (raw HTTPS, no googleapis SDK) |
| Deploy | Railway + Docker (`api/Dockerfile`), branch `main` auto-deploys |

---

## Implemented Functionality

- ✅ Public listing search (`/`, `/api/properties`)
- ✅ Individual property pages (`/listing/:slug`, `/properties/:slug`)
- ✅ Admin panel: listing CRUD, photo uploads (with sharp compression), due-diligence notes
- ✅ AI marketing content generation (GPT-4o, per-listing)
- ✅ Google Drive photo backup
- ✅ Gmail contact notification
- ✅ Sitemap + robots.txt
- ✅ Rate limiting on all public endpoints
- ✅ CSRF protection on all admin mutating routes
- ✅ Session-based admin auth
- ✅ REST API with Bearer API-key auth

---

## Incomplete / Broken

### 🔴 CRITICAL — Leads system non-functional
- `api/routes/leads.js` is **NOT mounted** in `server.js`
- `leads.js` requires `../services/googleSheets` — **file does not exist**
- `leads.js` requires `twilio` package — **not in package.json**
- If mounted as-is, the server would crash on startup
- Decision needed: implement missing deps, or delete/stub `leads.js`

### 🟢 Test suite fixed (PR #73, not yet merged to main)
- `tests/verify-security-fixes.test.js` was rewritten on branch `chore/governance-overhaul-2026-05-27`
- Tests updated to check actual code locations: `routes/api.js`, `routes/admin.js`, `helpers.js`
- Suite passes 42/42 on the PR branch; fix pending merge to `main` via PR #73
- On `main` before PR #73 merges: test suite still reflects pre-fix state

### 🟡 MEDIUM — Services layer undocumented
- `api/services/email.js` (Resend/Gmail), `twilioService.js`, `leadFollowupWorker.js` exist but are undocumented in `AGENTS.md` env vars and `docs/agent-handoff.md`
- New env vars: `RESEND_API_KEY`, `FROM_EMAIL`, `NOTIFICATION_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `LEAD_ALERT_TO_NUMBER`

### 🟡 MEDIUM — 73 stale remote branches
- Many `copilot/*` and old `claude/*` branches — safe to delete
- Adds noise to branch listings

### 🟢 LOW — OpenHands runtime not activated
- All governance controls in place
- Blocked on: provision fine-grained GitHub token + start executor
- First task: Issue #66 (already fixed on main — pick a new first task)

---

## Known Bugs

| Bug | Severity | Notes |
|-----|----------|-------|
| leads.js missing deps | High | Not mounted, would crash if mounted |
| Test suite wrong-file bug | Fixed (PR #73) | Tests updated to check routes/; fix pending merge to main |

---

## Security Notes

- No critical security issues in production code
- CORS: `cors()` without origin restriction — acceptable for public listing API; review if private data ever exposed
- `twilio` dynamically required in twilioService.js — fail-graceful (returns null), but package not installed

---

## Architecture Notes

- Routes: `server.js` → `routes/admin.js` (624 LOC), `routes/api.js` (227 LOC), `routes/public.js` (94 LOC)
- `routes/leads.js` (202 LOC) exists but unmounted
- Services: `email.js`, `twilioService.js`, `leadFollowupWorker.js`, `leadNotifications.js`
- Utils: `validators.js`, `propertyMarketing.js`, `sqliteSessionStore.js`
- DB: `db.js` (291 LOC) — SQLite with migrations, county seed, leads/followup tables present
- CSRF polyfill: `req.csrfToken = () => generateToken(req, res)` patched in server.js before admin routes

---

## Product Roadmap (approved, per AGENTS.md / docs/agent-handoff.md)

- **Phase 0** (current): OpenHands executor validation
- **Phase 1**: Document Registry skeleton (SQLite tables: documents, document_versions, audit_events, integration_events) — spec from ChatGPT required first
- **Phase 2**: AI Review Queue (extracted_claims, approval workflow)
- **Phase 3**: Drive event automation (push notifications)
- **Phase 4**: Gmail intake (Pub/Sub, mailbox watch)
