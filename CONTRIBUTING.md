# Contributing

Thanks for contributing to WV Property Intelligence.

## Workflow

1. Create a branch from `main`.
2. Keep scope narrow and avoid unrelated edits.
3. Run the required validation before asking for review.
4. Open a pull request and resolve all review conversations before merge.

## Required validation

```bash
cd api && npm ci
cd ..
node tests/verify-security-fixes.test.js
bash scripts/preflight.sh
```

If you are validating production-readiness from a safe environment, use:

```bash
bash scripts/smoke-prod.sh <BASE_URL>
```

## Smoke-test safety

- `scripts/smoke-prod.sh` is read-only. It only performs `GET` requests against `/api/health`, the property API, and the public property page.
- `scripts/smoke-admin.sh` is also designed to stay non-mutating. Its CSRF round-trip posts to a non-existent edit target so auth and CSRF can be verified without creating or updating production data.

## Pull request policy

- Required status checks stay enabled on `main`.
- Required review approval is intentionally not enforced right now because this repository is maintained primarily by a solo owner.
- Even without a required approval rule, every PR should still be self-reviewed, all review comments should be addressed, and all required CI checks should be green before merge.

## Stale work cadence

This repository currently uses a manual hygiene cadence instead of stale-bot automation:

- Review open pull requests at least weekly.
- Review open issues at least monthly.
- Treat pull requests with about 21 days of no progress as stale candidates.
- Treat issues with about 45 days of no progress as stale candidates.
- Before closing stale work, leave a short evidence-based note so the next pass can see why it was closed or deferred.

## Security

Do not open public issues for vulnerabilities. Follow `SECURITY.md` instead.
