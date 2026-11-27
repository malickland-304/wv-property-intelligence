#!/usr/bin/env bash
# Local dev server that works in any checkout, including fresh Claude Code worktrees.
# Used by .claude/launch.json. Sets up what a fresh checkout is missing, then starts
# api/server.js:
#   1. picks Node 24, 22 or 20.12+ (DEV_NODE overrides). better-sqlite3 has prebuilt
#      binaries for these; on other majors npm falls back to a slow C++ build.
#   2. runs `npm ci` with THAT Node's npm when api/node_modules is missing, or was
#      installed for another Node ABI, platform/arch or package-lock.json, and
#      checks that better-sqlite3 loads before recording the install as done.
#   3. creates a gitignored, mode-600 api/.env with random local-only secrets when
#      none exists. An existing api/.env is never touched.
#
# Configuration comes from api/.env only. `npm ci` and the server both run with a minimal
# environment (PATH, HOME, PORT and a few locale/proxy basics), so integration
# keys exported in the launching shell (INQUIRY_WEBHOOK_*, RESEND_API_KEY,
# GOOGLE_*, ...) never reach it. It runs from api/, so the app's own dotenv call
# re-reads api/.env rather than a root .env. NODE_ENV is always development.
# Lead forwarding and email are therefore off unless api/.env itself sets them.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

die() { echo "dev-server: $*" >&2; exit 1; }

