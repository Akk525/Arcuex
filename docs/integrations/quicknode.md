# QuickNode integration

## RPC (implemented)

Official Arc docs list QuickNode testnet HTTP as:

`https://rpc.quicknode.testnet.arc.io`

Verified 2026-11-16: `eth_chainId` → `0x4cef52`, `eth_blockNumber` → live block.

Client: `packages/quicknode` (`QuickNodeClient`)

- Configurable RPC URL
- Block number + block summary
- Transaction receipt lookup
- Typed `QuickNodeError`, timeouts, bounded retries
- Unit tests with mocked public clients
- Dashboard panel in `apps/web`

Override with `NEXT_PUBLIC_QUICKNODE_RPC_URL` or `QUICKNODE_RPC_URL` (dashboard endpoint from QuickNode account preferred in production).

## Streams (not implemented)

QuickNode changelog and product pages confirm **Streams & Webhooks support for Arc Testnet**.

### Blocker

Cannot complete Streams in this foundation because:

1. No QuickNode account API key / Streams credentials in the environment
2. No publicly reachable webhook host provisioned for this repository
3. Streams bounty must not be claimed from RPC usage alone

Tracked work: open a GitHub issue titled “QuickNode Streams webhook receiver” when `gh` auth is available; until then treat Streams as incomplete.

### When unblocked

Minimal receiver would be a Next.js route verifying QuickNode signatures, accepting block/log payloads, and logging/storing delivery metadata — still without insurance logic.
