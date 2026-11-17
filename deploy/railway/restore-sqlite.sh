#!/usr/bin/env bash
# Restore SQLite from a backup snapshot. Sets recovery_hold=1 after restore.
# Usage: arcuex-restore-sqlite /data/backups/manual-YYYYMMDDThhmmssZ.sqlite
set -euo pipefail

DATA_DIR="${ARCUEX_DATA_DIR:-/data}"
DB_PATH="${ARCUE_X_SQLITE_PATH:-$DATA_DIR/arcuex.sqlite}"
SOURCE="${1:-}"

if [[ -z "$SOURCE" || ! -f "$SOURCE" ]]; then
  echo "restore: provide an existing backup .sqlite path" >&2
  exit 1
fi

if [[ -f "$SOURCE.sha256" ]]; then
  expected="$(tr -d '[:space:]' < "$SOURCE.sha256")"
  actual="$(sha256sum "$SOURCE" | awk '{print $1}')"
  if [[ "$expected" != "$actual" ]]; then
    echo "restore: checksum mismatch — refusing restore" >&2
    exit 1
  fi
fi

mkdir -p "$DATA_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ -f "$DB_PATH" ]]; then
  cp -f "$DB_PATH" "$DATA_DIR/pre-restore-$stamp.sqlite"
fi

# Replace primary DB and remove WAL/SHM sidecars so SQLite opens a clean main file.
rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
cp -f "$SOURCE" "$DB_PATH"

sqlite3 "$DB_PATH" <<'SQL'
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS launch_runtime_state(key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO launch_runtime_state(key, value) VALUES ('recovery_hold', '1')
  ON CONFLICT(key) DO UPDATE SET value='1';
SQL

integrity="$(sqlite3 "$DB_PATH" 'PRAGMA quick_check;')"
if [[ "$integrity" != "ok" ]]; then
  echo "restore: integrity check failed — manual recovery required" >&2
  exit 1
fi

echo "restore: database replaced; recovery_hold=1 until operator clears it"
echo "restore: clear hold only after review: sqlite3 \"\$ARCUE_X_SQLITE_PATH\" \"UPDATE launch_runtime_state SET value='0' WHERE key='recovery_hold';\""
