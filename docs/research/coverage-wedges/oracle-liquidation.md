# Top wedge: canonical exchange-rate adapter liquidation

Status: experimental `oracle-ratio-v1`; conditional underwriting proposal.
The documented [CAPO incident](https://governance.aave.com/t/post-mortem-exchange-rate-misallignment-on-wsteth-core-and-prime-instances/24269)
motivates this narrow mechanism; the fixture is not a replay of that incident.

## Exact trigger

Bind one lending pool/version, wrapper collateral, base-denominated debt asset,
adapter address/code hash, independent wrapper conversion function, position owner,
beneficiary and immutable policy/registration hash. No arbitrary USD price pairs.
No cover if the protocol's intended valuation is deliberately a market discount
rather than the canonical redemption ratio. This must be settled at underwriting.

All must hold:

1. Registration and binding precede event by at least 86,400 seconds. Event time is
   in `[coverageStart + waitingPeriod, coverageEnd)` using canonical block time.
2. Position is unchanged except ordinary interest/accrual since registration:
   no extra borrowing, collateral withdrawal, transfer or unapproved configuration
   change. Registered leverage must meet a separately underwritten buffer.
3. An authenticated canonical receipt from the exact pool liquidates the position.
   Actual pre-call health factor is below 1; replay with ONLY the reference exchange
   ratio substituted is at least 1.02. Pin integer rounding and risk configuration
   to the pool version. Full same-block replay is required if state changed earlier
   in that block; block-end `eth_call` is insufficient.
4. `referenceRatio > actualRatio > 0`, and
   `(referenceRatio - actualRatio) * 10000 >= referenceRatio * 200` (2% inclusive).
   Reference is the wrapper's contemporaneous canonical redeemable base-per-wrapper
   ratio, with a distinct code/control path from the failed adapter. No donation,
   slashing, pause, depeg or redemption restriction invalidates that reference.
5. Net collateral value seized minus debt actually extinguished is positive.
   Values use that ratio, protocol rounding, actual fees and base-asset valuation.
   Exclude the principal used to repay debt: it is not all lost collateral.
6. Eligible owner is unrelated to oracle updater, wrapper controller and liquidator;
   excluded conduct/hidden rebates are screened; third-party recoveries are reconciled.
   Unknown relationships or disputed reference → REVIEW. Proven self-dealing → REJECT.

Real underwriting would cover only pre-listed independent markets. A user cannot
choose a reference, threshold, pool or event after the fact.

## Evidence schema and evaluator

Use the shared envelope in [handoff](decision-brief.md#interface-handoff-for-codex-a).
The oracle payload adds:

| Field group       | Required evidence                                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Position identity | pool/account/subaccount, collateral/debt addresses and decimals, registered balances/debt, registration receipt/time and continuously observed mutations                                  |
| Receipt           | liquidation hash, block hash/height/time, transaction and log index, actual collateral seized, debt repaid, fees, liquidator and beneficiary deltas                                       |
| State/replay      | exact pre-call state root/input bundle, pool code/config hashes, actual oracle read, canonical ratio call bytes/results, actual HF, reference HF, replay engine/version/digest            |
| Integrity         | canonical/finalized header, complete ordered receipts, independent RPC comparison, reference control-path review                                                                          |
| Loss/recovery     | seized value, extinguished debt value, conversion into USDC micros with valuation proof, recovery ledger including DAO grants, rebates and other insurance; remaining policy/event limits |
| Authority         | signed verifier result plus reviewer identity, conflict status, approved methods and complete evidence digest; no AI-vote authority                                                       |

Evaluator order: validate schema → envelope/identity/time/limits → exclusions →
canonicality/completeness/review gates → actual liquidation → reference deviation →
health replay → loss math. Return `COVERED`, `REJECTED` or `REVIEW` plus reason codes,
evidence digest and payable micros. REVIEW has zero payable and is never silently
converted into a denial. The fixture accepts trusted verifier summaries; it does not
perform cryptography, EVM replay, price retrieval or beneficial-owner investigation.

## Payout formula

All amounts are nonnegative integer USDC micros. External conversion of base units
to USDC needs a pre-agreed valuation method at event time; unavailable/disputed value
means REVIEW. The test fixture stipulates values rather than invents market data.

`G = max(0, valueOfCollateralSeized - valueOfDebtExtinguished)`

`N = max(0, G - recoveries)`

`P = min(policyRemaining, exposureRemaining, reservedEventRemaining,
         floor(max(0, N - deductible) * 8000 / 10000))`

Example: seizure worth 10,500; debt extinguished 10,000; grant 100; deductible 10:
net 400 and candidate payout 312 USDC (before limits). No coverage for all 10,500.
Retained coinsurance and deductible reduce, but do not eliminate, collusion incentives.
Never pay again for the same event/position/log; later recovery reduces entitlement
under enforceable recovery/subrogation terms. Pause unresolved compensation rather
than pay before rights are known. Event cap allocation is reserved at binding, not
first-claimant-wins. Atomic reservation/settlement is outside this pure evaluator.

## Scenarios and adversarial tests

| Scenario                                                          | Result                                  |
| ----------------------------------------------------------------- | --------------------------------------- |
| All gates pass; numbers above                                     | COVERED, 312 USDC                       |
| Reference HF is 0.99 (market loss anyway)                         | REJECTED, zero                          |
| Ratio deviation is 199 bps                                        | REJECTED; 200 bps boundary passes       |
| Forged same-topic log from another contract or chain              | REJECTED                                |
| Additional borrowing after binding; claimant is liquidator        | REJECTED                                |
| Reference wrapper itself manipulated, or two RPCs disagree        | REVIEW, zero                            |
| Recovery covers gross loss; claim below deductible                | REJECTED/no payable loss                |
| Same event repeated under different delivery/claim IDs            | REJECTED duplicate                      |
| Event at exact end time, registration too late, non-final receipt | REJECTED, REJECTED, REVIEW respectively |
| Correct block-end state but missing earlier tx state              | REVIEW                                  |

Executable tests additionally exercise giant integer inputs, caps, negative values,
untrusted summary records and unknown relationships. Required future verifier tests:
reorg invalidation, malicious ABI/log lookalikes, decimals/unit confusion, E-Mode and
interest rounding, multiple liquidations without counting the same collateral twice,
oracle dependency overlap and omitted DAO compensation. See [demo](demo-and-verification.md).
