# PROJECT_STATE.md — Malickland 2.0

> **Last verified:** 2026-05-31 (canonical branch `main` @ `b34e2fb`; PR #77 merged after PR #76)
> **Authority:** Product completeness and repo workspace truth. Use `docs/CANONICAL_MAP.md` for repo/domain/stack disambiguation. Deployment runbooks and guardrails remain in `docs/agent-handoff.md`.

---

## Canonical workspace (use only this)

| Item | Value |
|------|--------|
| **Active repo** | `/Users/yhyh7/Projects/wv-property-intelligence` |
| **Remote** | `https://github.com/malickland-304/wv-property-intelligence.git` |
| **Production branch** | `origin/main` @ `b34e2fb` (PR #77 merged 2026-05-31) |
| **Last merged PR** | #77 Cursor workspace guardrails — merged into `main` after #76 |

PR #76 is merged and live; PR #77 is merged on top. Compare future work against `origin/main`, not a stale local `main`.

### Do not use as source of truth

| Path | Why |
|------|-----|
| `/Users/yhyh7/Documents/GitHub/wv-property-intelligence` | Stale clone (~33 commits behind when last checked) |
| `/Users/yhyh7/Documents/Documents - Philip's MacBook Pro - 4/GitHub/malickland.net` | Separate dirty **Next.js** site — not this stack |
| `/Users/yhyh7/Projects/wv-realestate` | Empty / dead |

Local `main` checkout may lag `origin/main`; always `git fetch origin` and compare to `origin/main`, not an old local `main`.

---

## GitHub / PR status (2026-05-31)

Open GitHub issues: **0**. Open pull requests: **0** after cleanup on 2026-05-31.

| PR | Status |
|----|--------|
| **#60** (old consolidation PR) | Closed 2026-05-31 as stale/unsafe to merge; branch deleted |
| **#70** (npm hook blocker) | Closed 2026-05-31 as superseded by current `main`; branch deleted |
| **#71** (CodeQL suppression narrowing) | Closed 2026-05-31 as not viable; linked Issue #65 is closed and PR failed CodeQL; branch deleted |
| **#73** (governance / test-suite overhaul) | ✅ Merged to `main` (governance commits on `origin/main`, e.g. `f8604f0`, `24399fb`) |
| **#75** (notification observability) | ✅ Merged — `7eb8b1e` on `origin/main` |
| **#76** (public navigation links fix) | ✅ Merged — `dc8cc53` on `origin/main` (2026-05-31); production smoke passed |
| **#77** (Cursor workspace guardrails) | ✅ Merged — `b34e2fb` on `origin/main` (2026-05-31) |
| **#78** (post-PR76 docs refresh) | ✅ Merged — `0908cd4` on `origin/main` (2026-05-31) |

---

## Production health

| Item | Status |
|------|--------|
| Live URL | https://malickland.net |
| Railway deploy / live smoke | ✅ Live read-only smoke passed 2026-05-31 after PR #76: `/api/health`, `/listings`, `/37-advent`, legacy Advent redirect |
| Health endpoint | **`GET /api/health`** — not `/health` (mounted in `api/routes/api.js`) |
| npm audit | ✅ 0 vulnerabilities (verified on fix branch 2026-05-31) |
| Security test suite | ✅ **48/48** on `fix/public-navigation-links` (`node tests/verify-security-fixes.test.js`) |
| Preflight + route smoke | ✅ Passed on fix branch per session validation (2026-05-31) |
| CI gates | ✅ CodeQL, Semgrep, `preflight.yml` |
| Branch protection | Required status checks enabled (`CodeQL`, `verify`, `check`, `CodeScan`, `semgrep-cloud-platform/scan`); required conversation resolution enabled; PR review protection and admin enforcement intentionally off per `DECISIONS.md` 2026-05-31 |
| GitHub security queues | ✅ Open code-scanning alerts: 0; Dependabot alerts: 0; secret-scanning alerts: 0 (2026-05-31 API audit) |
| Remote branches | ✅ Only protected `main` remains on `origin` after stale branch cleanup (2026-05-31) |
| GitHub environments | Railway deployment statuses use `alert-laughter / production`; `production` and `copilot` environments exist but are not deployment-gating for Railway |

---

## Stack truth (not Next.js / not Supabase)

| Layer | Choice |
|-------|--------|
| **This repo** | Node.js 20 / **Express 5** monolith, **SQLite** (`better-sqlite3`), **vanilla HTML** in `app/` (no frontend build) |
| **Deploy** | **Railway** + Docker (`api/Dockerfile`), `main` auto-deploys |
| **Not this product** | The separate **malickland.net Next.js** tree under Documents — different codebase; do not conflate env or deploy |
| **Not used** | **Supabase**, PostgreSQL, Vercel app router, etc. |

---

## Navigation fix (PR #76, merged into `main` @ `dc8cc53`)

| Change | Location |
|--------|----------|
| Implicit `.html` for static pages | `api/server.js` — `express.static(..., { extensions: ['html'] })` so `/37-advent` serves `app/37-advent.html` |
| Legacy URL redirect | `api/routes/public.js` — `301` `/advent-drive-land-hampshire-county-wv` → `/37-advent` |
| Site links | `app/index.html` → `/37-advent`; page file `app/37-advent.html` |

**Validation (2026-05-31, pre-merge on `fix/public-navigation-links`):** `npm ci`, `node --check` (server + routes), **48/48** security tests, `scripts/preflight.sh`, route smoke — all passed.

Merged into `main` @ `dc8cc53` via PR #76; live read-only production smoke passed 2026-05-31.

---

## Technology stack

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

## Implemented functionality

- ✅ Public listing search (`/`, `/api/properties`)
- ✅ Individual property pages (`/listing/:slug`, `/properties/:slug`)
- ✅ 37 Advent landing (`/37-advent`, redirect from legacy slug — merged to `main` via PR #76)
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

## Incomplete / broken

### 🔴 CRITICAL — Leads system non-functional

- `api/routes/leads.js` is **NOT mounted** in `server.js`
- `leads.js` requires `../services/googleSheets` — **file does not exist**
- `leads.js` requires `twilio` package — **not in package.json**
- If mounted as-is, the server would crash on startup
- Decision needed: implement missing deps, or delete/stub `leads.js`

### 🟢 Test suite — fixed on `main` (PR #73 governance merge)

- `tests/verify-security-fixes.test.js` checks `routes/api.js`, `routes/admin.js`, `helpers.js`
- **48/48** passing on `fix/public-navigation-links` (2026-05-31)
- Do not report pre-merge or wrong-file test state

### 🟡 MEDIUM — Services layer undocumented

- `api/services/email.js` (Resend/Gmail), `twilioService.js`, `leadFollowupWorker.js` exist but are thinly documented in env-var lists
- Env vars: `RESEND_API_KEY`, `FROM_EMAIL`, `NOTIFICATION_EMAIL`, `TWILIO_*`, `LEAD_ALERT_TO_NUMBER` — see `AGENTS.md`

### 🟢 LOW — OpenHands runtime not activated

- Governance controls in place on `main`
- Blocked on: fine-grained GitHub token + executor start

---

## Known bugs

| Bug | Severity | Notes |
|-----|----------|-------|
| leads.js missing deps | High | Not mounted; would crash if mounted |
| Stale or wrong Cursor workspace | Ops | Cursor sessions have used `openclaw-system` and stale Documents/GitHub checkouts; reopen Cursor at `/Users/yhyh7/Projects/wv-property-intelligence` and verify `workspace_roots` before production work |

---

## Security notes

- No critical security issues identified in recent validation pass
- CORS: `cors()` without origin restriction — acceptable for public listing API; review if private data exposed
- `twilio` dynamically required in `twilioService.js` — fail-graceful; package not installed

---

## Architecture notes

- Routes: `server.js` → `routes/admin.js`, `routes/api.js` (`/api/health`), `routes/public.js`
- `routes/leads.js` exists but unmounted
- Services: `email.js`, `twilioService.js`, `leadFollowupWorker.js`, `leadNotifications.js`
- Utils: `validators.js`, `propertyMarketing.js`, `sqliteSessionStore.js`
- DB: `db.js` — SQLite with migrations
- CSRF: `req.csrfToken = () => generateToken(req, res)` polyfill before admin routes

---

## Product roadmap (approved, per AGENTS.md)

- **Phase 0** (current): OpenHands executor validation
- **Phase 1**: Document Registry skeleton (SQLite tables) — spec required first
- **Phase 2**: AI Review Queue
- **Phase 3**: Drive event automation
- **Phase 4**: Gmail intake (Pub/Sub)
