# Railway Twin Audit Plan

Railway is no longer the current production target for `malickland.net`. It still serves a legacy twin at `https://wv-property-intelligence-production.up.railway.app` with a separate database. Audit it before deciding standby vs shutdown.

## Goal

Determine whether Railway contains any contacts/leads not present on the VPS, without printing secrets or mutating Railway state.

## Preconditions

- Phil authorizes the audit in the current task.
- Railway CLI is authenticated by Phil (`railway login`) or the dashboard is available.
- No `railway variables` raw output is pasted into logs or chat.

## Safe audit steps

1. Confirm the Railway service still responds:

   ```bash
   curl -fsS https://wv-property-intelligence-production.up.railway.app/api/health
   ```

2. Identify how Railway persists SQLite data:

   - Prefer Railway dashboard volume/file inspection if available.
   - If CLI access is used, list only metadata and paths; do not print env values.

3. Count records in the Railway DB:

   - `contacts`: count, first timestamp, last timestamp.
   - `leads`: count, first timestamp, last timestamp.

4. Compare to VPS counts:

   ```bash
   ssh root@31.97.58.203 'docker exec wv-property-intelligence sh -lc "node -e \"const { db } = require(\\\"./db\\\"); for (const t of [\\\"contacts\\\",\\\"leads\\\"]) console.log(t, db.prepare(\\\"select count(*) as c, min(created_at) as first, max(created_at) as last from \\\" + t).get());\""'
   ```

5. If Railway has unique rows:

   - Export only the minimum needed fields.
   - Redact or handle PII carefully.
   - Decide whether to migrate, archive, or discard with Phil approval.

## Decision outcomes

- **Shutdown:** Only after Railway has no unique leads/contacts and no dependency on its origin URL remains.
- **Warm standby:** Document its purpose, DB divergence, and a maintenance owner.
- **Archive:** Export DB backup, store securely, then shut down.

## Hard stops

- Do not run raw `railway variables` in recorded logs.
- Do not mutate Railway env vars, volumes, or database during the audit.
- Do not shut down Railway until Phil approves the specific outcome.
