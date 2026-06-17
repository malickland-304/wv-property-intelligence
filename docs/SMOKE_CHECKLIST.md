# Lead Pipeline — Manual Smoke Checklist

> Verifies the full **lead capture → email notification** path on production after a deploy or any change to `api/routes/api.js`, `api/routes/leads.js`, `api/services/email.js`, `api/services/leadNotifications.js`, or the Resend env vars.
>
> ⚠️ **This smoke is deliberately mutating.** Unlike `scripts/smoke-prod.sh` (read-only GET), submitting a lead **creates a real `contacts` row and sends a real email** that counts against the Resend quota. Use an obvious test payload and **delete the test row afterward**.
>
> Production = Hostinger VPS (`31.97.58.203`), Docker + Traefik — see `docs/CANONICAL_MAP.md`. Never print or paste secret values.

---

## Pipeline at a glance (verified 2026-06-17)

| Stage | Where | Evidence to look for |
|-------|-------|----------------------|
| Capture (homepage form + chat widget) | `POST /api/contacts` → `sendLeadNotification()` (`api/routes/api.js`, `api/services/email.js`) | HTTP `201`; new row in `contacts` |
| Capture (37-advent / property leads) | `POST /api/leads` → `sendLeadNotificationEmail()` (`api/routes/leads.js` → `api/services/leadNotifications.js`) | HTTP `201`; new row in `leads` |
| Provider | Resend (single provider) — `RESEND_API_KEY` | Startup log `[Startup] Resend configured: true` |
| Notify | email to `NOTIFICATION_EMAIL` from `FROM_EMAIL` | Send log `[Resend] email sent → phil@malickland.net`; Resend dashboard **Delivered** |

Guards on `/api/contacts`: `requireLeadJson` (JSON only) + `requireLeadSameOrigin` (Origin/Referer must be the site) + `contactsRateLimit`.

---

## 0. Preconditions

- [ ] Container healthy: `ssh root@31.97.58.203 'docker ps --filter name=wv-property-intelligence --format "{{.Status}}"'` → `Up ... (healthy)`
- [ ] Provider configured (no secrets printed): `ssh root@31.97.58.203 'docker logs wv-property-intelligence 2>&1 | grep "\[Startup\] Resend configured"'` → `true`
  - If `false`: `RESEND_API_KEY` is missing from `/docker/wv-property-intelligence/.env` — fix and redeploy before continuing.
- [ ] Recipient + sender are set (names only, not values): confirm `NOTIFICATION_EMAIL` and `FROM_EMAIL` keys exist in the VPS `.env`.

## 1. Submit a test lead

**Option A — real user path (preferred):** open <https://malickland.net>, use the homepage contact form (or the "MalickLand Assistant" chat → lead handoff) with a clearly-marked test value, e.g. name `SMOKE TEST <date>`, email `smoketest+<date>@example.com`. Expect the form's success state (frontend gates on `response.ok`).

**Option B — operator/headless (same-origin curl):**
```bash
curl -sS -i -X POST https://malickland.net/api/contacts \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://malickland.net' \
  -H 'Referer: https://malickland.net/' \
  -d '{"name":"SMOKE TEST","email":"smoketest+YYYYMMDD@example.com","phone":"","message":"automated lead pipeline smoke — please ignore"}'
```
- [ ] Response is `201` (a `400/403` means a guard rejected it — check `Content-Type` and `Origin`/`Referer`).

## 2. Confirm capture (persistence)

- [ ] Read back via the API-key-protected read route (no DB access needed):
  ```bash
  curl -sS https://malickland.net/api/contacts -H "X-API-Key: $API_KEY" | tail
  ```
  (supply `$API_KEY` from the VPS `.env` at runtime; do not echo it). The test row should be present with the expected `email` and `source`.

## 3. Confirm notification (delivery)

- [ ] Send log present: `ssh root@31.97.58.203 'docker logs --since 10m wv-property-intelligence 2>&1 | grep "\[Resend\]"'` → `[Resend] email sent → phil@malickland.net`
  - `[Resend] send failed: …` → read the error (bad key / unverified sender / invalid recipient).
  - `[email] send skipped: …` → `RESEND_API_KEY` or `NOTIFICATION_EMAIL` not configured.
- [ ] Resend dashboard (account `malickland@icloud.com`) → **Emails**: the test shows **Delivered** (sender domain `updates.malickland.net` should be Verified).
- [ ] Phil's inbox (`phil@malickland.net`) received it (check spam on first run).

## 4. Clean up (required)

- [ ] Delete the test `contacts` row so it does not pollute real leads. Inside the container, from the app working directory, via a `better-sqlite3` one-liner (or `sqlite3` if installed):
  ```bash
  ssh root@31.97.58.203 'docker exec -w /workspace/api wv-property-intelligence \
    node -e "const db=require(\"better-sqlite3\")(process.env.DATABASE_PATH); \
    console.log(db.prepare(\"DELETE FROM contacts WHERE email LIKE ?\").run(\"smoketest+%@example.com\"));"'
  ```
  (Confirm the app's working directory with `docker inspect` if `/workspace/api` does not resolve.)
- [ ] Re-run the step-2 read to confirm the test row is gone.

## Notes

- **Quota/cost:** Resend free tier is 3,000/mo and 100/day — far above lead volume; a few smoke sends are negligible, but don't loop them.
- **Rollback:** if a deploy broke the pipeline, re-checkout the prior SHA on the VPS and `docker compose build && up` (see `docs/CANONICAL_MAP.md` → manual deploy / rollback).
- **Truthfulness:** record only steps actually run, with their real output (AGENTS.md Verification Truthfulness Rule). Append the result to `WORK_LOG.md`.
