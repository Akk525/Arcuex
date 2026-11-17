# Railway public-beta launch runbook

Verified packaging target: **2026-11-17**. Branch: **`feat/launch-infrastructure`**.

This runbook prepares a **security-gated Arc Testnet beta** on Railway with a volume-backed SQLite ledger. It does **not** authorize public DNS cutover, financial broadcasts, contract redeployment, or mainnet issuance.

Pool remains: `0x6657974EEdF488380251bDD95A7FFfb0D456E49E` on chain `5042002`.

## Architecture decision

Single Railway service running the Next.js app (`apps/web`) from the repo `Dockerfile`.

```text
Internet --TLS--> Railway public edge --HTTP--> Next.js (1 replica)
                         |                         |
                    X-Real-IP                  /data volume
                    X-Forwarded-Proto=https    arcuex.sqlite + WAL/SHM
                    X-Railway-Edge             .arcuex-volume-id
                                               backups/
```

- **Persistent volume** mount path: `/data` (required). Railway volumes imply **single replica**.
- **Trust boundary:** Railway’s public edge overwrites `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto`. The app uses `X-Real-IP` for rate limits and requires `X-Railway-Edge` in `public-beta`. It **rejects** `x-arcuex-proxy-token` / `x-arcuex-client-ip`. Do **not** allow untrusted sibling services to reach this HTTP port over `*.railway.internal` (those callers can spoof forwarding headers).
- **No** `ARCUEX_PROXY_TOKEN`. That variable is refused in production.

## One-time Railway setup

1. Create a Railway project and empty service linked to this repository / branch.
2. Attach **one volume** to the service with mount path **`/data`**.
3. Generate a public HTTPS domain (Railway-managed certificate).
4. Set `RAILWAY_RUN_UID=0` so the process can write the volume.
5. Configure variables (names only — set values in the Railway dashboard; never commit secrets):

| Variable | Required | Notes |
| --- | --- | --- |
| `ARCUEX_DEPLOYMENT_MODE` | yes | `public-beta` |
| `ARCUEX_PUBLIC_ORIGIN` | yes | `https://<host>` exactly |
| `ARCUEX_PUBLIC_HOST` | yes | host[:port] matching Origin |
| `ARCUEX_TLS_SERVER_NAME` | yes | hostname only |
| `ARCUEX_CHAIN_ID` | yes | `5042002` |
| `ARCUE_X_POOL_ADDRESS` | yes | deployed pool address |
| `NEXT_PUBLIC_ARCUE_X_POOL_ADDRESS` | optional | if set, must match pool |
| `ARC_TESTNET_RPC_URL` | yes | `https://…` |
| `QUICKNODE_RPC_URL` | yes | `https://…` |
| `NEXT_PUBLIC_ARC_RPC_URL` | recommended | browser Arc RPC |
| `ARCUEX_DATA_DIR` | yes | `/data` |
| `ARCUE_X_SQLITE_PATH` | yes | `/data/arcuex.sqlite` |
| `ARCUEX_STORAGE_ID` | yes | 8–80 chars; written to `/data/.arcuex-volume-id` on first boot |
| `ARCUEX_SESSION_EPOCH` | yes | rotate to revoke sessions |
| `ARCUEX_RATE_LIMIT_SECRET` | yes | 64 hex chars |
| `CLAIMS_REVIEWER_API_TOKEN` | yes | 64 hex chars, distinct |
| `CLAIMS_AUTHORITY_API_TOKEN` | yes | 64 hex chars, distinct |
| `CLAIMS_SYSTEM_API_TOKEN` | optional | 64 hex chars if used |
| `CLAIMS_COOKIE_SECURE` | yes | `1` |
| `CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP` | yes | unset or `0` |
| `RAILWAY_RUN_UID` | yes | `0` |
| `NODE_ENV` | yes | `production` (Railway default for prod) |

Forbidden in the web service env: any `*_PRIVATE_KEY`, `SEED_PHRASE`, `MNEMONIC`, `ARCUEX_PROXY_TOKEN`, or `NEXT_PUBLIC_*` secret/RPC-key shaped vars.

6. Confirm `railway.toml` healthcheck: `GET /api/health/live` (bypasses edge/header checks).
7. Deploy from the launch branch. **Do not** point public marketing DNS at the service until the verification checklist below passes.

