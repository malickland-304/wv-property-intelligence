# PROJECT_STATE.md — Malickland 2.0

> **Last verified:** 2026-06-18 (live prod = Hostinger VPS, src @ `24ee74b` from #113, container healthy, image rebuilt no-cache; Railway twin deleted; WV license `WV0029577` verified vs WV REC roster)
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
| Production deploy | ✅ Live and verified | Hostinger VPS `31.97.58.203`, src @ `24ee74b`, container `wv-property-intelligence` healthy |
| PRs #98, #100, #101, #102, #104, #106, #108, #109, #111, #112, #113 | ✅ Merged and deployed as applicable | Runtime deploy includes #113 squash `24ee74b`; later repo-safe commits on `origin/main` do not imply a runtime deploy unless the VPS source/container proof also advances |
| `scripts/smoke-prod.sh` | ✅ Fixed | #102 merged; script respects `PUBLIC_LISTINGS_ENABLED` via `/api/config` |
| Railway twin | ✅ Deleted | `railway service status` reports the linked old service is not found in the project; old GitHub deployment environments are gone; `railway.json`/`railway.toml` removed |
| WV real estate license # | ✅ `WV0029577` (active Salesperson) | WV REC Active Salesperson Roster (10.25), verified 2026-06-18 — `PHILIP MALICK · WV0029577 · Salesperson · WV Real Estate Agency · malickland@icloud.com · 501 E Main St, Romney, WV 26757` (name/brokerage/email/address all match) |
| Content funnel pack | ✅ Finalized, publish-ready | `~/Documents/MalickLand_Content_Funnel_Pack_2026-06-17/`; footer disclosure aligned to the live broker block + `WV0029577` + Equal Housing; PDF text pypdf-verified |
| `/start` buyer-guide funnel | ✅ Live on VPS | PR #109 merged and deployed; `/start` returns 200 and `/assets/MalickLand_WV_Buyers_Guide.pdf` returns 200 `application/pdf` on `malickland.net` |
| `multer` DoS advisory | ✅ Patched live | PR #111 merged; VPS `api/package-lock.json` resolves `multer` to `2.2.0` |
| Public assistant cost-control flag | ✅ Merged and deployed | PR #112 merged; VPS src @ `24ee74b`; `PUBLIC_ASSISTANT_ENABLED=false` returns fallback without provider calls |
| Homepage dynamic HTML safety | ✅ Merged and deployed | PR #113 merged; VPS src @ `24ee74b`; homepage listing/property fields are escaped before insertion |

### Closed gates — do not re-litigate

| Gate | Closed by |
|------|-----------|
| Advent price/date confirmation | User confirmation + live DB update + live page verification |
| Fee wording approval | User/broker approval + live disclosure verification |
| PR #102 readiness/merge | Codex READY, CI green, 0 unresolved threads, #102 merged |
| Production correctness after deploy | Live health/page/config checks + VPS container health |
| Railway revival risk for normal merges | Auto-deploy disabled; #102 merge did not revive the service |
| Railway twin final deletion | Service deleted from Railway 2026-06-18; repo config and dead GitHub deployment environments removed |
| WV license number verification | `WV0029577` verified 2026-06-18 against the WV REC Active Salesperson Roster (cited in Resolved facts) |
| `/start` funnel deploy + PDF asset | PR #109 merged, deployed to VPS, and live-smoked on 2026-06-18 |
| `multer` high-severity DoS remediation | PR #111 merged and live-smoked on the VPS on 2026-06-18 |

### Open gates — ask only these when needed

| Gate | Owner | Needed evidence / action | Notes |
|------|-------|--------------------------|-------|
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
| **Production branch** | `origin/main`; verify current head with `git fetch origin --prune && git rev-parse origin/main` |
| **Last runtime deploy** | #113 `fix(homepage): escape dynamic listing HTML` at `24ee74b` |
| **Live deploy target** | **Hostinger VPS** `srv1716268` / `31.97.58.203` (Docker + Traefik); deploy is **manual** — merge ≠ deploy. Not Railway. See `docs/CANONICAL_MAP.md` |

The live VPS runtime source checkout is `24ee74b`. `origin/main` may advance with repo-safe work that has not been deployed to the VPS; merge still does not equal deploy. Compare future work against current `origin/main`, not a stale local `main`, and prove production with the VPS checkout/container/image state, not Railway deployment records.

### Do not use as source of truth

| Path | Why |
|------|-----|
| `/Users/yhyh7/Documents/GitHub/wv-property-intelligence` | Stale clone (~33 commits behind when last checked) |
| `/Users/yhyh7/Documents/Documents - Philip's MacBook Pro - 4/GitHub/malickland.net` | Separate dirty **Next.js** site — not this stack |
| `/Users/yhyh7/Projects/wv-realestate` | Empty / dead |

Local `main` checkout may lag `origin/main`; always `git fetch origin` and compare to `origin/main`, not an old local `main`.

---

## GitHub / PR status (2026-06-18)

Recent PRs through #122 are merged except #116, which was still open at last check for homepage accessibility/SEO review-thread cleanup. Open issue/PR counts must still be re-checked live in GitHub before acting; this document is not the live issue tracker.

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
| **#108** (persistent listing uploads) | ✅ Merged — `3007446` on `origin/main`; deployed live |
| **#109** (/start funnel landing page + Buyer's Guide lead magnet) | ✅ Merged — `345d509` on `origin/main`; deployed live (`/start` 200, PDF 200) |
| **#111** (`multer` DoS advisory) | ✅ Merged — `644f21b` on `origin/main`; deployed live (`multer` resolves to 2.2.0 on VPS) |
| **#112** (`PUBLIC_ASSISTANT_ENABLED` cost-control flag) | ✅ Merged — `79064a9` on `origin/main`; deployed live |
| **#113** (homepage dynamic HTML safety) | ✅ Merged — `24ee74b` on `origin/main`; deployed live |
| **#114** (VPS SHA proof guardrail + Railway config cleanup) | Repo-only guardrail/docs cleanup; no runtime deploy required unless runtime files change |
| **#116** (homepage accessibility and SEO) | Open at last check; owned by the homepage cleanup lane; do not duplicate work without live PR verification |
| **#117** (HTTP integration smoke test) | ✅ Merged — `b28b0df` on `origin/main`; repo test/preflight coverage, not deployed |
| **#118** (Document Registry Phase 1 spec) | ✅ Merged — `579dbb6` on `origin/main`; docs/spec only |
| **#119** (CORS origin allowlist coverage) | ✅ Merged — `3aa0d0c` on `origin/main`; test coverage only |
| **#120** (Document Registry Phase 1 skeleton) | ✅ Merged — `56647a8` on `origin/main`; runtime code queued for next VPS deploy |
| **#121** (disabled Twilio path removal) | ✅ Merged — `8718a3f` on `origin/main`; runtime cleanup queued for next VPS deploy |
| **#122** (integration-test backlog cleanup) | ✅ Merged — `56c2f51` on `origin/main`; docs/backlog cleanup only |

---

## Production health

| Item | Status |
|------|--------|
| Live URL | https://malickland.net |
| VPS deploy / live smoke | ✅ Live `GET /api/health` → 200 served by `31.97.58.203` (Hostinger VPS, container `wv-property-intelligence`, src @ `24ee74b`) verified 2026-06-18. Deploy is **manual** (SSH + `docker compose build && docker compose up -d`) — not Railway |
| Health endpoint | **`GET /api/health`** — not `/health` (mounted in `api/routes/api.js`) |
| Live config | ✅ `/api/config` → `listingsEnabled:false` (public listing API routes are intentionally gated off) |
| 37 Advent live DB row | ✅ `status='sold'`, `price=170000`, `sold_at='2026-05-29'` |
| npm audit | ✅ 0 vulnerabilities — re-verified 2026-06-18 on `fix/multer-dos-advisory` (`npm audit` **and** `npm audit --omit=dev` both 0 high/critical). Supersedes the 2026-05-31 "0 vulns": a **high-sev `multer` DoS** advisory (GHSA-72gw-mp4g-v24j deeply-nested field names; GHSA-3p4h-7m6x-2hcm aborted-upload cleanup; affected ≤2.1.1) surfaced 2026-06-17 and was remediated by bumping `multer` 2.1.1→**2.2.0** (lockfile via `npm audit fix`) |
| Security test suite | ✅ **57/57** locally on 2026-06-18 (`node tests/verify-security-fixes.test.js`) |
| Preflight + route smoke | ✅ `scripts/preflight.sh` passed locally on 2026-06-18; live `scripts/smoke-prod.sh https://malickland.net` passed from the VPS checkout |
| CI gates | ✅ CodeQL, Semgrep, `preflight.yml` |
| Branch protection | Required status checks enabled (`CodeQL`, `verify`, `check`, `CodeScan`, `semgrep-cloud-platform/scan`); required conversation resolution enabled; PR review protection and admin enforcement intentionally off per `DECISIONS.md` 2026-05-31 |
| Governance files | ✅ `README.md`, `CONTRIBUTING.md`, `.github/CODEOWNERS`, issue templates, and PR template present |
| GitHub security queues | ✅ Open code-scanning alerts: 0; Dependabot alerts: 0; secret-scanning alerts: 0 (2026-05-31 API audit). The 2026-06-17 high-sev `multer` DoS advisory was remediated by PR #111 and deployed live (`multer` 2.2.0 in VPS lockfile) |
| Remote branches | ✅ Only protected `main` remains on `origin` after stale branch cleanup (2026-05-31) |
| Railway twin | ✅ Deleted 2026-06-18. The linked old service is no longer found in Railway; production is VPS-only. Off-Railway backup from 2026-06-17 remains retained |
| GitHub environments | ✅ Cleaned 2026-06-18. Only `copilot` remains; old Railway-era `alert-laughter / production` and `production` environments are gone |
| Listing uploads | ✅ Repo support for `LISTINGS_ROOT` is deployed; verify `/data/listings` and image serving before relying on newly uploaded photos across rebuilds |

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
| SMS | Not implemented; lead capture records SMS consent only |
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
- SMS provider integration is not implemented; lead capture records SMS consent and uses email/local persistence for alerts and follow-up.

### 🟢 Test suite — fixed on `main` (PR #73 governance merge)

- `tests/verify-security-fixes.test.js` checks `routes/api.js`, `routes/admin.js`, `helpers.js`
- **48/48** passing on `fix/public-navigation-links` (2026-05-31)
- Do not report pre-merge or wrong-file test state

### 🟡 MEDIUM — Services layer undocumented

- `api/services/email.js`, `leadFollowupWorker.js`, and `leadNotifications.js` exist but are thinly documented in env-var lists
- Env vars: `RESEND_API_KEY`, `FROM_EMAIL`, `NOTIFICATION_EMAIL` — see `AGENTS.md`

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
- No SMS provider package is installed or dynamically required.

---

## Architecture notes

- Routes: `server.js` → `routes/admin.js`, `routes/api.js` (`/api/health`), `routes/public.js`
- `routes/leads.js` is mounted at `/api/leads` (JSON + same-origin guards)
- Services: `email.js`, `leadFollowupWorker.js`, `leadNotifications.js`
- Utils: `validators.js`, `propertyMarketing.js`, `sqliteSessionStore.js`
- DB: `db.js` — SQLite with migrations
- CSRF: `req.csrfToken = () => generateToken(req, res)` polyfill before admin routes

---

## Product roadmap (approved, per AGENTS.md)

- **Phase 0**: OpenHands executor validation — still awaiting developer action
- **Phase 1**: Document Registry skeleton — spec and API/database skeleton merged in #118/#120; deploy pending
- **Phase 2** (current): AI Review Queue — backend queue API added; admin UI and audited apply workflow remain next
- **Phase 3**: Drive event automation
- **Phase 4**: Gmail intake (Pub/Sub)
