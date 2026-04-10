#!/usr/bin/env sh

set -eu

ensure_docker() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if [ "$(uname -s)" = "Darwin" ]; then
    echo "Docker is not running. Launching Docker Desktop..."
    open -a Docker >/dev/null 2>&1 || true

    i=0
    while [ "$i" -lt 60 ]; do
      if docker info >/dev/null 2>&1; then
        echo "Docker daemon is ready."
        return 0
      fi
      i=$((i + 1))
      sleep 2
    done
  fi

  echo "Docker is not running. Start Docker Desktop (or daemon) and rerun."
  exit 1
}

echo "==> Checking Docker daemon..."
ensure_docker

mkdir -p database listings uploads reports

if ! docker image inspect wv-property-intelligence-api:local >/dev/null 2>&1; then
  echo "==> API image not found. Building..."
  docker compose build
fi

echo "==> Starting containers..."
docker compose up -d

echo "==> Tailing API logs (Ctrl+C to stop logs, containers keep running)..."
docker compose logs -f api
