# Arcuex

Arcuex is an early-stage infrastructure project exploring programmable financial protection for autonomous AI agents. This repository is the working foundation: Arc Testnet connectivity, injected EVM wallet flows, QuickNode RPC reads, and a minimal developer dashboard.

## Implemented

- Typed Arc Testnet config (chain ID `5042002`), read-only RPC health, explorer helpers
- Injected wallet connect / disconnect / switch-to-Arc / USDC balance (ERC-20 view)
- Explicit user-approved testnet self-transfer with hash and receipt reporting
- QuickNode Arc Testnet RPC client with timeouts, retries, and mocked unit tests
- Next.js dashboard surfacing live Arc + QuickNode data
- Vitest, ESLint, Prettier, GitHub Actions CI

## Limitations

- No insurance product, contracts, database, or AI integrations
- QuickNode Streams / webhooks are **not** implemented (verified support exists; credentials and public webhook hosting are missing — see `docs/integrations/quicknode.md`)
- WalletConnect is optional and not required for injected wallets
- Browser wallet UX depends on the installed extension

## Prerequisites

- Node.js 20+
- pnpm 9+ (repo pinned to pnpm 11.20.0 via `packageManager`)
- An injected EVM wallet for interactive flows
- Optional: Arc Testnet USDC from https://faucet.circle.com

## Setup

```bash
pnpm install
cp .env.example .env.local   # optional overrides
pnpm dev                     # http://localhost:3000
```

Other commands:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_ARC_RPC_URL` | Circle / public Arc RPC for dashboard | `https://rpc.testnet.arc.io` |
| `NEXT_PUBLIC_QUICKNODE_RPC_URL` | QuickNode Arc RPC for dashboard | `https://rpc.quicknode.testnet.arc.io` |
| `QUICKNODE_RPC_URL` | Server-side QuickNode override | same QuickNode public host |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Optional WalletConnect | unset |

Never commit real API keys or `.env.local`.

## Connectivity verification

```bash
# Circle public Arc Testnet
curl -s -X POST https://rpc.testnet.arc.io \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
# expect "0x4cef52" (5042002)

# QuickNode public Arc Testnet
curl -s -X POST https://rpc.quicknode.testnet.arc.io \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'

# App health (with `pnpm dev` running)
curl -s http://localhost:3000/api/health
```

Verified 2026-11-16: both RPCs returned chain ID `5042002` and a live block number.

## Repository map

| Path | Role |
| --- | --- |
| `apps/web` | Developer dashboard |
| `packages/chain` | Arc network config + clients |
| `packages/quicknode` | QuickNode RPC helpers |
| `docs/` | Architecture, integrations, development notes |
| `.github/` | CI and templates |

## Documentation

- [docs/README.md](docs/README.md)
- [docs/development/setup.md](docs/development/setup.md)
- [docs/integrations/arc.md](docs/integrations/arc.md)
- [docs/integrations/quicknode.md](docs/integrations/quicknode.md)
- [docs/integrations/wallets.md](docs/integrations/wallets.md)
- [AGENTS.md](AGENTS.md) — coding-agent instructions
