# Synthetic demonstration and contract boundary

Implemented: [`synthetic/scenario.ts`](experiments/causal-v2/synthetic/scenario.ts),
[`run.ts`](experiments/causal-v2/synthetic/run.ts), and deterministic
[`demonstration.json`](experiments/causal-v2/synthetic/demonstration.json).
These fabricate shadow balances and emit a **local structured event**, not an EVM
receipt. No test protocol was needed for this offline demonstration; none was deployed.
Historical evidence remains in `historical/`, with no synthetic substitutions.

Run from the worktree root:

```sh
pnpm exec node docs/research/coverage-wedges/experiments/causal-v2/synthetic/run.ts
pnpm exec node --test docs/research/coverage-wedges/experiments/causal-v2/verifier.test.ts
```

The position has 100 wrapper units, 98 base debt units, 18 collateral decimals,
6 debt decimals and an 80% liquidation threshold. Canonical conversion is 1.25
base/wrapper; the controlled faulty adapter returns 1.20. At the canonical rate HF
is `1020408163265306122`; with the error it is `979591836734693877`.

The simulator records a 10-base debt reduction and 8.75-wrapper seizure with 5%
liquidation bonus. At the reference rate, gross depletion less debt benefit is
937,500 micros. A fabricated 200,000-micro grant, 100,000 deductible and 80% share
produce a **510,000-micro synthetic candidate**. This demonstration sets protocol fee
to zero; the historical case separately tests nonzero protocol-fee depletion.

| Case                                                      | Outcome             | Candidate amount |
| --------------------------------------------------------- | ------------------- | ---------------: |
| Healthy → fault → local event → reconstructed causal loss | VERIFIED, SYNTHETIC |   510,000 micros |
| Owner also controls liquidator                            | REJECTED            |                0 |
| Recovery ledger unresolved                                | REVIEW              |                0 |

All results explicitly set `authorizesPayment: false`.

## Optional Arc emitter handoff

If Codex A wants an onchain visualization, use a separate disposable mock with
shadow balances and controllable rates. It must be visibly synthetic and must not
hold real collateral or claim underwriting eligibility. A claimant-controlled mock
would be excluded from a real policy. Suggested **new prototype ABI**, not an ABI
claimed for any existing deployment:

```solidity
event PositionOpened(address indexed owner, uint256 collateralRaw, uint256 debtRaw);
event AdapterChanged(uint256 oldRatioE18, uint256 newRatioE18);
event SyntheticLiquidation(address indexed owner, address indexed liquidator,
                           uint256 collateralSeizedRaw, uint256 debtRepaidRaw);
```

Mock functions would open shadow positions, set the controlled adapter ratio and
liquidate only when the specified integer model computes HF < 1. Full-precision
multiply/divide and bounds must match `health()` and the seizure formula exactly;
do not transplant its arbitrary-precision multiplications into unchecked uint256
Solidity expressions. Supply raw receipt/log indices, deployed bytecode, storage
layout, code hash, decimals and risk constants to the collector. Bind chain 5042002,
pin its actual deployment address and use an independent fixed mock reference path.

This ABI is a reviewable requirement only. No compiled Solidity, deployed address,
wallet transfer or live Streams receipt is claimed. The main financial contracts and
application remain Codex A's responsibility. Actual transactions require the existing
explicit wallet-approval path; a local event must never impersonate their receipt.
