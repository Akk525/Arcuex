# Railway private host acceptance

Verified: **2026-11-17**.

## Decision: CONDITIONAL GO (private gated host)

A dedicated Railway project is live with HTTPS, `/data` volume persistence, acceptance-gate restriction, readiness against Arc Testnet `5042002` / pool `0x6657974EEdF488380251bDD95A7FFfb0D456E49E`, and `pnpm smoke:launch` PASS.

**Not a public launch.** General access remains blocked by `ARCUEX_ACCEPTANCE_GATE_TOKEN`. No financial broadcasts. No contract changes.

### Exact RC vs deployed SHA

| Item | SHA |
| --- | --- |
| Requested RC | `8d70296d4e89f053a882a9fa48945aa481b35efd` |
| Deployed host acceptance tip | `f93dd39b316770ab97f3b75439108a48420ccaea` |

`8d70296` was **not** deployed to the public HTTPS domain: it lacked an application acceptance gate (stop: unexpected public access). Successor commits on `release/nov20-arc-testnet-beta` added:

1. `ARCUEX_ACCEPTANCE_GATE_TOKEN` gate (`fe12472`)
2. Dockerfile VOLUME removal for Railway (`7bd099a`)
3. Node 22 image for pnpm 11.20 (`78dbfc1`)
4. Allow public `NEXT_PUBLIC_*` RPC URLs in validation (`f93dd39`)

## Deployment identity

| Field | Value |
| --- | --- |
| Workspace | Aditya Kuniyil Kattil's Projects (`9b118c43-70e5-4038-b245-59d22c9bc57f`) |
| Project | `arcuex-nov20-beta` (`03848637-de2d-497f-8308-f8f3ccf06f07`) |
| Environment | `production` (`6dca510e-fe00-4478-8d8d-ef65fd5bc4d7`) |
| Service | `arcuex-nov20-beta` (`1280c69e-abbc-4d06-8ecc-93bf4a6ed226`) |
| Deployment | `ca78aca8-f97e-4108-9159-9eaab7ce9b82` (SUCCESS) |
| Volume | `arcuex-nov20-beta-volume` (`b92846ec-9a00-40b6-80a9-bc9dce1e69a2`) mount `/data` |
| Domain | `https://arcuex-nov20-beta-production.up.railway.app` (targetPort `3000`) |
| Chain / pool | `5042002` / `0x6657974EEdF488380251bDD95A7FFfb0D456E49E` |

## Sanitized configuration evidence

Present (names only): `ARCUEX_DEPLOYMENT_MODE=public-beta`, `ARCUEX_PUBLIC_ORIGIN/HOST/TLS_SERVER_NAME`, `ARCUEX_CHAIN_ID`, `ARCUE_X_POOL_ADDRESS`, `ARCUEX_DATA_DIR=/data`, `ARCUE_X_SQLITE_PATH=/data/arcuex.sqlite`, `ARCUEX_STORAGE_ID`, `ARCUEX_SESSION_EPOCH`, `CLAIMS_COOKIE_SECURE=1`, `CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP=0`, `RAILWAY_RUN_UID=0`, ops/rate/gate secrets via Railway secret vars.

Absent: `ARCUEX_PROXY_TOKEN`, `*_PRIVATE_KEY`, `SEED_PHRASE`, `MNEMONIC`.

## Host checks performed

| Check | Result |
| --- | --- |
| `GET /api/health/live` (ungated) | 200 |
| `GET /api/health/ready` without gate | 401 Acceptance gate required |
| `GET /api/health/ready` with gate | 200; database/chain/deployment/solvency true |
| Malicious `x-arcuex-proxy-token` | 400 |
| Unauthorized claims mutation / forged role | 401 |
| `pnpm smoke:launch` against HTTPS host | PASS |
| Service restart | live/ready still 200; SQLite retained on volume |
| Volume SQLite inspect | 11 migrations incl. `009`; `recovery_hold=0`; session rows present; `prestart-*.sqlite` backup present |
| Read-only pool reconciliation via ready | chain 5042002 + pinned pool + solvency |

## Unresolved blockers / next gates

1. **Public launch not authorized** — keep acceptance gate until explicit approval to open general access.
2. **Live extension-wallet acceptance** — checklist below; no broadcasts without separate approval.
3. **Exact RC SHA drift** — operators must acknowledge deployed tip is `f93dd39`, not `8d70296`.
4. Volume file/SSH tooling required SSH key registration (done for this operator machine).

## Extension-wallet acceptance checklist (no broadcasts yet)

Use a funded Arc Testnet wallet. Keep the acceptance gate header/cookie on every browser/API request.

1. Open `https://arcuex-nov20-beta-production.up.railway.app/coverage` with gate present.
2. Connect injected wallet; switch to Arc Testnet (`5042002`).
3. Sign nonce login only (no transfer).
4. Register agent/exposure (synthetic attestations).
5. Quote → accept digest → **stop before Approve USDC** unless separately authorized.
6. If authorized later: approve exact premium, then bind; wait for receipts; open `/policies/[id]`.
7. After coverage window allows: synthetic claim intake on `/claims/new`; confirm owner-only reads.
8. Ops: separate reviewer/authority credentials; prepare settlement **without** enabling synthetic prep unless explicitly authorized; never broadcast from the web service.
9. Confirm Secure httpOnly session cookie; no JSON session token; no client-asserted roles.

## Rollback

Redeploy previous successful Railway deployment for service `1280c69e-…`. Keep volume `b92846ec-…` and `ARCUEX_STORAGE_ID`. Restore ledger with `arcuex-restore-sqlite` only after offline review; clear `recovery_hold` deliberately.
