# Onchain lifecycle issues (pending GitHub auth)

`user-github` MCP returned Bad credentials (2026-11-16). After `gh auth login`,
create these issues on `Akk525/Arcuex` against branch `feat/onchain-lifecycle`.

## Labels to add

- `component:contracts` `component:onchain` `component:agent-sdk`

## Issues

### A1 — Financial contracts (Foundry + OZ)
- Acceptance: InsurancePool deposit/bind/settle/withdraw + Foundry invariants green
- Status: **implemented on branch** (local forge 13 tests)

### A2 — Domain / chain integration
- Acceptance: policy/terms hashes, ABIs, tx pipeline, SQLite reconcile tables
- Status: **implemented on branch** (`@arcuex/onchain`, migration `002_onchain`)

### A3 — Agent SDK
- Acceptance: quote→inspect→accept→prepare bind; no private keys; example runnable
- Status: **implemented on branch** (`@arcuex/agent-sdk`)

### A4 — QuickNode Streams
- Blocked: credentials + public webhook host (existing issue #7)

### A5 — Product UI
- Pending after A1–A3 merge readiness

### A6 — Vertical slice on Arc Testnet
- Blocked: pool not yet deployed; needs funded LP + claimsAuthority wallets
