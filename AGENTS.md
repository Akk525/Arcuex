# Arcuex — Agent Instructions

## Purpose and current scope

Arcuex explores programmable financial protection for autonomous AI agents.
This repository is an infrastructure foundation only: Arc Testnet connectivity,
browser wallet flows, QuickNode RPC queries, and a minimal developer dashboard.

Do not build insurance products, Circle Gateway/CCTP adapters, Blockaid,
Memora, AI model providers, databases, or smart contracts unless a tracked issue
explicitly expands scope.

## Repository organization

| Path | Role |
| --- | --- |
| `apps/web` | Next.js developer dashboard (wallet, network, transactions) |
| `packages/chain` | Typed Arc network config, read clients, explorer helpers |
| `packages/quicknode` | QuickNode RPC client, retries, typed errors |
| `docs/` | Architecture, integrations, development, research, working notes |
| `.github/` | CI, issue/PR templates |

Scoped `AGENTS.md` files under `apps/` and `packages/` override root guidance
for that package. Keep temporary notes in `docs/working-notes/`, not here.

## Commands

```bash
pnpm install
pnpm dev                 # apps/web on http://localhost:3000
pnpm test                # vitest across packages
pnpm lint
pnpm typecheck
pnpm build
```

Use `pnpm` only. Node.js 20+.

## Engineering standards

- TypeScript strict mode; prefer small pure modules with clear exports.
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).
- Prefer logically small commits that leave `pnpm test` and `pnpm typecheck` green.
- Never commit secrets, private keys, or `.env` files.
- No speculative empty adapters or unused integration stubs.

## Security and wallets

- Never collect, store, log, or transmit private keys or seed phrases.
- All transfers require explicit user wallet approval.
- Default to Arc Testnet (`5042002`). Do not send mainnet transactions from this foundation.
- Treat RPC URLs with API keys as secrets; prefer server-side or env-based config.

## Documentation rules

- Accuracy over completeness. Link official docs; cite verification date.
- Mark unavailable provider features as incomplete with the exact blocker.
- Do not claim QuickNode Streams bounty completion from RPC usage alone.
- Update README and relevant `docs/` pages when behavior changes.

## Definition of done

A change is done when:

1. A developer can clone, `pnpm install`, and `pnpm dev`.
2. The dashboard shows live Arc Testnet connectivity (chain ID + block).
3. Injected EVM wallets connect, switch to Arc Testnet, and show balances.
4. An explicitly approved testnet transaction reports hash/receipt/errors.
5. QuickNode RPC queries return real Arc data (or fail with typed errors).
6. Tests/CI relevant to the change pass.
7. Integration claims are verified against live RPC or documented as blocked.

## Verify before claiming functionality

Before stating that Arc, wallet, or QuickNode features work, run the relevant
read against a live endpoint (or a recorded test with mocked transport for unit
logic) and record the result. Do not invent network parameters.
