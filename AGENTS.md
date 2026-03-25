# Repository Instructions

## Primary Context

Before generating code, prompts, workflows, architecture notes, or implementation plans for this repository, read `CONTEXT.md` in the repo root.

`CONTEXT.md` is the canonical high-level brief for:
- MalickLand business context
- WV Property Intelligence product scope
- AI operations hub scope
- brand direction
- platform and runtime constraints

## Working Rules

- Keep solutions aligned with a West Virginia real estate listing platform and AI operations layer.
- Prefer Node.js 18 or 20 LTS assumptions. Do not target Node.js 22+.
- Preserve the MalickLand brand direction: deep forest green, warm gold, Playfair Display, and DM Sans where applicable.
- Favor functional, secure, automated, and scalable implementation choices.
- If a request conflicts with `CONTEXT.md`, call out the conflict before proceeding.

## Related Files

- `CONTEXT.md`: master business and system context
- `copilot-instructions.md`: Copilot-specific repo instructions
# AI Assistant Guidance

## Must-read files (in order)

1. `CONTEXT.md` — business intent, stack, and API route table
2. `api/server.js` — **final source of truth for all routes and middleware**
3. `database/schema.sql` — legacy schema reference (runtime schema lives in `api/server.js`)

## Before generating any API code

Verify the route exists verbatim in `api/server.js`. If it is not there, do not invent it — ask or propose adding it explicitly.

## Conflict resolution

| Situation | Action |
|-----------|--------|
| CONTEXT.md and server.js disagree | Follow `api/server.js`, then propose a CONTEXT.md fix |
| Route in CONTEXT.md not in server.js | Do not use it; flag the discrepancy |
| Route in server.js not in CONTEXT.md | Use it freely; suggest adding it to CONTEXT.md |

## Common mistakes to avoid

- Using the old "listings" endpoint name — use `/api/properties`
- Assuming unauthenticated access to `/admin/*` routes
- Reading `copilot-instructions.md` from the repo root — it does not exist there; see `.github/copilot-instructions.md`
- Forgetting `GET /api/properties` accepts these query params: `q`, `county`, `type`, `minPrice`, `maxPrice`, `page`, `limit`