`railway.toml` sets `overlapSeconds = 0` because a volume cannot be mounted by two active deployments.

## Local verification (before any public expose)

```bash
# From repo root (feat/launch-infrastructure worktree)
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Local production smoke with durable disk (no Railway edge headers; use `local-test`):

```bash
DATA=/tmp/arcuex-launch-smoke
rm -rf "$DATA" && mkdir -p "$DATA/backups"
printf 'vol-local-smoke-01\n' > "$DATA/.arcuex-volume-id"

export NODE_ENV=production
export ARCUEX_DEPLOYMENT_MODE=local-test
export ARCUEX_PUBLIC_ORIGIN=http://localhost:3003
export ARCUEX_PUBLIC_HOST=localhost:3003
export ARCUEX_TLS_SERVER_NAME=localhost
export ARCUEX_CHAIN_ID=5042002
export ARCUE_X_POOL_ADDRESS=0x6657974EEdF488380251bDD95A7FFfb0D456E49E
export ARC_TESTNET_RPC_URL=https://rpc.quicknode.testnet.arc.io
export QUICKNODE_RPC_URL=https://rpc.quicknode.testnet.arc.io
export ARCUEX_DATA_DIR="$DATA"
export ARCUE_X_SQLITE_PATH="$DATA/arcuex.sqlite"
export ARCUEX_STORAGE_ID=vol-local-smoke-01
export ARCUEX_SESSION_EPOCH=launch-local-smoke
export ARCUEX_RATE_LIMIT_SECRET="$(openssl rand -hex 32)"
export CLAIMS_REVIEWER_API_TOKEN="$(openssl rand -hex 32)"
export CLAIMS_AUTHORITY_API_TOKEN="$(openssl rand -hex 32)"
export CLAIMS_COOKIE_SECURE=1

pnpm --filter @arcuex/web start -- -H 127.0.0.1 -p 3003
# other terminal:
pnpm smoke:launch -- http://localhost:3003
```

## Backup and restore

### Scheduled / on-demand backup

Inside the running service (Railway SSH / one-off):

```bash
arcuex-backup-sqlite
# writes /data/backups/manual-<UTC>.sqlite (+ .sha256), retains newest 48
```

Entrypoint also writes `prestart-*.sqlite` before each boot when a DB already exists.

### Restore procedure (repeatable)

1. Take the service **offline** (or freeze traffic) so writers stop.
2. Copy the chosen backup off-volume if you need an external copy.
3. Restore:

```bash
arcuex-restore-sqlite /data/backups/manual-<stamp>.sqlite
```

4. Restore sets `launch_runtime_state.recovery_hold=1`, which **blocks mutations** (reads/health still work once the process is up).
5. Start the service. Confirm `GET /api/health/ready` reports `recoveryHold: true` / not ready.
6. Operator review: inspect policies/claims as needed.
7. Clear the hold only after review:

```bash
sqlite3 "$ARCUE_X_SQLITE_PATH" "UPDATE launch_runtime_state SET value='0' WHERE key='recovery_hold';"
```

8. Re-check `/api/health/ready` and re-run `pnpm smoke:launch -- https://<host>` from an allowlisted operator workstation.
9. **Rollback of a bad deploy:** redeploy the previous Railway deployment image **without** deleting `/data`. Volume identity must still match `ARCUEX_STORAGE_ID`. If the code expects a newer migration than the DB has, prefer forward-fix; do not delete the volume.

## Security checklist (must pass before public expose)

- [ ] HTTPS only via Railway domain; `CLAIMS_COOKIE_SECURE=1`
- [ ] Wallet auth message origin equals `ARCUEX_PUBLIC_ORIGIN`
- [ ] Ops tokens provisioned, distinct, not in `NEXT_PUBLIC_*`
- [ ] `CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP` off
- [ ] `/api/health/live` 200; `/api/health/ready` 200 with chain/pool/solvency checks
- [ ] Release smoke PASS (login, policy/claims reads, unauthorized writes, rate limit, durable DB)
- [ ] No private keys in service env
- [ ] No untrusted private-network callers to this service port
- [ ] Authorized live wallet acceptance still tracked separately (not covered by this infra package)

## GO / CONDITIONAL GO / NO-GO

Recorded at packaging time in [`docs/verification/2026-11-17-railway-launch-infrastructure.md`](../verification/2026-11-17-railway-launch-infrastructure.md).
