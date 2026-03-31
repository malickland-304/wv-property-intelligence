# Copilot Instructions — WV Property Intelligence

## Source of truth hierarchy
1. `api/server.js` — canonical routes, middleware, schema
2. `CONTEXT.md` — documentation layer (must match code)
3. `database/schema.sql` — legacy reference only (do not use for runtime assumptions)

## Before generating any API code
Verify the route exists verbatim in `api/server.js`. If it does not exist, do not invent it.

## Canonical API routes
| Method | Route               |
|-------:|---------------------|
| GET    | /api/health         |
| GET    | /api/counties       |
| GET    | /api/properties     |
| GET    | /api/properties/:id |
| GET    | /api/analytics      |
| POST   | /api/contacts       |

GET /api/properties query params: q, county, type, minPrice, maxPrice, page, limit
GET /api/properties returns ONLY status='active' records (not all properties).
Pagination defaults: page=1, limit=12. Response shape: { total, page, properties }.

## Enum constraints (enforced by CHECK in schema)
- property_type: residential | commercial | land | multi-family | industrial
- status: active | pending | sold | withdrawn | draft

## Admin routes
All /admin/* routes require session auth (express-session, requireAuth middleware).
Unauthenticated requests redirect to /admin/login — never expose admin routes without requireAuth.

## Code review priorities
1. Flag any use of /api/listings — the correct route is /api/properties
2. Flag admin routes missing requireAuth middleware
3. Flag API calls to routes not listed above
4. Flag hardcoded property_type or status values outside the allowed enums
5. Validate consistency between CONTEXT.md and api/server.js — if they conflict, follow the code

## Conflict resolution
| Situation                         | Action                                      |
|-----------------------------------|---------------------------------------------|
| CONTEXT.md vs server.js conflict  | Follow server.js, propose CONTEXT.md fix    |
| Route in docs not in server.js    | Do not use it; flag the discrepancy         |
| Route in server.js not in docs    | Use it freely; suggest adding to CONTEXT.md |

## Security
- API keys and secrets must use GitHub Secrets — never hardcode
- Session secrets must be in environment variables
- Branch protection required for main — no direct pushes
