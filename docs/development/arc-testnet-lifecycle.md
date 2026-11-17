# Arc Testnet insurance lifecycle

**Status:** pool deployed; financial lifecycle **not** executed (preflight only until approved).

| Field | Value |
| --- | --- |
| Chain ID | `5042002` |
| InsurancePool | `0x6657974EEdF488380251bDD95A7FFfb0D456E49E` |
| Manifest | `docs/deployments/arc-testnet-insurance-pool.json` |
| USDC (ERC-20, 6 decimals) | `0x3600000000000000000000000000000000000000` |

## Architecture (what is on-chain vs off-chain)

| Step | Where | Mechanism |
| --- | --- | --- |
| LP deposit | **On-chain** | `deposit(amount)` after ERC-20 `approve` |
| Policy create + premium + bind | **On-chain (single tx)** | `bindPolicy` collects premium, reserves full limit, commits `termsHash` |
| Claim submission / evidence | **Off-chain only** | Synthetic fixture in `@arcuex/onchain` — labeled, not real-world loss |
| Claims verification | **Off-chain only** | Evaluation never authorizes payout |
| Settlement | **On-chain** | `settleClaim(policyId, claimId, lossKey, amount, lossCap, payoutTo)` — `claimsAuthority` only |
| Events / reserves / balances | **On-chain + reconcile helpers** | Receipt logs + `readPoolSnapshot` / `readLossAccounting` |

### Contract gaps (no redeploy required for this lifecycle)

- No on-chain “submit claim” or evidence verification — by design; authority is the trust boundary.
- No separate premium payment function — premium is part of `bindPolicy`.
- Redeploy **not** required for the planned 5 / 2 / 1 USDC flow if signers and gas are funded.

## Planned amounts (integer micros)

| Action | USDC | Micros |
| --- | --- | --- |
| LP deposit | 5 | `5_000_000` |
| Policy max benefit (limit) | 2 | `2_000_000` |
| Premium | 0.1 | `100_000` |
| Settlement payout / lossCap | 1 | `1_000_000` |

## Roles

| Role | Responsibility | Env |
| --- | --- | --- |
| LP | Approve + deposit | `LP_PRIVATE_KEY` or `LIFECYCLE_LP_USE_DEPLOYER=1` |
| Policyholder | Approve premium + `bindPolicy` | `POLICYHOLDER_PRIVATE_KEY` or `LIFECYCLE_POLICYHOLDER_USE_DEPLOYER=1` |
| Claims authority | `settleClaim` | `CLAIMS_AUTHORITY_PRIVATE_KEY` (must match on-chain; **not** auto-derived) |
| Beneficiary | Receive payout | `BENEFICIARY_ADDRESS` (defaults to deployer address if unset) |

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

Expected: printed plan, `readyForLive: false` until blockers cleared, exit code `2` if blockers remain.

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
