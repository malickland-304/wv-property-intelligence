#!/usr/bin/env bash
# Nightly WAL-safe SQLite backup for the production container.
# Uses SQLite's online backup API (never a raw file copy: the DB runs in WAL mode),
# verifies the copy (integrity_check + row counts), compresses it, writes a checksum,
# and prunes backups older than KEEP_DAYS. Exits non-zero on any failure.
#
# Install on the VPS (host cron, as root):
#   Copy this file to /docker/wv-property-intelligence/backup-db.sh (mode 700; the checkout in src/ is a
#   detached commit, so cron points at the stable copy), then add /etc/cron.d/wv-db-backup:
#   17 3 * * * root /docker/wv-property-intelligence/backup-db.sh >> /var/log/wv-db-backup.log 2>&1
#
# Restore drill (do NOT restore over live data unless the live DB is damaged):
#   gunzip -c backups/wv_property-<ts>.db.gz > /tmp/restore-test.db
#   sqlite3 /tmp/restore-test.db 'pragma integrity_check;'   # or via better-sqlite3 in the container
set -euo pipefail

CONTAINER="${CONTAINER:-wv-property-intelligence}"
DB_PATH="${DB_PATH:-/data/wv_property.db}"
DEST="${BACKUP_DIR:-/docker/wv-property-intelligence/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
tmp_in_container="/data/.backup-${ts}.db"
out="${DEST}/wv_property-${ts}.db"

umask 077
mkdir -p "$DEST"

cleanup() { docker exec "$CONTAINER" rm -f "$tmp_in_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Backup + verification run inside the container, where better-sqlite3 already exists.
summary="$(docker exec -i -e SRC="$DB_PATH" -e OUT="$tmp_in_container" "$CONTAINER" node - <<'JS'
const D = require('/workspace/api/node_modules/better-sqlite3');
(async () => {
  const src = new D(process.env.SRC, { readonly: true });
  await src.backup(process.env.OUT);
  src.close();
  const b = new D(process.env.OUT, { readonly: true });
  const integrity = b.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') { console.error('integrity_check failed: ' + integrity); process.exit(1); }
  const counts = {};
  for (const t of ['properties', 'contacts', 'counties']) {
    counts[t] = b.prepare('select count(*) c from ' + t).get().c;
  }
  b.close();
  console.log(JSON.stringify({ integrity, counts }));
})().catch((e) => { console.error(e); process.exit(1); });
JS
)"

docker cp "${CONTAINER}:${tmp_in_container}" "$out"
gzip -9 "$out"
( cd "$DEST" && sha256sum "$(basename "$out").gz" > "$(basename "$out").gz.sha256" )

# Retention
find "$DEST" -maxdepth 1 -type f \( -name 'wv_property-*.db.gz' -o -name 'wv_property-*.db.gz.sha256' \) -mtime +"$KEEP_DAYS" -delete

size="$(du -h "${out}.gz" | cut -f1)"
echo "$(date -u +%FT%TZ) backup ok file=$(basename "$out").gz size=${size} ${summary}"
