# Local on-chain lifecycle demo runbook

**Network claim:** this runbook is for **local Foundry / Anvil-style simulation** and offline TypeScript checks. It does **not** prove Arc Testnet deployment.

**Labels**

| Label | Meaning |
| --- | --- |
| **Synthetic** | Demo incident / oracle evidence generated in-process; not a live market event |
| **Real (testnet)** | Arc Testnet RPC / USDC / wallet txs — only after authorized deploy + funded keys |
| **Streams live** | Authenticated QuickNode Streams webhook delivery — separate from RPC backfill |

## Setup

```bash
# From repo root (feat/onchain-lifecycle worktree OK)
pnpm install
export PATH="$HOME/.foundry/bin:$PATH"
cd contracts && forge install --no-commit   # if libs missing
```

No `DEPLOYER_PRIVATE_KEY` required for local Foundry tests.

## Exact commands

### 1. Same-loss uniqueness + local financial lifecycle (Foundry)

```bash
cd contracts
forge test
```

**Expected**

- `InsurancePoolTest` — includes same-loss partials, inflated cap reject, claimId anti-replay
- `LifecycleE2ETest::test_fullLifecycleWithInvalidClaimAndBlockedWithdraw` — PASS
- Suite: **20 passed** (count may grow; zero failures required)

Lifecycle covered: LP test USDC deposit → premium bind + reserve → synthetic incident (labeled) → unauthorized settle reverts → authority settle → USDC payout deltas → lossCap blocks second claimId → LP full withdraw blocked while reserved → conservation.

### 2. TypeScript packages

```bash
pnpm --filter @arcuex/domain test
pnpm --filter @arcuex/onchain test
pnpm --filter @arcuex/persistence test
pnpm --filter @arcuex/quicknode test
pnpm typecheck
pnpm lint
```

**Expected:** all green. Onchain suite covers ABI decode of `ClaimSettled` (incl. `lossKey`), durable dedupe, RPC backfill reconcile helpers.

### 3. Deploy preflight (no broadcast)

```bash
./scripts/preflight-deploy.sh
```

**Expected without keys:** exit **2**, messages `BLOCKED: DEPLOYER_PRIVATE_KEY|CLAIMS_AUTHORITY|FEE_RECIPIENT unset`, chain/USDC checks still run. **Never** prints private keys.

With keys + Arc RPC: exit **0** means ready to deploy — still requires **explicit authorization** before `./scripts/deploy-insurance-pool.sh`.

### 4. Event recovery (RPC backfill — not Streams)

Use `@arcuex/quicknode` `backfillPoolLogs` + `@arcuex/onchain` `reconcileFromBackfillLogs` / `decodePoolLogs` against a configured pool address.

**Streams-specific live verification** needs `QUICKNODE_STREAMS_WEBHOOK_SECRET` + a public webhook host — document separately; do not claim Streams from RPC alone.

## Loss identity rules (operator)

- `claimId` = settlement record (anti-replay)
- `lossKey` = canonical economic loss lot (`chainId`, policy, exposure, incident, loss lot)
- Partials allowed until immutable `lossCap` and policy remaining limit/reservation
- Do not reuse a new `claimId` to exceed the same `lossKey` cap

## Outstanding external blockers

- Testnet deploy: missing funded deployer / authority / fee recipient env
- QuickNode Streams live: secret + public URL
- GitHub PR via `gh`: authentication Forbidden (manual PR URL still usable)
