# Arc Testnet insurance lifecycle

**Status (verified 2026-11-17):** pool deployed and the existing 1 USDC synthetic-claim settlement [verified read-only](../verification/2026-11-17-settlement-review.md). No new broadcasts were performed during this review.

| Field                     | Value                                              |
| ------------------------- | -------------------------------------------------- |
| Chain ID                  | `5042002`                                          |
| InsurancePool             | `0x6657974EEdF488380251bDD95A7FFfb0D456E49E`       |
| Manifest                  | `docs/deployments/arc-testnet-insurance-pool.json` |
| USDC (ERC-20, 6 decimals) | `0x3600000000000000000000000000000000000000`       |

## Architecture (what is on-chain vs off-chain)

| Step                           | Where                            | Mechanism                                                                                     |
| ------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------- |
| LP deposit                     | **On-chain**                     | `deposit(amount)` after ERC-20 `approve`                                                      |
| Policy create + premium + bind | **On-chain (single tx)**         | `bindPolicy` collects premium, reserves full limit, commits `termsHash`                       |
| Claim submission / evidence    | **Off-chain only**               | Synthetic fixture in `@arcuex/onchain` — labeled, not real-world loss                         |
| Claims verification            | **Off-chain only**               | Evaluation never authorizes payout                                                            |
| Settlement                     | **On-chain**                     | `settleClaim(policyId, claimId, lossKey, amount, lossCap, payoutTo)` — `claimsAuthority` only |
| Events / reserves / balances   | **On-chain + reconcile helpers** | Receipt logs + `readPoolSnapshot` / `readLossAccounting`                                      |

### Contract gaps (no redeploy required for this lifecycle)

- No on-chain “submit claim” or evidence verification — by design; authority is the trust boundary.
- No separate premium payment function — premium is part of `bindPolicy`.
- Redeploy **not** required for the planned 5 / 2 / 1 USDC flow if signers and gas are funded.

## Planned amounts (integer micros)

| Action                      | USDC | Micros      |
| --------------------------- | ---- | ----------- |
| LP deposit                  | 5    | `5_000_000` |
| Policy max benefit (limit)  | 2    | `2_000_000` |
| Premium                     | 0.1  | `100_000`   |
| Settlement payout / lossCap | 1    | `1_000_000` |

## Roles

| Role             | Responsibility                 | Env                                                                        |
| ---------------- | ------------------------------ | -------------------------------------------------------------------------- |
| LP               | Approve + deposit              | `LP_PRIVATE_KEY` or `LIFECYCLE_LP_USE_DEPLOYER=1`                          |
| Policyholder     | Approve premium + `bindPolicy` | `POLICYHOLDER_PRIVATE_KEY` or `LIFECYCLE_POLICYHOLDER_USE_DEPLOYER=1`      |
| Claims authority | `settleClaim`                  | `CLAIMS_AUTHORITY_PRIVATE_KEY` (must match on-chain; **not** auto-derived) |
| Beneficiary      | Receive payout                 | `BENEFICIARY_ADDRESS` (defaults to deployer address if unset)              |

Never commit `.env`. Never print private keys.

## Setup

```bash
cd /path/to/onchain-lifecycle   # feat/onchain-lifecycle worktree OK
pnpm install
pnpm --filter @arcuex/onchain add -D tsx   # if not already installed
```

Gitignored `.env` (example keys only — see `.env.example`):

```bash
ARC_TESTNET_RPC_URL=https://rpc.quicknode.testnet.arc.io
ARCUE_X_POOL_ADDRESS=0x6657974EEdF488380251bDD95A7FFfb0D456E49E
CLAIMS_AUTHORITY=0x…   # must match cast call claimsAuthority()
FEE_RECIPIENT=0x…
DEPLOYER_PRIVATE_KEY=0x…          # optional helper
LIFECYCLE_LP_USE_DEPLOYER=1
LIFECYCLE_POLICYHOLDER_USE_DEPLOYER=1
CLAIMS_AUTHORITY_PRIVATE_KEY=0x…  # required for settle; fund with native gas
BENEFICIARY_ADDRESS=0x…
```

Fund:

1. LP + policyholder: ≥ 5.1 test USDC ERC-20 + native gas
2. Claims authority: **native gas** (settle fails at 0 balance)
3. Faucet: https://faucet.circle.com

## Dry-run / preflight (default — no broadcast)

```bash
pnpm --filter @arcuex/onchain lifecycle:preflight
```

With no `--confirm`, no transaction steps are selected. Pass the same `--confirm=STEP` flags in dry-run that you intend to use in live mode to inspect their preflight. Multiple confirmations are accepted; no prerequisites are implicitly authorized.

Only selected steps contribute blockers. Current allowance can satisfy approval; existing LP shares satisfy this demo's deposit guard; bound policies satisfy bind and premium approval. Settlement requires an existing bound policy or an explicitly selected bind. It checks the onchain beneficiary, coverage window, remaining limit/reservation, claim replay mapping, and immutable lossKey policy/cap/cumulative paid. Already-settled claimIds are `SATISFIED`, even without a signer. A new claimId cannot bypass an exhausted lossKey.

Existing LP shares are a conservative one-deposit-per-LP demo guard, not a durable deposit receipt. Fee shares can also satisfy it. After all shares are burned, historical deposits cannot be inferred from `sharesOf`; review deposit events before authorizing another deposit. Do not use this runner as a general recurring deposit tool.

All selected blockers, signer addresses and prepared transactions are checked before the first send. Capital projections include only selected, unfinished deposits. Shared signers are checked for combined spending and allowance consumption in execution order. Preflight is a snapshot: concurrent state changes, gas estimation/market changes, transport failures and reverts can still cause runtime failure; sends stop on the first runtime error.

Process outcomes: exit `0` for successful execution or clean dry-run; `2` for selected-step preflight blockers (zero sends); `1` for setup/runtime/reconciliation failure. Each known broadcast hash is retained immediately, including receipt timeouts and reverts. A successful receipt stays `success` even if later reconciliation fails. Inspect all recorded hashes before retrying; process exit is not transaction status.

## First approved live transaction (only after explicit approval)

After preflight is clean:

```bash
pnpm --filter @arcuex/onchain lifecycle:preflight -- --mode=live --confirm=lp_approve
```

Then, one confirmation at a time: `lp_deposit` → `policyholder_approve` → `bind_policy` → `settle_claim`.

## Tests

```bash
pnpm --filter @arcuex/onchain test
pnpm test:contracts
RUN_LIVE_PREFLIGHT=1 pnpm --filter @arcuex/onchain test   # optional read-only RPC
```

Foundry already covers unauthorized settle, duplicate claimId, wrong beneficiary, insufficient capital, expired policy, and same-loss cap.
