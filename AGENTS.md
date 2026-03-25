# AI Assistant Guidance

## Must-read files (in order)

1. `CONTEXT.md` — business intent, stack, and API route table
2. `api/server.js` — **final source of truth for all routes and middleware**
3. `database/schema.sql` — data model (55 WV counties, properties, users)

## Before generating any API code

Verify the route exists verbatim in `api/server.js`. If it is not there, do not invent it — ask or propose adding it explicitly.

## Conflict resolution

| Situation | Action |
|-----------|--------|
| CONTEXT.md and server.js disagree | Follow `api/server.js`, then propose a CONTEXT.md fix |
| Route in CONTEXT.md not in server.js | Do not use it; flag the discrepancy |
| Route in server.js not in CONTEXT.md | Use it freely; suggest adding it to CONTEXT.md |

## Common mistakes to avoid

- Using `/api/listings` — this route does not exist; use `/api/properties`
- Assuming unauthenticated access to `/admin/*` routes
- Reading `copilot-instructions.md` from the repo root — it does not exist there; see `.github/copilot-instructions.md`
