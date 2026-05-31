# PROJECT_STATE.md — Malickland 2.0

> **Last verified:** 2026-05-31 (canonical repo `fix/public-navigation-links`, `git fetch origin`)
> **Authority:** Product completeness and repo workspace truth. Use `docs/CANONICAL_MAP.md` for repo/domain/stack disambiguation. Deployment runbooks and guardrails remain in `docs/agent-handoff.md`.

---

## Canonical workspace (use only this)

| Item | Value |
|------|--------|
| **Active repo** | `/Users/yhyh7/Projects/wv-property-intelligence` |
| **Remote** | `https://github.com/malickland-304/wv-property-intelligence.git` |
| **Production branch** | `origin/main` @ `2c4b71e` (2026-05-31 fetch) |
| **In-progress branch** | `fix/public-navigation-links` — pushed as PR #76 |
| **Ahead of `origin/main`** | Public navigation repair plus repository-state documentation refresh |

The fix branch has been rebased onto current `origin/main`; compare future work against `origin/main`, not stale local `main`.

### Do not use as source of truth

| Path | Why |
|------|-----|
| `/Users/yhyh7/Documents/GitHub/wv-property-intelligence` | Stale clone (~33 commits behind when last checked) |
| `/Users/yhyh7/Documents/Documents - Philip's MacBook Pro - 4/GitHub/malickland.net` | Separate dirty **Next.js** site — not this stack |
| `/Users/yhyh7/Projects/wv-realestate` | Empty / dead |

Local `main` checkout may lag `origin/main`; always `git fetch origin` and compare to `origin/main`, not an old local `main`.

---

## GitHub / PR status (2026-05-31)

| PR | Status |
|----|--------|
| **#73** (governance / test-suite overhaul) | ✅ Merged to `main` (governance commits on `origin/main`, e.g. `f8604f0`, `24399fb`) |
| **#75** (notification observability) | ✅ Merged — `7eb8b1e` on `origin/main` |
| **Navigation fix** | ⏳ PR #76 open; waiting for GitHub checks, review/approval, merge, Railway deploy, and production smoke |

---

## Production health

| Item | Status |
|------|--------|
| Live URL | https://malickland.net |
| Railway deploy | Not verified in this 2026-05-31 local refresh; verify Railway before claiming production state |
| Health endpoint | **`GET /api/health`** — not `/health` (mounted in `api/routes/api.js`) |
| npm audit | ✅ 0 vulnerabilities (verified on fix branch 2026-05-31) |
| Security test suite | ✅ **48/48** on `fix/public-navigation-links` (`node tests/verify-security-fixes.test.js`) |
| Preflight + route smoke | ✅ Passed on fix branch per session validation (2026-05-31) |
| CI gates | ✅ CodeQL, Semgrep, `preflight.yml` |
| Branch protection | ✅ hardened |

---

## Stack truth (not Next.js / not Supabase)

| Layer | Choice |
|-------|--------|
| **This repo** | Node.js 20 / **Express 5** monolith, **SQLite** (`better-sqlite3`), **vanilla HTML** in `app/` (no frontend build) |
| **Deploy** | **Railway** + Docker (`api/Dockerfile`), `main` auto-deploys |
| **Not this product** | The separate **malickland.net Next.js** tree under Documents — different codebase; do not conflate env or deploy |
| **Not used** | **Supabase**, PostgreSQL, Vercel app router, etc. |

---

## Navigation fix (branch `fix/public-navigation-links`)

| Change | Location |
|--------|----------|
| Implicit `.html` for static pages | `api/server.js` — `express.static(..., { extensions: ['html'] })` so `/37-advent` serves `app/37-advent.html` |
| Legacy URL redirect | `api/routes/public.js` — `301` `/advent-drive-land-hampshire-county-wv` → `/37-advent` |
| Site links | `app/index.html` → `/37-advent`; page file `app/37-advent.html` |

**Validation (2026-05-31, fix branch):** `npm ci`, `node --check` (server + routes), **48/48** security tests, `scripts/preflight.sh`, route smoke — all passed.

Not yet on production until branch is pushed, PR merged to `main`, and Railway deploys.

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
- ✅ 37 Advent landing (`/37-advent`, redirect from legacy slug on fix branch)
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

### 🟡 MEDIUM — Stale remote branches

- Many `copilot/*` and old `claude/*` branches — safe to delete after review

### 🟢 LOW — OpenHands runtime not activated

- Governance controls in place on `main`
- Blocked on: fine-grained GitHub token + executor start

---

## Known bugs

| Bug | Severity | Notes |
|-----|----------|-------|
| leads.js missing deps | High | Not mounted; would crash if mounted |
| Local `main` behind `origin/main` | Ops | Run `git checkout main && git pull origin main` before branching from stale laptop `main` |

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
