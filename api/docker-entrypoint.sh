#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
  if [ -d /data ]; then
    mkdir -p /data/listings
    chown -R appuser:appgroup /data
  fi
  exec setpriv --reuid=1001 --regid=1001 --init-groups "$@"
fi

exec "$@"
