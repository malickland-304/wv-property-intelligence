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

Out of scope: third-party services (Railway, Cloudflare, GitHub Actions), dependencies maintained by their own upstream projects.

## Preferred Languages

Reports in **English** are preferred.
