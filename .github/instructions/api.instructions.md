---
applyTo: "api/**"
---

# API rules (applies to api/**)

- `api/server.js` is the single source of truth for all routes and middleware.
- Do not add routes without updating CONTEXT.md.
- All new routes must follow the pattern: `app.<method>('<route>', [requireAuth,] handler)`.
- Routes under /admin/* must always include `requireAuth` as middleware.
- Database access uses `better-sqlite3` (synchronous). Do not introduce async DB calls.
- Uploaded files go to the `uploads/` directory via multer. Do not change the destination without updating static route config.
- Do not introduce new dependencies without justification — the stack is intentionally minimal.
- GET /api/properties must always filter by `status = 'active'` for public access.
