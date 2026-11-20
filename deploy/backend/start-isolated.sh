#!/usr/bin/env bash
set -euo pipefail
# Railway's start override invokes this before the shared entrypoint can touch storage.
reject() { printf 'backend startup blocked: %s\n' "$1" >&2; exit 1; }
require_other_id() {
  local actual="${!1:-}"
  [[ "$actual" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ &&
     "$actual" != "$2" && "$actual" != '00000000-0000-0000-0000-000000000000' ]] || reject "$1"
}

require_other_id RAILWAY_PROJECT_ID 03848637-de2d-497f-8308-f8f3ccf06f07
require_other_id RAILWAY_ENVIRONMENT_ID 6dca510e-fe00-4478-8d8d-ef65fd5bc4d7
require_other_id RAILWAY_SERVICE_ID 1280c69e-abbc-4d06-8ecc-93bf4a6ed226
require_other_id ARCUEX_BACKEND_VOLUME_ID b92846ec-9a00-40b6-80a9-bc9dce1e69a2
[[ "${ARCUEX_PUBLIC_ORIGIN:-}" != *arcuex-nov20-beta-production* ]] || reject "Plan A origin"
[[ "${ARCUEX_CHAIN_SOURCE:-}" == arc-testnet && "${ARCUEX_RECONCILIATION_ENABLED:-}" == 1 &&
   "${ARCUEX_DEPLOYMENT_MODE:-}" == public-beta && "${NODE_ENV:-}" == production &&
   "${ARCUEX_RECONCILIATION_START_BLOCK:-}" =~ ^[1-9][0-9]*$ ]] || reject "source and worker configuration"
[[ "${ARCUEX_STORAGE_ID:-}" == "backend-${ARCUEX_BACKEND_VOLUME_ID}" &&
   "${ARCUEX_DATA_DIR:-}" == /data &&
   "${ARCUE_X_SQLITE_PATH:-}" == /data/backend.sqlite &&
   "${RAILWAY_VOLUME_MOUNT_PATH:-}" == /data ]] || reject "dedicated storage configuration"
awk '$5 == "/data" { found=1 } END { exit !found }' /proc/self/mountinfo || reject "persistent /data mount"
[[ -n "${ARC_TESTNET_RPC_URL:-}" && -z "${OPENAI_API_KEY:-}" ]] || reject "isolated server credentials"
if [[ "${1:-}" == --check ]]; then exit 0; fi
export ARCUEX_BACKEND_ISOLATED=1
exec /entrypoint.sh node /app/deploy/railway/supervisor.cjs
