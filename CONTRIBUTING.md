# Contributing to WV Property Intelligence

Thanks for helping improve this repository.

## Local development

1. Use Node.js 20 LTS.
2. Install API dependencies:
   ```bash
   cd api
   npm ci
   ```
3. Create local env file:
   ```bash
   cp .env.example .env
   ```
4. Start locally:
   ```bash
   npm run dev
   ```

## Verification expectations

Before opening or updating a PR, run:

```bash
cd api && npm test
node tests/verify-security-fixes.test.js
bash scripts/preflight.sh
```

If a command fails because your local environment is not fully installed/configured, include that context in the PR notes.

## PR hygiene

- Keep PRs focused and small.
- Include a clear summary of what changed and how it was verified.
- Link related issue(s) and call out any follow-up work.
- Do not commit secrets or `.env` files.

## Maintainer decision required: required PR reviews

Branch protection changes are a maintainer decision.  
Current recommendation before enabling required reviews:

1. Decide minimum approvals (suggested baseline: `1`).
2. Decide whether maintainers can bypass in emergencies.
3. Confirm this will not block urgent production fixes for the current team size.

Document that decision in `DECISIONS.md` before changing branch protection settings.

## Production-safe smoke validation (non-mutating only)

Production smoke checks must stay non-mutating (read-only `GET` requests).  
Use the existing script:

```bash
bash scripts/smoke-prod.sh https://malickland.net
```

Current smoke path coverage:
- `GET /api/health`
- `GET /api/properties/advent-dr-hampshire-wv`
- `GET /properties/advent-dr-hampshire-wv`

Do not use create/update/delete endpoints for production smoke checks.

## Deployment health confirmation (Railway/main)

After operational PR merges (including PR #84 disposition and similar changes), maintainers should:

1. Confirm the latest Railway deployment is for `main` and is successful.
2. Run the non-mutating production smoke command above.
3. If smoke fails, open/track a follow-up issue immediately and avoid claiming production healthy until resolved.

## Stale issue/PR policy cadence

Until automation is enabled, use this manual cadence:

- Weekly triage (recommended every Monday): review open issues/PRs for inactivity.
- Mark items as stale when there has been no meaningful update for 14+ days.
- Close stale items after an additional 7 days with no response.
- Exempt security, incident, and actively blocked items (label or note the reason).

If a stale bot is later enabled, update this file with the automation rules and grace periods.
