# Copilot Instructions

1. Read `CONTEXT.md` for business context, stack, and the authoritative route table.
2. Routes live in `api/routes/admin.js`, `api/routes/api.js`, and `api/routes/public.js` — not inline in `server.js`. Verify routes there, not in `server.js`.
3. If `CONTEXT.md` disagrees with the code, follow the code and propose a `CONTEXT.md` fix.
4. `/api/listings` and `/api/listings/:id` are active alias routes for `/api/properties` and `/api/properties/:id` respectively — same handlers, both intentional.
5. Admin routes (`/admin/*`) require `requireAuth`. State-changing routes also require `requireCsrf`.
6. The database is SQLite (better-sqlite3, synchronous). Never use async/await for DB calls.
7. The acreage column is `acreage` — never reference `lot_acres` in SQL. It is only an alias in API responses.
