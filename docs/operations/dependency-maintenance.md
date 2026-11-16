---
title: Dependency maintenance (api/)
type: operation
created: 2026-11-16
updated: 2026-11-16
sources:
  - code: api/package.json
  - code: api/package-lock.json
  - code: api/Dockerfile
  - code: scripts/preflight.sh
  - code: api/routes/public.js
  - code: tests/http-smoke.test.js
  - code: .github/workflows/nodejs-ci.yml
  - code: .github/dependabot.yml
verified_at: 32b41d8
---

# Dependency maintenance (api/)

How to clear `npm audit` advisories in `api/` without crossing the governance lines in
`AGENTS.md` (no new top-level dependencies without Phil, `npm ci` only, never hand-edit
`api/package-lock.json`). Worked through first in PR #156 (2026-11-16).

## Routine

1. Branch from `origin/main`, then `cd api && npm ci`.
2. `npm audit --json` and, for each advisory, note: installed version, patched version,
   direct or transitive, and whether the patched version fits the range already in
   `api/package.json` (for a transitive one, the range its parent declares).
3. Apply the in-range fixes with `npm update <pkg> [<pkg>...]`. It refreshes the lockfile
   and, unlike `npm install`, does not save to `api/package.json`. Check afterwards that
   `git diff api/package.json` is empty.
4. Re-run `npm audit` **and** `npm audit --omit=dev`. The second is what ships (see below).
5. Run the `AGENTS.md` validation list, every file in `tests/`, and the
   `scripts/preflight.sh` steps.
6. Update the "Dependency advisories" row in `PROJECT_STATE.md` with the new **lockfile**
   versions. They are repo versions, not deployed ones, until VPS proof says otherwise.

> ⚠️ Several production dependencies are pinned to an exact version, not a range:
> `better-sqlite3` (`api/package.json:20`), `express` (`api/package.json:28`) and `sharp`
> (`api/package.json:34`). No lockfile-only command can move them. A fix for one of these
> needs an `api/package.json` change, which is Phil's call. Write it up in the PR with the
> breaking-change risk instead of applying it. (Example: sharp 0.35.4 → 0.35.5 in #156.)

> ⚠️ Do not reach for `npm audit fix` as the default. Even without `--force` it can save
> new ranges into `api/package.json`. When the only clean version is older, it also "fixes"
> by downgrading: for the `minimatch` advisory on the `nodemon` path it proposes moving
> nodemon 3.1.14 back to 3.1.11. Read its `--dry-run` output first, then apply the
> in-range upgrades with `npm update <pkg>`.

> ⚠️ `npm update` only ever moves to the **newest** version a range allows, so it cannot
> apply a downgrade like the nodemon one above. A downgrade means asking for the exact
> older version, and pinning an older dev tool is a dependency change for Phil to approve,
> not part of a lockfile-only fix. In #156 it was left open and written up in the PR.

> ⚠️ The Docker image installs with `npm ci --omit=dev` (`api/Dockerfile:6`), so
> advisories reached only through `nodemon` (dev) never ship. Report both
> `npm audit` and `npm audit --omit=dev` so a reader can tell the two apart.

## Runtime versions

CI and the production image use Node 20 (`.github/workflows/nodejs-ci.yml:20`,
`api/Dockerfile:3`). PR #155 proposes Node 24. If the local machine has a different Node,
say which one the checks ran on. `better-sqlite3` is a native module, so `node_modules`
installed under one Node version does not load under another without a reinstall.

## Running the checks on this Mac

> ⚠️ Every `res.sendFile` in `api/routes/public.js` must keep `{ root: APP_DIR }` and a
> relative file name (`api/routes/public.js:50`, `api/routes/public.js:182`,
> `api/routes/public.js:210`). `send` rejects any path with a dot-segment, and without a
> root it checks the whole absolute path, so a checkout under a dot-directory (for example
> `.claude/worktrees/...`) made `GET /search` and the property page fail (404/500) and
> `tests/http-smoke.test.js` fail there. Fixed in #159 (2026-11-16);
> `tests/verify-security-fixes.test.js` fails if an absolute `sendFile` path comes back.
> Tests now pass from a dot-directory path too.

> ⚠️ `scripts/preflight.sh` cannot run as a whole inside the agent sandbox, because
> `mktemp -d` (`scripts/preflight.sh:17`) is blocked. Run its steps one by one: `npm ls`,
> the `node --check` list, the four test files, then start `node server.js` with the same
> env vars and curl `/api/health`, `/api/properties/advent-dr-lot-hampshire-wv`,
> `/properties/advent-dr-lot-hampshire-wv` and `POST /api/chat`.

> ⚠️ In the sandbox `npm ci` needs `--cache "$TMPDIR/npm-cache"` and network access to
> `registry.npmjs.org`. It also tries `github.com` for prebuilt native binaries; when that
> is blocked, the install still completed in this setup.

## Dependabot

`.github/dependabot.yml` only configures `devcontainers` version updates. The npm PRs it
opens (such as #150) are security updates, and they bump one package at a time. A routine
like the one above usually covers them; say so in the PR and leave closing them to Phil.
