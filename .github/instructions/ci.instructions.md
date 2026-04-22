---
applyTo: ".github/workflows/**"
---

# CI rules (applies to .github/workflows/**)

- All workflows must run on ubuntu-latest.
- Use actions/checkout@v4 for checkout steps.
- API docs consistency check (.github/workflows/api-docs-consistency.yml) is required — do not remove or disable it.
- Do not add workflows that bypass branch protection or skip required status checks.
- Secrets must be referenced via ${{ secrets.SECRET_NAME }} — never hardcoded.
- New CI jobs that parse routes should grep api/routes/*.js — routes are no longer defined inline in api/server.js.
