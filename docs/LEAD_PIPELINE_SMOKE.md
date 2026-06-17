# Lead Pipeline Smoke Checklist

Use this after a lead-pipeline deploy or when diagnosing delivery. Do not print secret values.

## Preconditions

- Phil explicitly approved the production smoke.
- `malickland.net` is expected to point to the Hostinger VPS.
- The VPS app should be at the approved `origin/main` SHA.

## Read-only checks

```bash
dig +short malickland.net A
curl -fsS https://malickland.net/api/health
ssh root@31.97.58.203 'cd /docker/wv-property-intelligence/src && git rev-parse HEAD'
ssh root@31.97.58.203 'docker ps --filter name=wv-property-intelligence --format "{{.Names}} {{.Status}}"'
ssh root@31.97.58.203 'for k in RESEND_API_KEY FROM_EMAIL NOTIFICATION_EMAIL; do docker inspect --format "{{range .Config.Env}}{{println .}}{{end}}" wv-property-intelligence | grep -q "^${k}=" && echo "${k}=present" || echo "${k}=missing"; done'
```

Expected:

- DNS returns `31.97.58.203`.
- `/api/health` returns `{"status":"ok",...}`.
- VPS SHA matches the approved deploy SHA.
- Container is healthy.
- Resend-related env keys are present.

## Controlled live lead test

Only run with Phil approval. Submit one clearly labeled test lead through the live public form or an equivalent same-origin request. Do not use real customer data.

Expected evidence:

- HTTP response is `201`.
- `contacts` count increases by one.
- Logs include a Resend send success, for example `[Resend] email sent`.
- Resend event log shows `Delivered` to `phil@malickland.net`.
- Remove the test contact row after evidence is captured, only with Phil approval.

## Do not claim done unless

- The row was saved.
- Resend accepted and delivered the email.
- Phil confirms inbox receipt, or Resend delivery logs are captured as the authoritative delivery signal.
