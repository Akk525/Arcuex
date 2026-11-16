# @arcuex/quicknode

## Scope

QuickNode Arc RPC client helpers: block queries, receipts/logs, typed errors,
timeouts, and basic retries. Streams/webhooks are out of scope until credentials
and a reachable webhook host exist (see `docs/integrations/quicknode.md`).

## Rules

- Default RPC: `https://rpc.quicknode.testnet.arc.io` (public Arc Testnet host).
- Allow override via `QUICKNODE_RPC_URL` / constructor options.
- Never claim Streams bounty completion from RPC usage alone.
- Unit tests must use mocked transports; live checks belong in docs/working notes.
- Keep retries bounded; surface typed errors to the UI.
