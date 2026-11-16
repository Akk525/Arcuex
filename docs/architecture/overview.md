# Architecture overview

Arcuex foundation is a pnpm monorepo with three runtime surfaces:

```
Browser (apps/web)
  ├─ wagmi/viem injected wallet
  ├─ @arcuex/chain  → Circle Arc Testnet RPC
  └─ @arcuex/quicknode → QuickNode Arc Testnet RPC

packages/chain     typed network config + read helpers
packages/quicknode RPC client, retries, receipt/log helpers
```

## Data flow

1. Dashboard polls Arc health (`eth_chainId`, `eth_blockNumber`) via `@arcuex/chain`.
2. Dashboard polls QuickNode for status + latest block summary.
3. Wallet connection uses wagmi `injected()`; balances use Arc ERC-20 USDC view.
4. Test transfers call `eth_sendRawTransaction` through the wallet; receipts are waited via wagmi.

## Non-goals (current)

- Persistence / database
- Streams webhook ingestion
- Insurance underwriting or agent policy logic
- Cross-chain CCTP / Gateway adapters
