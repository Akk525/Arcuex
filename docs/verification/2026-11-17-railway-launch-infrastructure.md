# Railway launch infrastructure assessment

Verified packaging: **2026-11-17**. Branch: **`feat/launch-infrastructure`** (from `integration/procurement-claims` @ `9f8d473`).

## Decision: CONDITIONAL GO

Infrastructure packaging for a security-gated Arc Testnet beta on Railway is ready to configure and verify on a **private** Railway service. **Do not expose the service publicly until the host checklist in [railway-public-beta.md](../deployments/railway-public-beta.md) passes**, and keep the existing product gate: authorized live wallet/operator acceptance remains outstanding.

This is **not** approval for real-world insurance, autonomous payouts, contract redeployment, or financial broadcasts.

### Local packaging verification (2026-11-17)

- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`: passed after launch hardening.
- Local `ARCUEX_DEPLOYMENT_MODE=local-test` production start on port 3003 with durable `/tmp/.../arcuex.sqlite`.
- `GET /api/health/ready` returned `ok:true` with chain `5042002`, pinned pool, solvency checks.
- `pnpm smoke:launch -- http://localhost:3003`: **PASS** (login cookie flags, policy/claims reads, unauthorized write rejection, auth rate limit, durable migration `009`).
- No Railway project was created and no public URL was exposed from this session.

## What shipped in this package

- Railway `Dockerfile` + `railway.toml` + volume bootstrap entrypoint (`/data`)
- Fail-closed runtime validation (chain `5042002`, pool pin, RPC HTTPS, `/data` SQLite, cookie Secure, distinct ops/rate secrets)
- Railway public-edge trust model (`X-Real-IP`, `X-Forwarded-Proto`, `X-Railway-Edge`); rejection of client-supplied proxy identity headers; **no** `ARCUEX_PROXY_TOKEN`
- Durable SQLite rate limits + recovery hold (migration `009_launch_security.sql`)
- `/api/health/live` and `/api/health/ready`
- Backup/restore scripts with checksum + mutation hold after restore
- `pnpm smoke:launch` release smoke (login, policy/claims reads, unauthorized writes, rate limit, durable DB)

## Still gating an unconditional public launch

1. Operator creates Railway project, attaches `/data` volume, sets secrets, deploys, and passes host checklist (HTTPS, ready probe, smoke against the Railway URL).
2. Authorized live extension-wallet procurement/settlement acceptance (separate from this infra package).
3. Operational capital/window constraints documented in the procurement+claims integration assessment.

## Rollback

Redeploy the previous Railway deployment. Keep the `/data` volume. Do not change `ARCUEX_STORAGE_ID` unless intentionally rotating storage after a reviewed restore. To roll back ledger contents, use `arcuex-restore-sqlite` and clear `recovery_hold` only after review.
