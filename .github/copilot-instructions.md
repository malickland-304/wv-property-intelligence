# Copilot instructions

1. Use `CONTEXT.md` for business and system intent.
2. Before generating any API calls, verify the route exists in `api/server.js` — the code is the final source of truth.
3. If `CONTEXT.md` disagrees with the code, follow the code and then propose the docs fix.
4. There is no `/api/listings` route. Use `/api/properties`.
5. Admin routes (`/admin/*`) require session authentication — never expose them without `requireAuth`.
