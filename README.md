# Arcuex

Arcuex is an early-stage infrastructure project exploring programmable financial protection for autonomous AI agents. This repository combines live Arc Testnet connectivity with a policy-agnostic **synthetic** insurance core (quotes, policies, claims, capital ledger).

## Implemented

- Typed Arc Testnet config (chain ID `5042002`), wallet connect/switch/balance, explicit testnet transfer
- QuickNode Arc Testnet RPC client + dashboard status (Streams still incomplete — see docs)
- `@arcuex/domain` entities, immutable terms, state machines, USDC micros, capital math
- `@arcuex/persistence` SQLite migrations/repositories with audit + idempotent event processing
- `@arcuex/insurance` quote-to-bind, claims pipeline, capital services (synthetic product)
- Dashboard panels for live Arc/wallet and synthetic Coverage / Claims / Capital
- Foundry `InsurancePool` (deposit / bind / reserve / authorized settle / restricted withdraw)
- `@arcuex/onchain` ABIs, canonical ids, tx pipeline, SQLite↔chain reconcile helpers
- `@arcuex/agent-sdk` quote → inspect → accept → prepare approve/bind (no private keys)

The [testnet lifecycle runner](docs/development/arc-testnet-lifecycle.md) validates explicitly selected steps before execution, skips completed steps, and reports transaction receipts separately from process outcome.

## Limitations

- Synthetic underwriting is **not** real insurance issuance or production pricing
- Arc Testnet pool and one synthetic-claim settlement are [verified read-only](docs/verification/2026-11-17-settlement-review.md); this is not production issuance
- No mainnet deployments or AI-authorized payouts (`claimsAuthority` only)
- QuickNode Streams / webhooks are **not** implemented (credentials + public webhook host missing)
- Local SQLite ledger is Node-runtime only (`ARCUE_X_SQLITE_PATH`); contract state is authoritative once deployed

## Prerequisites

- Node.js 20+
- pnpm 11+ (repo `packageManager` field)
- Optional: injected EVM wallet + Circle faucet USDC for chain panels

## Setup

```bash
pnpm install
cp .env.example .env.local   # optional overrides
# Optional for contracts:
# curl -L https://foundry.paradigm.xyz | bash && foundryup
# (cd contracts && forge install)
pnpm dev                     # http://localhost:3000
```

```bash
pnpm test                    # TypeScript package tests; contracts are separate
pnpm test:contracts
pnpm lint
pnpm typecheck
pnpm build
```

## Environment variables

| Variable                               | Purpose                      | Default                                |
| -------------------------------------- | ---------------------------- | -------------------------------------- |
| `NEXT_PUBLIC_ARC_RPC_URL`              | Arc RPC for dashboard        | `https://rpc.testnet.arc.io`           |
| `NEXT_PUBLIC_QUICKNODE_RPC_URL`        | QuickNode Arc RPC            | `https://rpc.quicknode.testnet.arc.io` |
| `QUICKNODE_RPC_URL`                    | Server QuickNode override    | same public host                       |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Optional WalletConnect       | unset                                  |
| `ARCUE_X_SQLITE_PATH`                  | Synthetic ledger SQLite path | `.data/arcuex.sqlite`                  |
| `ARCUE_X_POOL_ADDRESS`                 | Deployed `InsurancePool`     | unset until testnet deploy             |

## Connectivity verification

```bash
node scripts/verify-arc-rpc.mjs
curl -s http://localhost:3000/api/health
curl -s http://localhost:3000/api/capital
```

## Repository map

| Path                   | Role                             |
| ---------------------- | -------------------------------- |
| `apps/web`             | Developer dashboard + API routes |
| `contracts/`           | Foundry `InsurancePool`          |
| `packages/chain`       | Arc config/clients               |
| `packages/quicknode`   | QuickNode RPC                    |
| `packages/domain`      | Insurance domain                 |
| `packages/persistence` | SQLite                           |
| `packages/insurance`   | Application services             |
| `packages/onchain`     | Contract ABIs + tx/reconcile     |
| `packages/agent-sdk`   | Agent quote/bind facade          |
| `docs/`                | Architecture and integrations    |

## Documentation

- [docs/README.md](docs/README.md)
- [docs/architecture/decisions/002-policy-agnostic-insurance-core.md](docs/architecture/decisions/002-policy-agnostic-insurance-core.md)
- [docs/architecture/trust-boundaries.md](docs/architecture/trust-boundaries.md)
- [docs/integrations/quicknode.md](docs/integrations/quicknode.md)
- [AGENTS.md](AGENTS.md)
