# Arcuex

Arcuex is an early-stage infrastructure project exploring programmable financial protection for autonomous AI agents. This repository combines live Arc Testnet connectivity with a policy-agnostic **synthetic** insurance core (quotes, policies, claims, capital ledger).

## Implemented

- Typed Arc Testnet config (chain ID `5042002`), wallet connect/switch/balance, explicit testnet transfer
- QuickNode Arc Testnet RPC client + dashboard status (Streams still incomplete — see docs)
- `@arcuex/domain` entities, immutable terms, state machines, USDC micros, capital math
- `@arcuex/persistence` SQLite migrations/repositories with audit + idempotent event processing
- `@arcuex/insurance` quote-to-bind, claims pipeline, capital services (synthetic product)
- Dashboard panels for live Arc/wallet and synthetic Coverage / Claims / Capital

## Limitations

- Synthetic underwriting is **not** real insurance issuance or production pricing
- No Solidity contracts, mainnet deployments, or AI-authorized payouts
- QuickNode Streams / webhooks are **not** implemented (credentials + public webhook host missing)
- Local SQLite ledger is Node-runtime only (`ARCUE_X_SQLITE_PATH`)

## Prerequisites

- Node.js 20+
- pnpm 11+ (repo `packageManager` field)
- Optional: injected EVM wallet + Circle faucet USDC for chain panels

## Setup

```bash
pnpm install
cp .env.example .env.local   # optional overrides
pnpm dev                     # http://localhost:3000
```

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_ARC_RPC_URL` | Arc RPC for dashboard | `https://rpc.testnet.arc.io` |
| `NEXT_PUBLIC_QUICKNODE_RPC_URL` | QuickNode Arc RPC | `https://rpc.quicknode.testnet.arc.io` |
| `QUICKNODE_RPC_URL` | Server QuickNode override | same public host |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Optional WalletConnect | unset |
| `ARCUE_X_SQLITE_PATH` | Synthetic ledger SQLite path | `.data/arcuex.sqlite` |

## Connectivity verification

```bash
node scripts/verify-arc-rpc.mjs
curl -s http://localhost:3000/api/health
curl -s http://localhost:3000/api/capital
```

## Repository map

| Path | Role |
| --- | --- |
| `apps/web` | Developer dashboard + API routes |
| `packages/chain` | Arc config/clients |
| `packages/quicknode` | QuickNode RPC |
| `packages/domain` | Insurance domain |
| `packages/persistence` | SQLite |
| `packages/insurance` | Application services |
| `docs/` | Architecture and integrations |

## Documentation

- [docs/README.md](docs/README.md)
- [docs/architecture/decisions/002-policy-agnostic-insurance-core.md](docs/architecture/decisions/002-policy-agnostic-insurance-core.md)
- [docs/architecture/trust-boundaries.md](docs/architecture/trust-boundaries.md)
- [docs/integrations/quicknode.md](docs/integrations/quicknode.md)
- [AGENTS.md](AGENTS.md)
