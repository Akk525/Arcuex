# November 20 Arc Testnet beta — release candidate

**Branch:** `release/nov20-arc-testnet-beta`  
**Packaged:** 2026-11-17  
**Parents:** `integration/procurement-claims` @ `9f8d473` + `feat/launch-infrastructure` @ `334472c` (fast-forward; no content conflicts)  
**Release commit:** `0874b5b2349db56eb77005d5a41faa1f2300f1da`

This document is the sanitized release manifest and Railway environment checklist. It does **not** authorize public DNS cutover, financial broadcasts, contract redeployment, or mainnet issuance.

## Verification evidence (2026-11-17)

| Check | Result |
| --- | --- |
| Merge conflicts | None (fast-forward `9f8d473` → `334472c`) |
| `pnpm test` | Passed (188 TypeScript tests across packages/web) |
| `pnpm typecheck` | Passed |
| `pnpm lint` | Passed |
| `pnpm build` | Passed |
| Fresh + upgrade migrations (`migration-integration`) | 7/7 passed; durable DB shows 11 migrations including `009` |
| Security source regression | Rejects `ARCUEX_PROXY_TOKEN`, private keys; pins chain/pool; synth prep off |
| `pnpm smoke:launch` | PASS against local-test production on `:3003` |
| `/api/health/ready` | `ok:true`, chain `5042002`, pool `0x6657…E49E` |
| Public deploy / broadcasts | **Not performed** |

## Release identity

| Field | Value |
| --- | --- |
| Product mode | Synthetic Arc Testnet beta (labeled) |
| Chain ID | `5042002` |
| InsurancePool | `0x6657974EEdF488380251bDD95A7FFfb0D456E49E` |
| USDC (Arc Testnet) | `0x3600000000000000000000000000000000000000` |
| Hosting | Railway, single replica, volume `/data` |
| Health live | `GET /api/health/live` |
| Health ready | `GET /api/health/ready` |
| Migrations | `001` … `009_launch_security.sql` (11 ordered files) |

## Included capability

- Integrated procurement → claims wallet session (`arcuex_claims_sid`)
- Railway Dockerfile, `railway.toml`, entrypoint, backup/restore
- Runtime validation, Railway edge trust boundary, durable rate limits
- Synthetic settlement prep **disabled** in production (`CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP` must be unset/`0`)
- No `ARCUEX_PROXY_TOKEN`; private keys forbidden in the web service env

## Sanitized Railway environment checklist

Set in the Railway dashboard. **Never commit values.**

### Required

| Variable | Expected shape (no secrets) |
| --- | --- |
| `NODE_ENV` | `production` |
| `ARCUEX_DEPLOYMENT_MODE` | `public-beta` |
| `ARCUEX_PUBLIC_ORIGIN` | `https://<host>` (exact origin) |
| `ARCUEX_PUBLIC_HOST` | `<host>` matching Origin host |
| `ARCUEX_TLS_SERVER_NAME` | hostname only |
| `ARCUEX_CHAIN_ID` | `5042002` |
| `ARCUE_X_POOL_ADDRESS` | `0x6657974EEdF488380251bDD95A7FFfb0D456E49E` |
| `ARC_TESTNET_RPC_URL` | `https://…` (no embedded credentials) |
| `QUICKNODE_RPC_URL` | `https://…` (no embedded credentials) |
| `ARCUEX_DATA_DIR` | `/data` |
| `ARCUE_X_SQLITE_PATH` | `/data/arcuex.sqlite` |
| `ARCUEX_STORAGE_ID` | 8–80 `[A-Za-z0-9_-]` |
| `ARCUEX_SESSION_EPOCH` | 8–80 `[A-Za-z0-9._-]` |
| `ARCUEX_RATE_LIMIT_SECRET` | 64 hex chars |
| `CLAIMS_REVIEWER_API_TOKEN` | 64 hex chars, distinct |
| `CLAIMS_AUTHORITY_API_TOKEN` | 64 hex chars, distinct |
| `CLAIMS_COOKIE_SECURE` | `1` |
| `RAILWAY_RUN_UID` | `0` |

### Optional

| Variable | Notes |
| --- | --- |
| `CLAIMS_SYSTEM_API_TOKEN` | 64 hex if used; must be distinct |
| `NEXT_PUBLIC_ARC_RPC_URL` | Browser Arc RPC (public endpoint only) |
| `NEXT_PUBLIC_ARCUE_X_POOL_ADDRESS` | If set, must equal pool above |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Optional WalletConnect |
| `QUICKNODE_STREAMS_WEBHOOK_SECRET` | Only if Streams webhook enabled |
| `ARCUEX_SESSION_TTL_SECONDS` | Default `28800` |
| `ARCUEX_NONCE_TTL_SECONDS` | Default `600` |

### Explicitly forbidden on the web service

| Variable / pattern | Reason |
| --- | --- |
| `ARCUEX_PROXY_TOKEN` | Rejected; Railway edge trust model |
| `CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP=1` | Must stay off for public-beta |
| `*_PRIVATE_KEY`, `SEED_PHRASE`, `MNEMONIC` | Fail closed at startup |
| `NEXT_PUBLIC_*` secrets / API keys / private RPC credentials | Fail closed at startup |

### Volume

- One Railway volume, mount path `/data`
- Single replica only (Railway volume constraint)
- `overlapSeconds = 0` in `railway.toml`

## Pre-deploy verification commands

```bash
git checkout release/nov20-arc-testnet-beta
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm build
# local-test production smoke (see docs/deployments/railway-public-beta.md)
pnpm smoke:launch -- http://localhost:3003
```

## Still gating unconditional public GO

1. Private Railway deploy + host checklist (HTTPS, ready probe, smoke against Railway URL).
2. Authorized live extension-wallet / operator acceptance.
3. Capital and coverage-window operational limits on the existing pool.

## Rollback

Redeploy the previous Railway deployment image. Keep `/data` and the same `ARCUEX_STORAGE_ID`. Ledger restore: `arcuex-restore-sqlite` then clear `recovery_hold` only after review.
