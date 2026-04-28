# wv-property-intelligence

[![Open with GitLens](https://img.shields.io/badge/Open%20with-GitLens-blue?logo=gitkraken&logoColor=white)](https://gitkraken.com/gitlens)

WV Property Intelligence - Full-stack real estate platform with app, API, and database layers

## Getting Started

Install the root dependencies:

```bash
npm install
```

Install the API dependencies:

```bash
cd api
npm install
```

Start the Express API from the repo root:

```bash
npm start
```

The API runs on `http://localhost:3000` by default.

## Railway Go-Live Checklist

Set these production env vars before deploying:

- `NODE_ENV=production`
- `DATABASE_PATH=/data/wv_property.db`
- `SESSION_SECRET=<long-random-secret>`
- `ADMIN_PASSWORD=<strong-admin-password>`
- `API_KEY=<long-random-api-key>`
- `SITE_URL=https://malickland.net`

Recommended service integrations:

- `GOOGLE_GMAIL_USER`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_LEADS_TAB`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `LEAD_ALERT_TO_NUMBER`

Railway persistence:

- Create a Railway Volume
- Mount it at `/data`
- Set `DATABASE_PATH=/data/wv_property.db`

Deploy flow:

```bash
railway up
```

After deploy, verify:

- `GET /api/health`
- `GET /properties/advent-dr-hampshire-wv`
- `GET /counties/hampshire`
- submit a test lead on the Advent page
- log into `/admin` and confirm the lead appears in `/admin/leads`

## Container Setup

Build and run with Docker Compose from the repo root:

```bash
docker compose build
docker compose up -d
docker compose logs -f api
```

Stop containers:

```bash
docker compose down
```

### One-command shortcuts

Use either `make` targets:

```bash
make build
make up
make logs
make down
```

or npm scripts:

```bash
npm run container:build
npm run container:up
npm run container:logs
npm run container:down
```

Full clean rebuild:

```bash
make rebuild
# or
npm run container:rebuild
```

Automatic startup (checks Docker, builds if image is missing, starts stack, tails API logs):

```bash
./scripts/dev-up.sh
# or
npm run container:dev-up
```

Automatic shutdown:

```bash
./scripts/dev-down.sh
# or
npm run container:dev-down
```

Optional cleanup flags:

```bash
./scripts/dev-down.sh --volumes   # remove compose volumes
./scripts/dev-down.sh --images    # remove local api image
./scripts/dev-down.sh --all       # volumes + image

# npm shortcuts:
npm run container:dev-down:volumes
npm run container:dev-down:all
```

Full clean restart (stop, remove volumes/image, rebuild if needed, start, tail logs):

```bash
./scripts/dev-reset.sh
# or
npm run container:dev-reset
```

### Common Container Issues

- `docker.sock: ... no such file or directory` means the Docker daemon is not running.
  - Start Docker Desktop (or your local Docker service), then rerun the compose commands.
- If bind-mount directories are missing, create them in the repo root:
  - `database`, `listings`, `uploads`, `reports`

## Routes

- `GET /hello` returns a simple JSON greeting from the Express server.
- `GET /api/health` returns the API health status.
## Project Context

- `CONTEXT.md` contains the master MalickLand business, product, and operations context for this repository.
- `.github/copilot-instructions.md` tells AI coding assistants to load and follow `CONTEXT.md` before generating code, prompts, or workflow logic.
- `AGENTS.md` provides the same repo-level context guidance for tools that automatically read agent instruction files.
