# CANONICAL_MAP.md — MalickLand Production Map

> Last verified: 2026-06-17 by Codex using read-only DNS/curl, GitHub, and VPS probes.
> Use this file to prevent repo, domain, and stack confusion before touching MalickLand production work.

## Canonical Truth

| Layer | Current truth | Evidence |
|-------|---------------|----------|
| Live domain | `https://malickland.net` | DNS resolves to `31.97.58.203`; responses are served by the Hostinger VPS |
| Production stack | Express 5 monolith: `api/` JSON + `app/` static HTML, Docker Compose, Traefik, Let's Encrypt | `/docker/wv-property-intelligence/compose.yml`, `api/Dockerfile`, `api/server.js`, live `/api/health` |
| Production repo | `malickland-304/wv-property-intelligence` | `origin` in `/Users/yhyh7/Projects/wv-property-intelligence` |
| Production branch | `origin/main` | `origin/main` at `b9d1198` on 2026-06-17 (PR #97 merged) |
| Canonical local checkout | `/Users/yhyh7/Projects/wv-property-intelligence` | Use this checkout only; run `git fetch origin --prune` and compare against `origin/main` before work |
| Health URL | `https://malickland.net/api/health` | Live probe returned 200 JSON on 2026-06-17 |
| Production data | SQLite on Docker volume `wv-property-intelligence_wv-data` mounted at `/data` | VPS container `wv-property-intelligence` |
| Lead notifications | Resend from `noreply@updates.malickland.net` to `phil@malickland.net` | PR #97, VPS startup `Resend configured: true`, Resend delivery logs confirmed delivered test messages |
| Legacy twin | Railway origin `https://wv-property-intelligence-production.up.railway.app` | Separate DB; audit before standby/shutdown decision |
| Not production | `malickland-304/malickland.net` | Separate dirty Next.js checkout under Documents; live site is not serving Next.js routes |
| Not deployed | `listing-system/workers/` | Cloudflare Worker config is experimental/template-level and must not be deployed to apex without an architecture decision |
| Separate project | `malickland.cloud` | OpenClaw/trading infrastructure; not the MalickLand real estate website |

## Public Navigation Repair (PR #76 — merged)

Branch `fix/public-navigation-links` merged into `main` @ `dc8cc53` (2026-05-31); branch deleted remotely.

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

Production smoke after merge passed on 2026-05-31:
- `/api/health` -> 200 JSON.
- `/listings` -> 200 HTML.
- `/37-advent` -> 200 HTML.
- `/advent-drive-land-hampshire-county-wv` -> 301 to `/37-advent`.

## Cursor Workspace Guardrails (PR #77 — merged)

PR #77 merged into `main` @ `b34e2fb` (2026-05-31).

Purpose:
- Track `.cursor/rules/malickland-canonical-workspace.mdc` in the canonical repo.
- Keep external-assistant handoff guidance in tracked repo files.
- Prevent future agents from treating stale checkouts or `openclaw-system` as the production website workspace.

## Do Not Use As Source Of Truth

| Path or repo | Reason |
|--------------|--------|
| `/Users/yhyh7/Documents/GitHub/wv-property-intelligence` | Stale clone from earlier consolidation work |
| `/Users/yhyh7/Documents/Documents - Philip's MacBook Pro - 4/GitHub/malickland.net` | Separate Next.js experiment/prototype, not current production |
| `/Users/yhyh7/Projects/wv-realestate` | Empty/dead checkout at last verification |
| `listing-system/workers/` | Experimental Worker path that would conflict with VPS/Traefik apex routes if deployed blindly |

## Guardrails

1. For production website fixes, start in `/Users/yhyh7/Projects/wv-property-intelligence`.
2. Compare against `origin/main`; do not trust stale local `main` or old handoff text.
3. Health is `/api/health`, not `/health`.
4. Do not edit the Next.js `malickland.net` repo for production fixes unless a documented architecture decision changes the production stack.
5. Do not run `wrangler deploy` for `listing-system/workers/` without explicit human approval and a recorded route-ownership decision.
6. Before claiming production deployment, verify GitHub `origin/main`, live VPS SHA, container health, and read-only live smoke checks.

## Known Follow-Up

Known follow-ups:
- Audit the Railway twin database for any leads not present on the VPS before deciding standby vs shutdown.
- Keep `docs/LEAD_PIPELINE_SMOKE.md` current with the manual post-deploy lead verification path.
