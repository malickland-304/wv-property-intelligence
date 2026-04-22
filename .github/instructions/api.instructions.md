---
applyTo: "api/**"
---

# API rules (applies to api/**)

- Routes are defined in `api/routes/admin.js`, `api/routes/api.js`, and `api/routes/public.js`. `api/server.js` mounts them — do not add inline routes to server.js.
- When adding a route, update `CONTEXT.md` and `README.md` route tables.
- All new routes follow the pattern: `router.<method>('<path>', [requireAuth,] [requireCsrf,] handler)`.
- Routes under `/admin/*` must always include `requireAuth`. State-changing admin routes must also include `requireCsrf`.
- Database access uses `better-sqlite3` (synchronous). Never introduce async DB calls.
- Uploaded photos go to `listings/{slug}/photos/raw/` via multer. The static route `/images` serves from `listings/`.
- Do not introduce new npm dependencies without justification — the stack is intentionally minimal.
- `GET /api/properties` must always filter by `WHERE status = 'active'` for public access.
- All user strings rendered into HTML must go through `esc()` from `helpers.js`.
- File path components from user input must go through `isSafePathComponent()` before use.
- The acreage column is `acreage` in SQL. `lot_acres` is only an alias used in SELECT statements for frontend compatibility — never use it as a column name.
