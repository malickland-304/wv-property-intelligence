# CANONICAL_MAP.md — MalickLand Production Map

> Last verified: 2026-05-31 by Codex using local git state plus read-only DNS/curl probes.
> Use this file to prevent repo, domain, and stack confusion before touching MalickLand production work.

## Canonical Truth

| Layer | Current truth | Evidence |
|-------|---------------|----------|
| Live domain | `https://malickland.net` | DNS resolves to `66.33.22.228`; responses are served by Railway |
| Production stack | Express 5 monolith: `api/` JSON + `app/` static HTML | `railway.toml`, `api/Dockerfile`, `api/server.js`, live `/api/health` |
| Production repo | `malickland-304/wv-property-intelligence` | `origin` in `/Users/yhyh7/Projects/wv-property-intelligence` |
| Production branch | `origin/main` | `git fetch origin`; last observed `origin/main` was `2c4b71e` on 2026-05-31 |
| Canonical local checkout | `/Users/yhyh7/Projects/wv-property-intelligence` | Active repair branch `fix/public-navigation-links` |
| Health URL | `https://malickland.net/api/health` | Live probe returned `{"status":"ok", ...}` on 2026-05-31 |
| Not production | `malickland-304/malickland.net` | Separate dirty Next.js checkout under Documents; live site is not serving Next.js routes |
| Not deployed | `listing-system/workers/` | Cloudflare Worker config is experimental/template-level and must not be deployed to apex without an architecture decision |
| Separate project | `malickland.cloud` | OpenClaw/trading infrastructure; not the MalickLand real estate website |

## Active Repair

Branch: `fix/public-navigation-links`

Purpose:
- Serve `app/*.html` pages without requiring the `.html` suffix.
- Make `/listings` resolve to `app/listings.html`.
- Make `/37-advent` resolve to `app/37-advent.html`.
- Redirect `/advent-drive-land-hampshire-county-wv` to `/37-advent`.

Production symptoms observed before merge:
- `/api/health` returns 200.
- `/listings` returns 404 while `/listings.html` returns 200.
- `/37-advent` returns 404 while `/37-advent.html` returns 200.

Local validation on the repair branch passed:
- `cd api && npm ci`
- `node --check server.js middleware/auth.js routes/admin.js routes/api.js routes/public.js`
- `node tests/verify-security-fixes.test.js` — 48/48
- `PREFLIGHT_PORT=43137 bash scripts/preflight.sh`
- Local route smoke: `/37-advent` 200 and legacy Advent SEO URL 301 -> `/37-advent`.

## Do Not Use As Source Of Truth

| Path or repo | Reason |
|--------------|--------|
| `/Users/yhyh7/Documents/GitHub/wv-property-intelligence` | Stale clone from earlier consolidation work |
| `/Users/yhyh7/Documents/Documents - Philip's MacBook Pro - 4/GitHub/malickland.net` | Separate Next.js experiment/prototype, not current production |
| `/Users/yhyh7/Projects/wv-realestate` | Empty/dead checkout at last verification |
| `listing-system/workers/` | Experimental Worker path that would conflict with Railway apex routes if deployed blindly |

## Guardrails

1. For production website fixes, start in `/Users/yhyh7/Projects/wv-property-intelligence`.
2. Compare against `origin/main`; do not trust stale local `main` or old handoff text.
3. Health is `/api/health`, not `/health`.
4. Do not edit the Next.js `malickland.net` repo for production fixes unless a documented architecture decision changes the production stack.
5. Do not run `wrangler deploy` for `listing-system/workers/` without explicit human approval and a recorded route-ownership decision.
6. Before claiming production deployment, verify Railway and run read-only live smoke checks.

## Known Follow-Up

The homepage links `/wv/hampshire-county`, `/wv/hardy-county`, and other county routes, but no matching static pages or Express route currently exists. Track this separately from the public navigation repair.
