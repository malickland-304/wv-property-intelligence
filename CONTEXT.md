# MalickLand — Project Context

> Paste this file into any AI assistant to establish full project context before asking questions.

---

## Business

**MalickLand** — West Virginia real estate agency based in Romney, WV (Hampshire County).
Focus: land, residential, and farm properties across WV's Eastern Panhandle counties.
Website: malickland.net | Email: phil@malickland.net | Agent: Phil Malick

---

## What This Repo Is

A production real estate platform with:
- Public listing search + individual property pages
- Admin panel for listing management, photo uploads, due diligence notes
- AI marketing content generation (GPT-4o) per listing
- REST API for data access and external integrations

---

## Actual Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 20 LTS |
| Framework | Express 5 |
| **Database** | **SQLite** via better-sqlite3 (NOT Google Sheets, NOT PostgreSQL) |
| Session store | better-sqlite3-session-store |
| Auth | express-session (admin) + Bearer API key (REST) |
| Images | Local disk (`listings/{slug}/photos/`) + optional Google Drive backup |
| Email | Gmail API via OAuth2 refresh token (no SDK) |
| AI | OpenAI GPT-4o via HTTPS (no SDK) |
| Deploy | Hostinger VPS — Docker + Traefik (multi-stage `api/Dockerfile`), manual deploy |
| Frontend | Vanilla JS, no build step |

---

## File Layout (what matters)

```
api/
  server.js          — entry point; mounts middleware + routes
  db.js              — DB connection, CREATE TABLE, migrations, county seed
  helpers.js         — esc(), slugify(), isSafePathComponent(), normalizeAcreage()
  google.js          — sendContactEmail(), uploadPhotoToDrive()
  ai-generator.js    — generateListingContent(), getOrGenerateContent()
  middleware/
    auth.js          — requireAuth, requireCsrf, requireApiKey, csrfToken
    rate-limits.js   — per-route rate limit instances
  routes/
    admin.js         — all /admin/* routes
    api.js           — all /api/* routes
    public.js        — /robots.txt, /sitemap.xml, /listing/:id
  views/
    admin.js         — adminShell(), listingForm(), loginPageHtml()

app/
  index.html         — public listing search page
  listing.html       — single property detail page
  admin.html         — admin login page stub
  app.js             — frontend JS for index.html
  listing.js         — frontend JS for listing.html
  styles.css         — all CSS

database/
  schema.sql         — SQLite reference schema (documentation only)
  wv_property.db     — live database (gitignored)

listings/            — per-property folder tree (gitignored)
  {slug}/
    photos/raw/      — uploaded originals
    photos/compressed/ — web-optimized (1200px, JPEG 85)
    photos/mls/      — MLS copies (1024px, JPEG 80)
    listing.json     — property data + AI content cache
    comps.csv        — comparable sales
    due_diligence.md — DD notes
```

---

## API Routes (source of truth: `api/routes/api.js`)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/health` | Public | |
| GET | `/api/counties` | Public | All 55 WV counties |
| GET | `/api/properties` | Public | Filterable: `q`, `county`, `type`, `minPrice`, `maxPrice`, `page`, `limit` |
| GET | `/api/properties/:id` | Public | Also matches by `listing_slug` |
| POST | `/api/properties` | API Key | |
| PUT | `/api/properties/:id` | API Key | |
| DELETE | `/api/properties/:id` | API Key | |
| GET | `/api/analytics` | Public | |
| POST | `/api/contacts` | Public | Rate-limited |
| GET | `/api/contacts` | API Key | |
| POST | `/api/properties/generate-description` | Public (rate-limited) | Simple template response, no OpenAI |

## Admin Routes (source of truth: `api/routes/admin.js`)

All require `requireAuth` session middleware.

| Path | Description |
|------|-------------|
| `GET/POST /admin/login` | Login |
| `GET /admin` | Listings dashboard |
| `GET /admin/new` | New listing form |
| `POST /admin/new` | Create listing |
| `GET /admin/edit/:id` | Edit form |
| `POST /admin/edit/:id` | Save edits |
| `GET /admin/photos/:slug` | Photo manager |
| `POST /admin/upload/:slug` | Upload + compress photo |
| `GET /admin/ai/:id` | AI content viewer |
| `POST /admin/ai/:id` | Generate/regenerate AI content |
| `GET /admin/report/:id` | Comps + due diligence editor |
| `GET /admin/integrations` | Gmail + Drive status |

---

## Database Schema (SQLite)

Key columns in `properties`:
- `id` TEXT (hex UUID), `listing_slug` TEXT UNIQUE
- `property_type`: `residential | commercial | land | multi-family | industrial`
- `status`: `active | pending | sold | withdrawn | draft`
- `acreage` REAL (canonical acreage field — do NOT use `lot_acres`)
- `ai_content` TEXT (JSON blob from OpenAI), `ai_generated_at` TEXT

---

## Rules for AI Assistants

1. **Routes live in `api/routes/*.js`**, not in `server.js` directly. `server.js` mounts them.
2. **Database is SQLite** — synchronous API (better-sqlite3). Never use async/await for DB calls.
3. **Never reference `p.lot_acres`** in SQL — the column is `acreage`. API responses alias it as `lot_acres` for frontend compatibility.
4. All `/admin/*` routes must include `requireAuth`. State-changing routes must also include `requireCsrf`.
5. All user-provided strings rendered into HTML go through `esc()` from `helpers.js`.
6. File paths for listing assets must go through `isSafePathComponent()` before use.
7. Public property queries always filter `WHERE status = 'active'`.
