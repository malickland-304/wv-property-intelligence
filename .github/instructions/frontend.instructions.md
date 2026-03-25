---
applyTo: "app/**"
---

# Frontend rules (applies to app/**)

- Frontend is vanilla JS — do not introduce frameworks or build tools.
- All API calls must use routes listed in CONTEXT.md (sourced from api/server.js).
- Do not call /api/listings — the correct route is /api/properties.
- GET /api/properties supports these query params: q, county, type, minPrice, maxPrice, page, limit.
- The public view only receives active listings (status='active') — do not assume otherwise.
- Static assets are served from app/ directly — no bundler, no transpilation.
