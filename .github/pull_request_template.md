## What changed and why

<!-- Be specific. "Updated X" is not enough. Explain what behavior changed and what motivated it. -->

## Closes

<!-- Required when a GitHub issue exists. -->
Closes #

## Scope

**Files changed:**
<!-- List the files this PR touches -->

**What is NOT changed:**
<!-- Explicit out-of-scope statement prevents reviewer confusion -->

## How to validate

```bash
cd api && npm ci
node --check server.js
cd ..
bash scripts/preflight.sh
# If CSRF-sensitive: ADMIN_PASSWORD=<pw> ./scripts/smoke-admin.sh
```

<!-- Add any additional validation steps specific to this change -->

## QC Checklist (required before merge)

- [ ] No direct push to `main` — this is a PR
- [ ] Branch is up to date with `main`
- [ ] All required CI checks are green (CodeQL, preflight, verify, CodeScan)
- [ ] `npm audit` shows 0 critical/high vulnerabilities
- [ ] No hardcoded secrets, passwords, or tokens introduced
- [ ] No Railway environment variables modified
- [ ] No production database mutations in tests
- [ ] Scope is limited to what's described above
- [ ] `docs/agent-handoff.md` updated if this changes production state or architecture

## Agent notes (if AI-implemented)

<!-- Which agent implemented this? What was explicitly out of scope? Any unresolved questions? -->
