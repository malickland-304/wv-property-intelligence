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

- Returns only properties with `status = 'active'` (admin-only routes see all statuses)
- Pagination: `page` (default 1), `limit` (default 12); response includes `{ total, page, properties }`
- `property_type` values: `residential` | `commercial` | `land` | `multi-family` | `industrial`
- `status` values: `active` | `pending` | `sold` | `withdrawn` | `draft`

### Public API contract

`GET /api/health`

- Returns JSON: `{ status, ts }`
- Example: `{ "status": "ok", "ts": "2026-03-25T12:00:00.000Z" }`

`GET /api/counties`

- Returns an array ordered by county name
- Each item includes: `id`, `name`

`GET /api/properties`

- `county` is the numeric `counties.id`, not a county name string
- `type` maps to `property_type`
- `minPrice` and `maxPrice` are numeric filters
- Each property row currently includes:
  `id`, `address`, `city`, `zip`, `price`, `property_type`, `bedrooms`, `bathrooms`,
  `sqft`, `lot_acres`, `acreage`, `year_built`, `image_url`, `listed_at`, `status`,
  `price_reduced`, `road_access`, `flood_zone`, `listing_slug`, `county`

`GET /api/properties/:id`

- Returns one property row by `properties.id`
- Current code does not filter by `status`, so this route can return non-`active` records if the ID exists
- Returns `404` with `{ error: 'Not found' }` when no property matches

`GET /api/analytics`

- Returns JSON with: `avgPrice`, `totalListings`, `medianDom`, `pricePerSqft`
- Values are computed from `status='active'` properties only

`POST /api/contacts`

- Accepts JSON body fields: `property_id`, `name`, `email`, `phone`, `message`
- `name` and `email` are required
- Success response: `201 { id }`
- Validation failure: `400 { error: 'Name and email required' }`

## Admin routes (authenticated, not public API)

Session-based auth via `express-session` (`requireAuth` middleware). Unauthenticated requests redirect to `/admin/login`.

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
4. Treat `/api/properties` and `/api/properties/:id` differently: the collection route is filtered to `active`, but the detail route currently is not.
