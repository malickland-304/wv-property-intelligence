# Security Policy

## Supported Versions

Only the latest release on the `main` branch receives security fixes.

| Version | Supported |
| ------- | --------- |
| `main` (latest) | ✅ |
| Older commits / branches | ❌ |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

To report a security issue, email **phil@malickland.net** with:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept (if available)
- The affected file(s) or endpoint(s)

You can expect an acknowledgement within **2 business days** and a resolution or status update within **7 business days**.

## Scope

This policy covers the WV Property Intelligence platform, including:

- The Node.js/Express API (`api/server.js`) and all routes under `/api/*` and `/admin/*`
- The vanilla JS frontend (`app/`)
- File upload handling and stored uploads
- Session, CSRF, and API-key authentication mechanisms
- The SQLite database and any data it contains

Out of scope: third-party platform infrastructure (Hostinger VPS host, the dormant Railway twin, Cloudflare DNS, GitHub Actions), dependencies maintained by their own upstream projects.

## Preferred Languages

Reports in **English** are preferred.

---

## Operational Security — Production Secrets

Production secrets live in the **Hostinger VPS** `.env` at `/docker/wv-property-intelligence/.env` (`SESSION_SECRET`, `ADMIN_PASSWORD`, `API_KEY`, `RESEND_API_KEY`, Google OAuth tokens, and any Twilio credentials).

- **Never `cat`, `echo`, or otherwise print the `.env`** (or any single secret value) in recorded/screen-shared terminals, CI logs, or any environment where output may be captured or retained.
- Manage secrets by editing the file over SSH (or the Hostinger panel), then restart the container (`docker compose up -d`) to apply.
- Any agent that prints a production secret value must treat the session as potentially compromised and stop immediately per the AGENTS.md Autonomous Safety Stop Rule.

### Dormant Railway twin

The legacy Railway service (`alert-laughter` / `wv-property-intelligence`) is no longer the live target but may still hold a copy of these secrets until decommissioned. The `railway variables` CLI command prints **all** env values verbatim — do **not** run it in recorded/CI/captured terminals; use the Railway dashboard (`app.railway.app`) for any review. When rotating a production secret, also rotate or retire it on the Railway twin.
