#!/usr/bin/env bash
# Online SQLite backup into $ARCUEX_DATA_DIR/backups. Never prints DB contents.
set -euo pipefail

DATA_DIR="${ARCUEX_DATA_DIR:-/data}"
DB_PATH="${ARCUE_X_SQLITE_PATH:-$DATA_DIR/arcuex.sqlite}"
BACKUP_DIR="${ARCUEX_BACKUP_DIR:-$DATA_DIR/backups}"
KEEP="${ARCUEX_BACKUP_KEEP:-48}"

if [[ ! -f "$DB_PATH" ]]; then
  echo "backup: database file not found at configured path" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dest="$BACKUP_DIR/manual-$stamp.sqlite"

sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(PASSIVE);" >/dev/null
sqlite3 "$DB_PATH" ".backup '$dest'"
sha256sum "$dest" | awk '{print $1}' > "$dest.sha256"

ls -1t "$BACKUP_DIR"/manual-*.sqlite 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old" "$old.sha256"
done

echo "backup: wrote snapshot and checksum"
