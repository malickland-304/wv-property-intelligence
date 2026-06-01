# ARCHITECTURE.md — Malickland 2.0
> Agents must not substantially redesign any section without satisfying the Architectural Stability Rule in AGENTS.md.
> Last verified: 2026-05-27

---

## System Overview

**Malickland.net** — West Virginia real estate platform for Phil Malick (MalickLand, Romney WV). Public listing search, admin management, AI-assisted marketing content, Google Drive photo storage, and lead capture.

---

## Technology Stack (Stable — Do Not Change Without DECISIONS.md Entry)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Runtime | Node.js 20 LTS | Railway-compatible, long-term support |
| Framework | Express 5 | Active development, async error handling |
| Database | SQLite via `better-sqlite3` | Zero infrastructure overhead, sufficient for current scale, synchronous API simplifies code |
| Session store | `better-sqlite3-session-store` | Collocated with main DB; no Redis needed |
| Auth | `express-session` (admin) + Bearer API key (REST) | Session for interactive admin; API key for programmatic access |
| CSRF | `csrf-csrf` v3 (double-submit cookie) | Replaced deprecated `csurf`; session-bound via `req.sessionID` |
| Security | `helmet`, `cors`, `express-rate-limit` | Defense in depth |
| Email | Resend API (primary) / Gmail OAuth2 (fallback) | Resend: zero OAuth setup; Gmail: existing integration |
| SMS | Twilio (optional, feature-flagged) | `twilio` pkg NOT in package.json; feature disabled until leads system complete |
| AI | OpenAI GPT-4o via raw HTTPS | No SDK — reduces dep surface |
| Google APIs | Raw HTTPS (no `googleapis` SDK) | Fewer deps, smaller attack surface |
| Images | `sharp` for compression | On-upload processing: 1200px/85q web, 1024px/80q MLS |
| Frontend | Vanilla HTML/JS/CSS | No build step; zero bundler complexity |
| Deploy | Railway + Docker (`api/Dockerfile`) | `main` branch auto-deploys via Railway webhook |
| CI | GitHub Actions | CodeQL, Semgrep, preflight.yml |

---

## Directory Structure