# Succeeds when $1 is an executable Node 24, 22 or 20.12+ (20.6 added --env-file,
# the locked sharp release needs >=20.9, and 20.12 added util.parseEnv, which
# reads api/.env below with the same rules as --env-file).
node_ok() {
  [ -n "$1" ] && [ -x "$1" ] || return 1
  [ "$("$1" -p 'const [a, b] = process.versions.node.split(".").map(Number);
    a === 24 || a === 22 || (a === 20 && b >= 12) ? "ok" : "no"' 2>/dev/null || true)" = ok ]
}

pick_node() {
  local c major prefix
  node_ok /usr/local/bin/node && { echo /usr/local/bin/node; return 0; }
  for major in 24 22 20; do
    for prefix in /opt/homebrew /usr/local; do
      c="$prefix/opt/node@$major/bin/node"; node_ok "$c" && { echo "$c"; return 0; }
    done
    # Unmatched globs stay literal and fail node_ok.
    for c in "$HOME"/.local/share/fnm/node-versions/v"$major".*/installation/bin/node \
             "$HOME"/.nvm/versions/node/v"$major".*/bin/node; do
      node_ok "$c" && { echo "$c"; return 0; }
    done
  done
  c="$(command -v node 2>/dev/null || true)"
  node_ok "$c" && { echo "$c"; return 0; }
  return 1
}

if [ -n "${DEV_NODE:-}" ]; then
  node_ok "$DEV_NODE" || die "DEV_NODE=$DEV_NODE is not an executable Node 24, 22 or 20.12+."
  NODE="$DEV_NODE"
else
  NODE="$(pick_node)" || die "no Node 24, 22 or 20.12+ found. Install Node 24 LTS or set DEV_NODE=/path/to/node."
fi
NODE_DIR="$(dirname "$NODE")"
export PATH="$NODE_DIR:$PATH"
echo "dev-server: using $NODE ($("$NODE" -v), ABI $("$NODE" -p 'process.versions.modules'))"

# One setup at a time per checkout: two first starts must not run `npm ci` into
# the same node_modules, or both write api/.env. Released before the server starts.
LOCK="${TMPDIR:-/tmp}/wv-dev-server-$(printf '%s' "$ROOT" | cksum | cut -d' ' -f1).lock"
waited=0
until mkdir "$LOCK" 2>/dev/null; do
  holder="$(cat "$LOCK/pid" 2>/dev/null || true)"
  if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
    # Stale lock (its holder is gone). Take it over under a second lock so two
    # waiters can't both remove it, and re-check the PID so a lock that another
    # waiter has just re-created is left alone.
    if mkdir "$LOCK.takeover" 2>/dev/null; then
      [ "$(cat "$LOCK/pid" 2>/dev/null || true)" = "$holder" ] && rm -rf "$LOCK"
      rmdir "$LOCK.takeover"
    fi
    continue
  fi
  [ "$waited" -ge 300 ] && die "another dev-server setup has held $LOCK for 5 minutes. If none is running, remove it (and $LOCK.takeover if present)."
  [ "$waited" -eq 0 ] && echo "dev-server: waiting for another dev-server setup in this checkout..."
  sleep 1; waited=$((waited + 1))
done
echo $$ > "$LOCK/pid"
ENV_TMP=""
cleanup() { [ -n "$ENV_TMP" ] && rm -f "$ENV_TMP"; rm -rf "$LOCK"; }
trap cleanup EXIT

# Minimal, explicit environment for `npm ci` (whose dependency install scripts
# run code) and for the server: integration keys in the launching shell reach
# neither.
base_env=(PATH="$PATH" HOME="$HOME")
for v in TMPDIR USER LOGNAME SHELL TERM LANG LC_ALL TZ NO_COLOR FORCE_COLOR \
         HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy \
         NODE_USE_SYSTEM_CA NODE_EXTRA_CA_CERTS SSL_CERT_FILE SSL_CERT_DIR; do
  [ -n "${!v:-}" ] && base_env+=("$v=${!v}")
done

# Install stamp: Node ABI + platform/arch + lockfile hash. Written only after
# `npm ci` succeeds AND better-sqlite3 loads, so an incomplete install is
# retried on the next start.
STAMP="api/node_modules/.dev-install-stamp"
WANT="$("$NODE" -p 'const c = require("crypto"), fs = require("fs");
  [process.versions.modules, process.platform, process.arch,
   c.createHash("sha256").update(fs.readFileSync("api/package-lock.json")).digest("hex").slice(0, 16)].join("-")')"
if [ ! -d api/node_modules ] || [ "$(cat "$STAMP" 2>/dev/null || true)" != "$WANT" ]; then
  echo "dev-server: installing api dependencies (npm ci) for this Node and lockfile..."
  # Plus npm settings that carry no credentials, in either case npm accepts.
  # Left out on purpose: auth (_auth*, *token*, *password*), because npm hands its
  # environment to dependency install scripts, and install-changing flags such
  # as ignore_scripts.
  npm_env=("${base_env[@]}")
  for k in registry cache cafile strict_ssl proxy https_proxy noproxy prefer_offline fetch_retries; do
    for v in "npm_config_$k" "NPM_CONFIG_$(printf '%s' "$k" | tr '[:lower:]' '[:upper:]')"; do
      if [ -n "${!v:-}" ]; then npm_env+=("$v=${!v}"); fi
    done
  done
  (cd api && env -i "${npm_env[@]}" "$NODE_DIR/npm" ci --no-audit --no-fund)
  # `npm ci` can succeed without building better-sqlite3's native binding, for
  # example with ignore-scripts set in ~/.npmrc. Record the install only once it loads.
  (cd api && env -i "${base_env[@]}" "$NODE" -e "require('better-sqlite3')(':memory:').close()") ||
    die "npm ci finished, but better-sqlite3 does not load with $NODE (was its native build skipped, e.g. ignore-scripts in your npm config?). Install not recorded; fix that and start again."
  echo "$WANT" > "$STAMP"
fi

if [ ! -f api/.env ]; then
  echo "dev-server: no api/.env, creating one with random local-only secrets (gitignored)"
  rand() { "$NODE" -e "process.stdout.write(require('crypto').randomBytes($1).toString('hex'))"; }
  # Plain assignments, so a failing rand stops the script (errexit) instead of
  # writing an empty value.
  session_secret="$(rand 32)"; admin_password="$(rand 12)"; api_key="$(rand 24)"
  for v in "$session_secret" "$admin_password" "$api_key"; do
    [ "${#v}" -ge 24 ] || die "could not generate local secrets; api/.env not created."
  done
  ENV_TMP="api/.env.tmp.$$"
  ( umask 077
    printf '%s\n' "# Local development only. Generated by scripts/dev-server.sh." \
      "SESSION_SECRET=$session_secret" "ADMIN_PASSWORD=$admin_password" \
      "API_KEY=$api_key" "NODE_ENV=development" > "$ENV_TMP" )
  mv "$ENV_TMP" api/.env   # atomic rename: api/.env is either absent or complete
  ENV_TMP=""
  unset session_secret admin_password api_key
  echo "dev-server: admin password (ADMIN_PASSWORD) and Bearer key for protected /api routes (API_KEY) are in api/.env"
fi

cleanup; trap - EXIT

# Server: the same minimal environment plus PORT; everything else comes from api/.env.
server_env=("${base_env[@]}" NODE_ENV=development DOTENV_CONFIG_QUIET=true)
[ -n "${PORT:-}" ] && server_env+=("PORT=$PORT")
# Relative DATABASE_PATH / LISTINGS_ROOT in api/.env (api/.env.example ships
# ./database/...) have always meant "from the repo root". The server now runs
# from api/, so pass them as absolute paths; the environment wins over --env-file.
# util.parseEnv applies the same rules as --env-file (quotes, inline # comments).
resolved="$("$NODE" -e '
  const fs = require("fs"), path = require("path"), root = process.argv[1];
  const env = require("util").parseEnv(fs.readFileSync("api/.env", "utf8"));
  for (const k of ["DATABASE_PATH", "LISTINGS_ROOT"]) {
    const v = env[k];
    if (!v || path.isAbsolute(v)) continue;
    if (/[\n\0]/.test(v)) { console.error("dev-server: " + k + " in api/.env has a line break"); process.exit(1); }
    console.log(k + "=" + path.join(root, v));
  }' "$ROOT")"
while IFS= read -r kv; do if [ -n "$kv" ]; then server_env+=("$kv"); fi; done <<< "$resolved"
cd api
exec env -i "${server_env[@]}" "$NODE" --env-file=.env server.js
