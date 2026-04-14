#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker CLI is not installed or not on PATH."
  exit 1
fi

printf "GitHub username: "
read -r GH_USER

if [ -z "$GH_USER" ]; then
  echo "Username is required."
  exit 1
fi

printf "GitHub PAT (read/write packages): "
stty -echo
read -r GH_PAT
stty echo
printf "\n"

if [ -z "$GH_PAT" ]; then
  echo "PAT is required."
  exit 1
fi

printf "%s" "$GH_PAT" | docker login ghcr.io -u "$GH_USER" --password-stdin

echo "GHCR login complete."