```
wv-property-intelligence/
├── api/                        ← Node/Express server
│   ├── server.js               ← Entry point: middleware composition + route mounting
│   ├── db.js                   ← SQLite connection, CREATE TABLE, migrations, seed
│   ├── helpers.js              ← normalizeAcreage, isSafePathComponent, safeListingPath, slugify, esc
│   ├── google.js               ← Gmail (send) + Drive (upload) via raw HTTPS
│   ├── ai-generator.js         ← GPT-4o content generation, per-listing cache
│   ├── db-migrate-ai.js        ← DB migration script for AI columns
│   ├── Dockerfile              ← Multi-stage build
│   ├── docker-entrypoint.sh    ← Startup script
│   ├── middleware/
│   │   ├── auth.js             ← requireAuth, requireCsrf, requireApiKey, csrfToken
│   │   ├── csrf.js             ← csrf-csrf setup (generateToken, doubleCsrfProtection)
│   │   └── rate-limits.js      ← All rate limiter instances
│   ├── routes/
│   │   ├── admin.js            ← All /admin/* routes (624 LOC)
│   │   ├── api.js              ← All /api/* routes (227 LOC)
│   │   ├── public.js           ← robots.txt, sitemap.xml, /listing/:id, /properties/:id
│   │   └── leads.js            ← Lead capture routes (NOT MOUNTED — missing deps)
│   ├── services/
│   │   ├── email.js            ← Transactional email (Resend primary, Gmail fallback)
│   │   ├── leadNotifications.js ← Lead alert + auto-reply email
│   │   ├── leadFollowupWorker.js ← Lead follow-up scheduling
│   │   └── twilioService.js    ← SMS alerts (disabled — twilio not in package.json)
│   ├── utils/
│   │   ├── validators.js       ← validateLeadPayload, buildLeadSchedule, buildPropertyLead
│   │   ├── propertyMarketing.js ← Marketing copy helpers
│   │   └── sqliteSessionStore.js ← Session store wrapper
│   └── views/
│       └── admin.js            ← adminShell(), listingForm(), loginPageHtml() (SSR)
├── app/                        ← Vanilla JS frontend (served as static files)
│   ├── index.html              ← Public listing search
│   ├── listings.html           ← Static listings index
│   ├── 37-advent.html          ← Advent landing page, extensionless at /37-advent
│   ├── listing.html            ← Single property detail
│   ├── admin.html              ← Admin login
│   ├── app.js                  ← Frontend JS for index.html
│   └── listing.js              ← Frontend JS for listing.html
├── database/
│   ├── schema.sql              ← Reference schema (documentation only, not auto-applied)
│   └── wv_property.db          ← Live DB (gitignored)
├── listings/                   ← Per-property files (gitignored)
│   └── {slug}/
│       ├── photos/raw/
│       ├── photos/compressed/
│       └── photos/mls/
├── scripts/
│   ├── preflight.sh            ← Dependency/syntax/startup/public endpoint smoke gate
│   ├── smoke-prod.sh           ← Read-only prod smoke
│   ├── smoke-admin.sh          ← Authenticated admin CSRF smoke
│   └── check-env.sh            ← Validates required env vars
├── tests/
│   └── verify-security-fixes.test.js ← Security/correctness test suite (Node, no framework)
├── docs/
│   └── agent-handoff.md        ← Deployment state notes (not an authority document)
├── .github/
│   ├── workflows/              ← preflight.yml, codeql.yml, codescan.yml, nodejs-ci.yml
│   ├── ISSUE_TEMPLATE/         ← AI task templates
│   └── pull_request_template.md
├── .openhands/
│   ├── hooks/pre-tool-use.sh   ← Blocks forbidden terminal commands (exit 2)
│   ├── hooks/on-stop.sh        ← Structured stop report
│   ├── setup.sh                ← Fail-closed npm audit, npm ci enforcement
│   └── instructions.md         ← OpenHands-specific behavioral rules
├── AGENTS.md                   ← This governance system
├── ARCHITECTURE.md             ← This file
├── DECISIONS.md
├── TASKS.md
├── PROJECT_STATE.md
├── QA_CHECKLIST.md
├── WORK_LOG.md
└── SECURITY.md
```

---

## Route Architecture

```
server.js
├── app.use('/admin', cookieParser, adminSession, csrfToken, doubleCsrfProtection, adminRoutes)
├── app.use('/api',   apiRoutes)
└── app.use('/',      publicRoutes)
    + express.static('../app')          ← Vanilla frontend
    + express.static('../listings')     ← Property photos at /images/*
```

### /admin/* (routes/admin.js)
Most routes require `requireAuth`. Exceptions: `/admin/login` (GET/POST) and `/admin/logout` (GET) are intentionally public — they handle unauthenticated entry. Mutating routes additionally require `requireCsrf` and `adminActionRateLimit`.
- `GET /admin/` — listing index
- `GET/POST /admin/login` — session auth
- `GET /admin/new` — new listing form
- `POST /admin/new` — create listing
- `GET/POST /admin/edit/:id` — edit listing
- `POST /admin/upload/:slug` — photo upload (sharp compression)
- `POST /admin/photos/:slug/primary` — set primary photo
- `DELETE /admin/photos/:slug/:filename` — delete photo
- `GET /admin/photos/:slug` — photo management view
- `POST /admin/report/:id/comps` — save comps
- `POST /admin/report/:id/dd` — save due diligence
- `POST /admin/ai/:id` — generate AI marketing content

### /api/* (routes/api.js)
Public read routes use `publicReadRateLimit`. CRUD write routes require `requireApiKey` + `apiWriteRateLimit`. Exception: the AI description route is public and rate-limited only (see below).
- `GET /api/health`
- `GET /api/config`
- `GET /api/counties`
- `GET /api/properties` (alias: `/api/listings`) — paginated public listing search
- `GET /api/properties/:id` (alias: `/api/listings/:id`) — property detail (status=active only)
- `GET /api/analytics`
- `POST /api/contacts` — contact form (contactsRateLimit)
- `GET /api/contacts` — API-key protected
- `POST /api/properties` — create (API-key)
- `PUT /api/properties/:id` — update (API-key)
- `DELETE /api/properties/:id` — delete (API-key)
- `POST /api/properties/generate-description` — AI description (generateDescRateLimit only; no requireApiKey — public rate-limited exception)

