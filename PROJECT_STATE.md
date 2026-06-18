# PROJECT_STATE.md — Malickland 2.0

> **Last verified:** 2026-06-18 (GitHub `origin/main` @ `79064a9` after #112; live prod = Hostinger VPS, src @ `79064a9` deployed 2026-06-18, container healthy; Railway twin **deleted** 2026-06-18; WV license `WV0029577` verified vs WV REC roster)
> **Authority:** Product completeness, repo workspace truth, resolved facts, and open gates. Use `docs/CANONICAL_MAP.md` for repo/domain/stack disambiguation. Deployment runbooks and guardrails remain in `docs/agent-handoff.md`.

---

## Agent State Ledger

This section is the anti-loop ledger. Agents must read it before asking Phil for status or approval.

### Triage entrypoint

Before asking Phil to relay another agent's status, run:

```bash
bash scripts/agent-triage.sh
```

Agents must use `PROJECT_STATE.md`, GitHub PR state, and live production checks as the shared message bus. Chat screenshots and another agent's summaries are only CLAIMED until verified. Manual copy/paste relay is reserved for human-owned authentication boundaries such as Squarespace login.

### Resolved facts — do not ask again

| Fact | Status | Evidence |
|------|--------|----------|
| 37 Advent close | ✅ Closed / verified | Live site and DB updated; `/37-advent` shows closed sale |
| Sale price | ✅ `$170,000` | Live DB row `advent-dr-hampshire-wv.price=170000`; `/37-advent` copy shows closed at `$170,000` |
| Close date | ✅ `2026-05-29` | Live DB row `advent-dr-hampshire-wv.sold_at='2026-05-29'` |
| $299 broker admin fee wording | ✅ Approved and live | Homepage and `/37-advent` disclose the fee; broker approval was confirmed before deploy |
| Brokerage disclosure | ✅ Live | Footer / public pages show `WV Real Estate Agency, LLC | Sheila Judy, Broker` |
| Production deploy | ✅ Live and verified | Hostinger VPS `31.97.58.203`, src @ `79064a9` (deployed 2026-06-18), container `wv-property-intelligence` healthy |
| PRs #98, #100, #101, #102, #104, #106 | ✅ Merged | `origin/main` includes #106 squash `09bd364` |
| `scripts/smoke-prod.sh` | ✅ Fixed | #102 merged; script respects `PUBLIC_LISTINGS_ENABLED` via `/api/config` |
| Railway twin | ✅ **Deleted** 2026-06-18 | Service `wv-property-intelligence` removed from Railway project `alert-laughter` (deployments removed, custom domains detached, env/secrets gone). Project now holds only the separate `malickland.net` 2.0 service |
| Railway config in repo | ✅ Removed | `railway.json` + `railway.toml` deleted; legacy GitHub deploy environments `alert-laughter / production` + `production` deleted (0 secrets each); `copilot` env kept (unrelated) |
| WV real estate license # | ✅ `WV0029577` (active Salesperson) | WV REC Active Salesperson Roster (10.25), verified 2026-06-18 — `PHILIP MALICK · WV0029577 · Salesperson · WV Real Estate Agency · malickland@icloud.com · 501 E Main St, Romney, WV 26757` (name/brokerage/email/address all match) |
| Content funnel pack | ✅ Finalized, publish-ready | `~/Documents/MalickLand_Content_Funnel_Pack_2026-06-17/`; footer disclosure aligned to the live broker block + `WV0029577` + Equal Housing; PDF text pypdf-verified |

### Closed gates — do not re-litigate

| Gate | Closed by |
|------|-----------|
| Advent price/date confirmation | User confirmation + live DB update + live page verification |
| Fee wording approval | User/broker approval + live disclosure verification |
| PR #102 readiness/merge | Codex READY, CI green, 0 unresolved threads, #102 merged |
| Production correctness after deploy | Live health/page/config checks + VPS container health |
| Railway revival risk for normal merges | Auto-deploy disabled; #102 merge did not revive the service |
| WV license number verification | `WV0029577` verified 2026-06-18 against the WV REC Active Salesperson Roster (cited in Resolved facts) |
| Railway twin decommission | Service deleted from Railway 2026-06-18 (Phil-approved); repo `railway.json`/`railway.toml` + dead GitHub deploy environments removed; production is VPS-only |

### Open gates — ask only these when needed

| Gate | Owner | Needed evidence / action | Notes |
|------|-------|--------------------------|-------|
| Funnel `/start` deploy + activation | Phil | Approve deploy of PR #109 to the VPS, then approve (a) exposing the PDF publicly, (b) activating the form for real traffic | Built on the **live VPS site** (Phil's chosen path, not Squarespace). PR #109 = `app/start.html` + Buyer's Guide PDF, posts to `/api/contacts` (`source=buyers-guide`). Local-verified (preflight + live smoke: `/start` 200 with listings off, PDF 200, contacts 201, cross-origin 403). **Merge-candidate only — not deployed.** Awaiting Codex READY verdict |
| Welcome / nurture emails (funnel phase 2) | Phil | Approve enabling and sending the welcome sequence | Gated separately; emails are a hard pause-point. Not in PR #109 |
| Optional alternate footer wording from Sheila | Sheila | Sheila-approved exact wording only if she wants something different from the current live-aligned block | Not blocking; the default form is already in the pack. The live fee/brokerage wording is closed |

### Agent question rule

Before asking Phil anything, identify the open gate in the table above. If no open gate matches, do the next repo-safe task or state that the remaining work is human-gated. Do not ask about resolved facts or closed gates.

---

## Canonical workspace (use only this)

| Item | Value |
|------|--------|
| **Active repo** | `/Users/yhyh7/Projects/wv-property-intelligence` |
| **Remote** | `https://github.com/malickland-304/wv-property-intelligence.git` |
| **Production branch** | `origin/main` @ `09bd364` (#106 merged 2026-06-18) |
| **Last merged PR** | #106 `docs(ledger): record WV license WV0029577 as verified; close that gate` |
| **Live deploy target** | **Hostinger VPS** `srv1716268` / `31.97.58.203` (Docker + Traefik); deploy is **manual** — merge ≠ deploy. Not Railway. See `docs/CANONICAL_MAP.md` |

`origin/main` is ahead of live production by docs/governance and smoke-script changes only (#102, #104, #106). This is expected: none of those changes require runtime deploy. Compare future work against `origin/main`, not a stale local `main`.

### Do not use as source of truth

| Path | Why |
|------|-----|
| `/Users/yhyh7/Documents/GitHub/wv-property-intelligence` | Stale clone (~33 commits behind when last checked) |
| `/Users/yhyh7/Documents/Documents - Philip's MacBook Pro - 4/GitHub/malickland.net` | Separate dirty **Next.js** site — not this stack |
| `/Users/yhyh7/Projects/wv-realestate` | Empty / dead |

Local `main` checkout may lag `origin/main`; always `git fetch origin` and compare to `origin/main`, not an old local `main`.

---

## GitHub / PR status (2026-06-18)

Recent PRs #98, #100, #101, and #102 are merged. Open issue/PR counts must still be re-checked live in GitHub before acting; this document is not the live issue tracker.

| PR | Status |
|----|--------|
| **#60** (old consolidation PR) | Closed 2026-05-31 as stale/unsafe to merge; branch deleted |
| **#70** (npm hook blocker) | Closed 2026-05-31 as superseded by current `main`; branch deleted |
| **#71** (CodeQL suppression narrowing) | Closed 2026-05-31 as not viable; linked Issue #65 is closed and PR failed CodeQL; branch deleted |
| **#73** (governance / test-suite overhaul) | ✅ Merged to `main` (governance commits on `origin/main`, e.g. `f8604f0`, `24399fb`) |
| **#75** (notification observability) | ✅ Merged — `7eb8b1e` on `origin/main` |
| **#76** (public navigation links fix) | ✅ Merged — `dc8cc53` on `origin/main` (2026-05-31); production smoke passed |
| **#84** (lead hardening review followups) | ✅ Merged — `48c891d` on `origin/main` (2026-06-01); all required PR checks green before merge |
| **#86** (governance and compliance copy) | ✅ Merged — `a479bfb` on `origin/main` (2026-06-04) |
| **#77** (Cursor workspace guardrails) | ✅ Merged — `b34e2fb` on `origin/main` (2026-05-31) |
| **#78** (post-PR76 docs refresh) | ✅ Merged — `0908cd4` on `origin/main` (2026-05-31) |
| **#98** (VPS production truth / gatekeeper protocol) | ✅ Merged — `250cef7` on `origin/main` |
| **#100** (docs follow-up + Railway decommission record) | ✅ Merged — `9e3db78` on `origin/main` |
| **#101** (37 Advent closed sale + $299 admin fee disclosure) | ✅ Merged — `e7c2114` on `origin/main`; deployed live |
| **#102** (production smoke respects listings feature flag) | ✅ Merged — `b6eaefa` on `origin/main`; no deploy needed |
| **#104** (agent state ledger framework) | ✅ Merged — `f821774` on `origin/main`; no deploy needed |
| **#106** (WV license verified + ledger cleanup) | ✅ Merged — `09bd364` on `origin/main`; no deploy needed |
| **#109** (/start funnel landing page + Buyer's Guide lead magnet) | 🟡 Open — additive (`app/start.html` + PDF); local-verified; awaiting Codex READY; **do not deploy** until Phil approves publish/activation |

---

## Production health

| Item | Status |
|------|--------|
| Live URL | https://malickland.net |
| VPS deploy / live smoke | ✅ Live `GET /api/health` → 200 served by `31.97.58.203` (Hostinger VPS, container `wv-property-intelligence`, src @ `e7c2114`) verified 2026-06-18. Deploy is **manual** (SSH + `docker compose build && docker compose up -d`) — not Railway |
| Health endpoint | **`GET /api/health`** — not `/health` (mounted in `api/routes/api.js`) |
| Live config | ✅ `/api/config` → `listingsEnabled:false` (public listing API routes are intentionally gated off) |
| 37 Advent live DB row | ✅ `status='sold'`, `price=170000`, `sold_at='2026-05-29'` |
| npm audit | ✅ 0 vulnerabilities — re-verified 2026-06-18 on `fix/multer-dos-advisory` (`npm audit` **and** `npm audit --omit=dev` both 0 high/critical). Supersedes the 2026-05-31 "0 vulns": a **high-sev `multer` DoS** advisory (GHSA-72gw-mp4g-v24j deeply-nested field names; GHSA-3p4h-7m6x-2hcm aborted-upload cleanup; affected ≤2.1.1) surfaced 2026-06-17 and was remediated by bumping `multer` 2.1.1→**2.2.0** (lockfile via `npm audit fix`) |
| Security test suite | ✅ **57/57** locally on 2026-06-18 (`node tests/verify-security-fixes.test.js`) |
| Preflight + route smoke | ✅ `scripts/preflight.sh` passed locally on 2026-06-04 |
| CI gates | ✅ CodeQL, Semgrep, `preflight.yml` |
| Branch protection | Required status checks enabled (`CodeQL`, `verify`, `check`, `CodeScan`, `semgrep-cloud-platform/scan`); required conversation resolution enabled; PR review protection and admin enforcement intentionally off per `DECISIONS.md` 2026-05-31 |
| Governance files | ✅ `README.md`, `CONTRIBUTING.md`, `.github/CODEOWNERS`, issue templates, and PR template present |
| GitHub security queues | ✅ Open code-scanning alerts: 0; Dependabot alerts: 0; secret-scanning alerts: 0 (2026-05-31 API audit) — ⚠️ predates the 2026-06-17 high-sev `multer` DoS advisory (Dependabot/npm-audit class), remediated on `fix/multer-dos-advisory` (multer 2.1.1→2.2.0); re-query queues after that PR merges |
| Remote branches | ✅ Only protected `main` remains on `origin` after stale branch cleanup (2026-05-31) |
| Railway twin | ✅ **Deleted** 2026-06-18 — service removed from Railway (deployments, custom domains, env/secrets gone); production is VPS-only. Off-Railway backup retained at `~/railway-decommission-backup-2026-06-17/` per the 30–90 day window |
| GitHub environments | ✅ Cleaned 2026-06-18 — deleted the Railway-era `alert-laughter / production` + `production` environments (0 secrets each, non-gating). Only `copilot` remains (GitHub Copilot agent; unrelated to Railway) |
| Listing uploads | ✅ Deployed 2026-06-18 — `LISTINGS_ROOT=/data/listings` set on the VPS `.env`; `/data/listings` created on the persistent volume (entrypoint); migration was a no-op (live `/workspace/listings` empty). Uploads now survive container recreate |

---

## Stack truth (not Next.js / not Supabase)

| Layer | Choice |
|-------|--------|
| **This repo** | Node.js 20 / **Express 5** monolith, **SQLite** (`better-sqlite3`), **vanilla HTML** in `app/` (no frontend build) |
| **Deploy** | **Hostinger VPS** — Docker + Traefik (`api/Dockerfile`); **manual** deploy (merge ≠ deploy). Not Railway |
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
| Deploy | Hostinger VPS — Docker + Traefik (`api/Dockerfile`); manual deploy (merge ≠ deploy) |

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

### 🟡 Follow-up — External lead integrations

- `api/routes/leads.js` is mounted in `server.js`
- Public lead/contact POSTs require JSON plus same-origin request headers
- `api/services/googleSheets.js` is a no-op adapter until real Sheets append support is implemented
- `twilio` is still optional and not in `package.json`; SMS alerts remain disabled unless that dependency and env are added

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
| ~~leads.js missing deps~~ | Resolved | `/api/leads` mounted with local-safe adapters (DECISIONS.md 2026-06-01) — no longer a bug |
| Stale or wrong Cursor workspace | Ops | Cursor sessions have used `openclaw-system` and stale Documents/GitHub checkouts; reopen Cursor at `/Users/yhyh7/Projects/wv-property-intelligence` and verify `workspace_roots` before production work |

---

## Security notes

- No critical security issues identified in recent validation pass
- CORS: `cors()` without origin restriction — acceptable for public listing API; review if private data exposed
- `twilio` dynamically required in `twilioService.js` — fail-graceful; package not installed

---

## Architecture notes

- Routes: `server.js` → `routes/admin.js`, `routes/api.js` (`/api/health`), `routes/public.js`
- `routes/leads.js` is mounted at `/api/leads` (JSON + same-origin guards)
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
