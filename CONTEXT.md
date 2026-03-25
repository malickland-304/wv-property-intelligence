# WV Property Intelligence — Context

West Virginia real estate platform covering all 55 WV counties. Provides public property listings, county data, analytics, and an authenticated admin panel for managing properties and reports.

## Stack

| Layer    | Technology |
|----------|------------|
| Frontend | Vanilla JS (`app/app.js`), CSS (`app/styles.css`) |
| API      | Node.js / Express (`api/server.js`) |
| Database | SQLite via better-sqlite3 |
| Auth     | express-session (admin only) |
| Uploads  | multer (photo management) |

## Key files

| File | Purpose |
|------|---------|
| `api/server.js` | **Source of truth for all routes** |
| `app/app.js` | Frontend logic, listings, filters, analytics |
| `app/styles.css` | Responsive UI styling |
| `database/schema.sql` | Legacy schema reference (runtime schema is created in `api/server.js` / SQLite) |

## API routes (source of truth: api/server.js)

> If CONTEXT.md and the code conflict, **the code wins**. Update CONTEXT.md immediately so AI stays aligned.

| Method | Route                | Purpose                        |
|-------:|----------------------|--------------------------------|
| GET    | /api/health          | Healthcheck                    |
| GET    | /api/counties        | List all WV counties           |
| GET    | /api/properties      | List properties (active listings) |
| GET    | /api/properties/:id  | Get one property by ID         |
| GET    | /api/analytics       | Basic analytics summary        |
| POST   | /api/contacts        | Public inquiry submission      |

`GET /api/properties` query params: `q`, `county`, `type`, `minPrice`, `maxPrice`, `page`, `limit`

## Admin routes (authenticated, not public API)

All admin routes require session auth (`requireAuth` middleware).

| Method | Route                          | Purpose |
|-------:|--------------------------------|---------|
| GET    | /admin                         | Dashboard |
| GET/POST | /admin/login               | Login form / submit |
| GET    | /admin/logout                  | Logout |
| GET/POST | /admin/new                 | New property form / submit |
| GET/POST | /admin/edit/:id            | Edit property |
| GET    | /admin/photos/:slug            | Photo management |
| POST   | /admin/upload/:slug            | Upload photo |
| POST   | /admin/photos/:slug/primary    | Set primary photo |
| DELETE | /admin/photos/:slug/:filename  | Delete photo |
| GET    | /admin/report/:id              | Property report |
| POST   | /admin/report/:id/comps        | Add comps to report |
| POST   | /admin/report/:id/dd           | Add due-diligence notes |

## Static routes (non-API)

Defined in `api/server.js`:

- `/images/*` — listing photos
- `/admin-assets/*` — admin panel assets
- `/` and other paths — served via `app/` (frontend); unmatched routes return JSON 404

## Rules for AI assistants

1. Before generating any API call, confirm the route exists in `api/server.js`.
2. Use `/api/properties` (do not invent a "listings" endpoint name).
3. If this file disagrees with `api/server.js`, follow the code and propose a docs fix.
