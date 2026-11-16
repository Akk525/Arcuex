# Architecture overview

Arcuex is a pnpm monorepo with live Arc surfaces and a synthetic insurance core:

```
Browser (apps/web)
  ├─ wagmi/viem injected wallet          → live Arc Testnet
  ├─ @arcuex/chain / @arcuex/quicknode   → live RPC reads
  └─ /api/coverage|claims|capital        → synthetic SQLite ledger

packages/domain       entities, money, transitions, capital math
packages/persistence  SQLite migrations + repositories
packages/insurance    quote-to-bind, claims, capital services
packages/chain        Arc network helpers
packages/quicknode    QuickNode RPC client
```

## Data flow

1. Dashboard polls Arc + QuickNode health (live chain data).
2. Wallet connect/switch/balance/test-tx use wagmi against Arc Testnet.
3. Coverage APIs run quote → accept → funding check → bind → activate against SQLite.
4. Claims APIs intake observed events, collect synthetic evidence, validate rules,
   authorize claims (non-AI authority), and prepare settlements.
5. Capital APIs maintain a fully collateralized USDC micros ledger.

## Non-goals (current)

- Real insurance issuance / production pricing
- Solidity contracts / mainnet
- QuickNode Streams webhook (blocked — see integrations/quicknode.md)
- Circle Gateway / CCTP / AI model integrations
