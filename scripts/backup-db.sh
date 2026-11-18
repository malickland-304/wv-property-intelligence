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
DEST="${BACKUP_DIR:-/docker/wv-property-intelligence/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
LOCK_FILE="${LOCK_FILE:-/run/lock/wv-db-backup.lock}"

fail() { echo "$(date -u +%FT%TZ) backup FAILED: $*" >&2; exit 1; }

# One run at a time (cron overlap, or a manual run during the nightly one).
exec 9>"$LOCK_FILE" || fail "cannot open lock $LOCK_FILE"
flock -n 9 || fail "another backup is already running"

# Back up the database the container actually uses. DB_PATH may be set to pin it,
# but it must match the container's DATABASE_PATH.
container_env="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER")" \
  || fail "cannot inspect container $CONTAINER"
container_db="$(printf '%s\n' "$container_env" | sed -n 's/^DATABASE_PATH=//p' | head -n1)"
unset container_env   # holds the container's secrets; keep it no longer than needed
if [ -n "${DB_PATH:-}" ] && [ -n "$container_db" ] && [ "$DB_PATH" != "$container_db" ]; then
  fail "DB_PATH=$DB_PATH does not match the container's DATABASE_PATH=$container_db"
fi
DB_PATH="${DB_PATH:-${container_db:-/data/wv_property.db}}"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
tmp_in_container="/data/.backup-${ts}-$$.db"
out="${DEST}/wv_property-${ts}.db"

# Backups hold customer contact details: private directory, private files.
umask 077
if [ -L "$DEST" ]; then fail "$DEST is a symlink"; fi
mkdir -p "$DEST"
[ "$(stat -c %u "$DEST")" = "$(id -u)" ] || fail "$DEST is not owned by $(id -un)"
chmod 700 "$DEST"
if [ -e "$out" ] || [ -e "${out}.gz" ]; then fail "$out already exists"; fi

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
chmod 600 "$out"            # docker cp keeps the container's file mode
gzip -9 "$out"              # gzip keeps the mode: the .gz is 600 too
chmod 600 "${out}.gz"
# Checksum: write to a fresh private temp file, then rename into place. A rename
# replaces whatever is at the target name (even a planted symlink) instead of
# writing through it.
sum_tmp="$(mktemp "${DEST}/.sha256.XXXXXX")"
( cd "$DEST" && sha256sum "$(basename "$out").gz" ) > "$sum_tmp"
chmod 600 "$sum_tmp"
mv -f "$sum_tmp" "${out}.gz.sha256"

# Retention
find "$DEST" -maxdepth 1 -type f \( -name 'wv_property-*.db.gz' -o -name 'wv_property-*.db.gz.sha256' \) -mtime +"$KEEP_DAYS" -delete

size="$(du -h "${out}.gz" | cut -f1)"
echo "$(date -u +%FT%TZ) backup ok file=$(basename "$out").gz size=${size} ${summary}"
