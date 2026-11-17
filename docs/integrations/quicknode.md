# QuickNode integration

## RPC (implemented)

Official Arc docs list QuickNode testnet HTTP as:

`https://rpc.quicknode.testnet.arc.io`

Verified 2026-11-17 from this worktree host: `eth_chainId` → `0x4cef52` (`5042002`).

Client: `packages/quicknode` (`QuickNodeClient`)

Override with `NEXT_PUBLIC_QUICKNODE_RPC_URL` or `QUICKNODE_RPC_URL`.

## Streams (receiver implemented; live delivery blocked)

Authenticated webhook receiver:

`POST /api/webhooks/quicknode-streams`

- Verifies `X-QN-Nonce` + `X-QN-Timestamp` + body HMAC-SHA256 vs `QUICKNODE_STREAMS_WEBHOOK_SECRET`
- Supports gzip bodies (signature over uncompressed JSON)
- Normalizes events, dedupes into SQLite `streams_inbox`
- Explicitly does **not** authorize claims/payouts
- RPC backfill helper: `backfillPoolLogs` in `@arcuex/quicknode` (reconciliation only)

### Exact provisioning steps

1. Create a QuickNode account Stream for **Arc Testnet**
2. Filter logs to the deployed `InsurancePool` address
3. Destination = Webhook → `https://<public-https-host>/api/webhooks/quicknode-streams`
4. Copy Stream security token → `QUICKNODE_STREAMS_WEBHOOK_SECRET` (server env only)
5. Prefer compression `none` during bring-up; gzip supported
6. Confirm a delivery appears in Integrations → Streams inbox with `signatureOk=true`

### Blocker (unchanged)

- No Streams credentials in environment
- No publicly reachable webhook host provisioned for this repo

**Do not claim Streams bounty from RPC usage alone.**
