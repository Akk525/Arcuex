#!/usr/bin/env bash
# Railway volume bootstrap. Never prints secret values.
set -euo pipefail

DATA_DIR="${ARCUEX_DATA_DIR:-/data}"
DB_PATH="${ARCUE_X_SQLITE_PATH:-$DATA_DIR/arcuex.sqlite}"
ID_FILE="$DATA_DIR/.arcuex-volume-id"
BACKUP_DIR="$DATA_DIR/backups"

if [[ "${NODE_ENV:-}" == "production" ]]; then
  case "${ARCUEX_CHAIN_SOURCE:-}" in
    arc-testnet) ;;
    fixture)
      if [[ ! "${ARCUEX_FIXTURE_ID:-}" =~ ^candidate-[0-9a-f-]{36}$ ]] ||
         [[ "${ARCUEX_STORAGE_ID:-}" != "$ARCUEX_FIXTURE_ID" ]] ||
         [[ "$DB_PATH" != "$DATA_DIR/$ARCUEX_FIXTURE_ID.sqlite" ]] ||
         [[ ! -f "$ID_FILE" ]] || [[ ! -f "$DB_PATH" ]] ||
         [[ "${ARCUEX_RECONCILIATION_ENABLED:-}" == "1" ]]; then
        echo "entrypoint: fixture requires separately initialized candidate storage; refusing bootstrap" >&2
        exit 1
      fi
      ;;
    *) echo "entrypoint: explicit ARCUEX_CHAIN_SOURCE required" >&2; exit 1 ;;
  esac
  if [[ -z "${ARCUEX_STORAGE_ID:-}" ]]; then
    echo "entrypoint: ARCUEX_STORAGE_ID is required in production" >&2
    exit 1
  fi
  if [[ ! -d "$DATA_DIR" ]]; then
    echo "entrypoint: data directory missing — mount a Railway volume at $DATA_DIR" >&2
    exit 1
  fi
  if [[ -f "$ID_FILE" ]]; then
    existing="$(tr -d '[:space:]' < "$ID_FILE")"
    if [[ "$existing" != "$ARCUEX_STORAGE_ID" ]]; then
      echo "entrypoint: volume identity mismatch — refusing to start (recovery required)" >&2
      exit 1
    fi
  else
    printf '%s\n' "$ARCUEX_STORAGE_ID" > "$ID_FILE"
    echo "entrypoint: wrote volume identity marker"
  fi
  mkdir -p "$DATA_DIR" "$BACKUP_DIR" "$(dirname "$DB_PATH")"

  # Safe redeploy: snapshot existing DB before the new process opens it (WAL checkpoint).
  if [[ -f "$DB_PATH" ]]; then
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    dest="$BACKUP_DIR/prestart-$stamp.sqlite"
    if command -v sqlite3 >/dev/null 2>&1; then
      sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null 2>&1 || true
      sqlite3 "$DB_PATH" ".backup '$dest'"
    else
      cp -f "$DB_PATH" "$dest"
      [[ -f "$DB_PATH-wal" ]] && cp -f "$DB_PATH-wal" "$dest-wal" || true
      [[ -f "$DB_PATH-shm" ]] && cp -f "$DB_PATH-shm" "$dest-shm" || true
    fi
    # Keep the newest 14 prestart snapshots.
    ls -1t "$BACKUP_DIR"/prestart-*.sqlite 2>/dev/null | tail -n +15 | xargs -r rm -f || true
    echo "entrypoint: prestart backup captured"
  fi
fi

# Honour Railway PORT when provided.
if [[ -n "${PORT:-}" ]]; then
  export PORT
fi

exec "$@"