### /* (routes/public.js)
- `GET /robots.txt`
- `GET /sitemap.xml`
- `GET /listing/:id`, `/properties/:id` — serve listing.html
- `GET /advent-drive-land-hampshire-county-wv` — 301 redirect to `/37-advent`
- Static frontend files are served from `app/` with `.html` extension resolution, so `/37-advent` serves `app/37-advent.html`

### /api/leads/* (routes/leads.js)
Lead capture routes mounted behind JSON and same-origin guards in `server.js`. Local SQLite lead persistence works without external credentials; Google Sheets append is currently a no-op adapter until real sheet credentials/support are added.

---

## Authentication Model

| Path | Auth |
|------|------|
| `/admin/*` (except `/admin/login`, `/admin/logout`) | Session cookie (`express-session`, `SESSION_SECRET`) |
| `/admin/login` (GET/POST), `/admin/logout` (GET) | None — intentionally public |
| `POST /api/contacts` | None — public (contactsRateLimit only) |
| `GET /api/contacts` | Bearer API key (`API_KEY` env var) |
| `GET /api/properties`, `GET /api/listings`, and other public read routes | None — public (publicReadRateLimit) |
| `POST /api/properties`, `PUT /api/properties/:id`, `DELETE /api/properties/:id` | Bearer API key (`API_KEY` env var) |

CSRF: double-submit cookie via `csrf-csrf`. Applied to all mutating `/admin/*` routes (not login/logout). Not applied to `/api/*` (stateless Bearer auth).

---

## Database Schema (Key Tables)

- `properties` — main listing table (id, county_id, address, status, acreage, price, ...)
- `counties` — WV county reference (seeded on startup)
- `contacts` — contact form submissions
- `sessions` — express-session store
- `leads` — lead capture (populated by leads.js when mounted)
- `lead_followups` — follow-up scheduling

**Critical constraint:** `properties.status = 'active'` filter is applied to all public-facing queries. Draft/inactive listings are never exposed publicly.

---

## Data Authority

| Data Type | Authoritative Source |
|-----------|---------------------|
| Original property documents, photos, plats, disclosures, contracts, marketing/media assets | **Google Drive** (folder: `GOOGLE_DRIVE_FOLDER_ID`) |
| Structured listing/property data, statuses, contacts, approvals, links, AI summaries | **Backend/API database** (SQLite, path: `DATABASE_PATH`) |

---

## Deployment Architecture

```
GitHub main branch
    → Railway webhook → Docker build (api/Dockerfile)
    → Container start: node server.js
    → Railway persistent volume: DATABASE_PATH (/data/wv_property.db)
    → Railway env vars: all secrets injected at runtime
```

- **Cloudflare** is the DNS/SSL/security layer in front of Railway — handles DNS, TLS termination, and edge-level protection (DDoS, bot filtering). It is not a deployment platform; the application runs on Railway.
- No application CDN, no load balancer, no Redis, no external database
- Photos stored on Railway persistent volume at `listings/` path
- Single-process Node.js — no clustering

---

## Known Architectural Constraints

1. **SQLite single-writer**: concurrent write-heavy load would require migration to PostgreSQL. Current scale (low-traffic real estate site) does not require this.
2. **No background job runner**: `leadFollowupWorker.js` exists but has no scheduler. Cron or a simple setInterval would be needed.
3. **No image CDN**: photos served directly from the Express process. Acceptable at current scale; S3+CDN would be the upgrade path.
4. **No test framework**: tests use Node's built-in `assert`. Sufficient for current coverage; `mocha` or `jest` would be the upgrade if test complexity grows.

---

## Phase Roadmap (Approved Sequence)

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | OpenHands executor validation | AMBER — runtime not started |
| 1 | Document Registry (SQLite tables + API skeleton) | PLANNED — spec pending from ChatGPT |
| 2 | AI Review Queue (extracted_claims, approval workflow) | PLANNED — depends on Phase 1 |
| 3 | Drive event automation (push notifications) | PLANNED — Gemini leads |
| 4 | Gmail intake (Pub/Sub, mailbox watch) | PLANNED — Gemini leads |
