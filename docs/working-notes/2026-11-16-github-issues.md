# 2026-11-16 — GitHub issues (pending auth)

`gh auth` for Akk525 failed (invalid keyring token). Remote is
`https://github.com/Akk525/Arcuex.git`. After `gh auth refresh -h github.com`,
create labels and issues below.

## Labels

- `priority:p0` `priority:p1` `priority:p2`
- `component:repo` `component:arc` `component:wallet` `component:quicknode`
  `component:web` `component:ci` `component:docs`

## Issues to create

### 1. Repository bootstrap
- Labels: `priority:p0`, `component:repo`
- Acceptance: pnpm workspace installs; `pnpm test`/`typecheck`/`lint`/`build` pass; README accurate
- Tests: `pnpm test && pnpm typecheck && pnpm build`
- Status: **done** in commits `10dc14d`…`7e18bd4`

### 2. Arc RPC connectivity
- Labels: `priority:p0`, `component:arc`
- Acceptance: typed config chain ID `5042002`; health returns live block; explorer helpers work
- Tests: `pnpm --filter @arcuex/chain test`; `node scripts/verify-arc-rpc.mjs`
- Status: **done** (`bc7eae7`)

### 3. Wallet connection
- Labels: `priority:p0`, `component:wallet`
- Acceptance: injected connect/disconnect; unsupported wallet message; rejection handled
- Tests: manual browser; `pnpm --filter @arcuex/web typecheck`
- Status: **done** (`708d60a`) — browser verification still recommended

### 4. Wallet balances + network switching
- Labels: `priority:p0`, `component:wallet`
- Acceptance: wrong-network state; switch to Arc; single USDC ERC-20 balance
- Tests: manual on Arc Testnet with faucet funds
- Status: **implemented**; needs wallet QA

### 5. Testnet transaction
- Labels: `priority:p0`, `component:wallet`
- Acceptance: explicit click only; hash + receipt; rejection/insufficient funds messaging
- Tests: manual send self-transfer on Arc Testnet
- Status: **implemented**; needs funded wallet QA

### 6. QuickNode RPC
- Labels: `priority:p0`, `component:quicknode`
- Acceptance: status + block detail on dashboard; retries/errors typed; mocked unit tests
- Tests: `pnpm --filter @arcuex/quicknode test`; `/api/health`
- Status: **done** (`d26652a`)

### 7. QuickNode Streams
- Labels: `priority:p1`, `component:quicknode`
- Acceptance: minimal webhook receiver OR documented incomplete with exact blocker
- Tests: N/A until credentials + public webhook host exist
- **Blocker:** no QuickNode Streams credentials; no reachable webhook host
- Status: **open / incomplete** — do not claim Streams bounty from RPC usage

### 8. Dashboard
- Labels: `priority:p0`, `component:web`
- Acceptance: Arc status, QuickNode data, wallet, test tx, loading/empty/error states
- Tests: `pnpm --filter @arcuex/web build`; open `http://localhost:3000`
- Status: **done** (`708d60a`)

### 9. CI
- Labels: `priority:p1`, `component:ci`
- Acceptance: Actions runs lint/typecheck/test/build on PR
- Tests: push/PR green on GitHub Actions
- Status: **workflow added**; remote push blocked by auth

### 10. Documentation
- Labels: `priority:p1`, `component:docs`
- Acceptance: README + docs/integrations reflect verified RPC params and Streams blocker
- Tests: doc review against live `eth_chainId`
- Status: **done** (`438d988`)
