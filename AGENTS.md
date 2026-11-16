# Arcuex — Agent Instructions

## Purpose and current scope

Arcuex explores programmable financial protection for autonomous AI agents.
Current scope: Arc Testnet connectivity, browser wallets, QuickNode RPC, and a
**policy-agnostic synthetic insurance core** (domain, SQLite persistence,
quote-to-bind, claims pipeline, capital ledger, dashboard views).

Do not add Circle Gateway/CCTP, Blockaid, Memora, AI model providers, Solidity
contracts, or mainnet issuance unless a tracked issue expands scope.

## Repository organization

| Path | Role |
| --- | --- |
| `apps/web` | Next.js dashboard (live Arc/wallet + synthetic coverage/claims/capital) |
| `packages/chain` | Arc network config + clients |
| `packages/quicknode` | QuickNode RPC client |
| `packages/domain` | Insurance entities, money, state machines, capital math |
| `packages/persistence` | SQLite migrations + repositories |
| `packages/insurance` | Quote-to-bind, claims, capital services |
| `docs/` | Architecture, integrations, development notes |
| `.github/` | CI, issue/PR templates |

Scoped `AGENTS.md` files under `apps/` and `packages/` override root guidance
for that package. Keep temporary notes in `docs/working-notes/`, not here.

## Commands

```bash
pnpm install
pnpm dev                 # apps/web on http://localhost:3000
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Use `pnpm` only. Node.js 20+.

## Engineering standards

- TypeScript strict mode; prefer small pure modules with clear exports.
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).
- Prefer logically small commits that leave `pnpm test` and `pnpm typecheck` green.
- Never commit secrets, private keys, or `.env` / `.data/*.sqlite` files.
- No speculative empty adapters or unused integration stubs.
- Keep insurance wedge-agnostic; label synthetic underwriting explicitly.
- AI majority votes must never authorize payouts.

## Security and wallets

- Never collect, store, log, or transmit private keys or seed phrases.
- All on-chain transfers require explicit user wallet approval.
- Default to Arc Testnet (`5042002`). No mainnet insurance issuance.
- Treat RPC URLs with API keys as secrets; prefer server-side or env-based config.
- Synthetic ledger data is not a financial-event proof.

## Documentation rules

- Accuracy over completeness. Link official docs; cite verification date.
- Mark unavailable provider features as incomplete with the exact blocker.
- Do not claim QuickNode Streams bounty completion from RPC usage alone.
- Update README and relevant `docs/` pages when behavior changes.
- Distinguish **live Arc data** from **synthetic demo ledger** data in UI and docs.

## Definition of done

A change is done when:

1. A developer can clone, `pnpm install`, and `pnpm dev`.
2. Live panels show Arc Testnet connectivity and wallet flows.
3. Synthetic coverage quote → bind → claim demo works against SQLite.
4. Capital accounting tests (conservation/solvency) pass.
5. Tests/CI relevant to the change pass.
6. Integration claims are verified or documented as blocked.

## Verify before claiming functionality

Before stating that Arc, wallet, QuickNode, or insurance features work, run the
relevant tests/live checks and record results. Do not invent network parameters
or production pricing.
