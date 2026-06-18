#!/usr/bin/env bash
set -euo pipefail

EXPECTED_DNS_IP="${EXPECTED_DNS_IP:-31.97.58.203}"
SSH_TARGET="${SSH_TARGET:-root@31.97.58.203}"
REMOTE_ROOT="${REMOTE_ROOT:-/docker/wv-property-intelligence}"
REMOTE_SRC="${REMOTE_SRC:-$REMOTE_ROOT/src}"
EXPECTED_SHA="${EXPECTED_SHA:-}"
BASE_URL="${BASE_URL:-https://malickland.net}"
BASE_HOST="${BASE_URL#*://}"
BASE_HOST="${BASE_HOST%%/*}"
BASE_HOST="${BASE_HOST%%:*}"
EXPECTED_HOST="${EXPECTED_HOST:-$BASE_HOST}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=8)

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

need curl
need ssh

if [ -z "$EXPECTED_SHA" ]; then
  fail "EXPECTED_SHA is required for production proof"
fi
if [ "${#EXPECTED_SHA}" -lt 7 ]; then
  fail "EXPECTED_SHA must be at least 7 characters"
fi

if command -v dig >/dev/null 2>&1; then
  dns_ips="$({ dig +short "$EXPECTED_HOST" A 2>/dev/null || true; } | sort -u | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
elif command -v host >/dev/null 2>&1; then
  dns_ips="$({ host "$EXPECTED_HOST" 2>/dev/null || true; } | awk '/has address/ {print $4}' | sort -u | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
else
  fail "need dig or host to verify DNS"
fi

if [ "$dns_ips" != "$EXPECTED_DNS_IP" ]; then
  fail "$EXPECTED_HOST DNS must resolve only to $EXPECTED_DNS_IP; got: ${dns_ips:-<empty>}"
fi

remote_sha="$(ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "git -C '$REMOTE_SRC' rev-parse HEAD")"
remote_short="${remote_sha:0:7}"

if [ "${remote_sha:0:${#EXPECTED_SHA}}" != "$EXPECTED_SHA" ]; then
  fail "VPS source SHA mismatch: expected $EXPECTED_SHA, got $remote_sha"
fi

container_status="$(ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "docker inspect wv-property-intelligence --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}'")"
container_runtime="${container_status%%|*}"
container_health="${container_status#*|}"
if [ "$container_runtime" != "running" ]; then
  fail "container is not running: $container_runtime"
fi
if [ "$container_health" = "no-healthcheck" ]; then
  fail "container has no Docker healthcheck"
fi
if [ "$container_health" != "healthy" ]; then
  fail "container health is not healthy: $container_health"
fi
container_summary="$container_runtime $container_health"

build_proof="$(ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "
  set -euo pipefail
  commit_ts=\$(git -C '$REMOTE_SRC' show -s --format=%ct HEAD)
  image_id=\$(docker inspect wv-property-intelligence --format '{{.Image}}')
  image_created=\$(docker image inspect \"\$image_id\" --format '{{.Created}}')
  image_ts=\$(date -d \"\$image_created\" +%s)
  started_at=\$(docker inspect wv-property-intelligence --format '{{.State.StartedAt}}')
  started_ts=\$(date -d \"\$started_at\" +%s)
  printf '%s|%s|%s|%s|%s\n' \"\$commit_ts\" \"\$image_ts\" \"\$started_ts\" \"\$image_id\" \"\$image_created\"
")"
IFS='|' read -r commit_ts image_ts started_ts image_id image_created <<< "$build_proof"
if [ "$image_ts" -lt "$commit_ts" ]; then
  fail "container image predates source commit; rebuild required (image_created=$image_created, remote_sha=$remote_sha)"
fi
if [ "$started_ts" -lt "$image_ts" ]; then
  fail "container was not started from the current image; recreate required"
fi

health="$(curl -fsS "$BASE_URL/api/health")"
config="$(curl -fsS "$BASE_URL/api/config")"

ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "cd '$REMOTE_SRC' && bash scripts/smoke-prod.sh '$BASE_URL'"

echo "VPS production verified"
echo "dns_host=$EXPECTED_HOST"
echo "dns_ip=$EXPECTED_DNS_IP"
echo "remote_sha=$remote_sha"
echo "remote_short=$remote_short"
echo "container=$container_summary"
echo "image=${image_id#sha256:}"
echo "image_created=$image_created"
echo "health=$health"
echo "config=$config"
