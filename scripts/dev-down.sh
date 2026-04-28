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

REMOVE_VOLUMES=0
REMOVE_IMAGES=0

for arg in "$@"; do
  case "$arg" in
    --volumes)
      REMOVE_VOLUMES=1
      ;;
    --images)
      REMOVE_IMAGES=1
      ;;
    --all)
      REMOVE_VOLUMES=1
      REMOVE_IMAGES=1
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: ./scripts/dev-down.sh [--volumes] [--images] [--all]"
      exit 1
      ;;
  esac
done

ensure_docker

echo "==> Stopping containers..."
if [ "$REMOVE_VOLUMES" -eq 1 ]; then
  docker compose down -v
else
  docker compose down
fi

if [ "$REMOVE_IMAGES" -eq 1 ]; then
  echo "==> Removing local API image..."
  docker image rm -f wv-property-intelligence-api:local >/dev/null 2>&1 || true
fi

echo "Done."
