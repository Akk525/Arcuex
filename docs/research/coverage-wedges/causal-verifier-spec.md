# Causal verifier v2

Product: `oracle-causal/2`. Assessment outcomes: **VERIFIED, REJECTED, REVIEW**.
REVIEW and REJECTED have zero candidate payout. Every experimental result has
`authorizesPayment: false`, including VERIFIED. No AI output is evidence authority.

## Inputs and immutable terms

The executable schema is [`verifier.ts`](experiments/causal-v2/verifier.ts).
It defines terms, position state, receipt/event, recovery records and an independently
supplied verification context. It is a strict-TypeScript computation API, not a general
untrusted HTTP parser. A production boundary must reject unknown/missing fields and
validate address/hash formats, lengths and all enum values before calling it.

Terms bind chain, pool, implementation/code hashes, assets and decimals, position
owner, beneficiary, exact reference method/path, risk settings/version, coverage window,
waiting period, minimum reference HF, deviation threshold, deductibles, participation,
limits and recovery/valuation rules. Policy/exposure IDs bind the immutable terms digest;
they are not part of the economic loss ID. Any changed terms require a new version.
The synthetic implementation fixes one collateral/debt pair; real Aave markets require
full deployed-code replay, all reserve assets, scaled balances/indices, E-Mode and flags.

## Encoding and provenance

Experiment hashing: `SHA256(UTF8("arcuex-causal-v2\n" + canonicalJson))`, labelled
`sha256:<64 lowercase hex>`. This is **not** Solidity Keccak, EIP-712 or a signature.
Canonical JSON recursively sorts ASCII object keys, preserves array order and string
bytes, permits only safe integer JSON numbers, rejects negative zero, undefined and
non-plain objects. Amounts/ratios are unsigned decimal strings without leading zeros,
at most uint256. Addresses/hashes must be normalized lowercase by the validated wire
schema; no Unicode normalization is implicit. Source code/runtime bytes use Keccak
where the EVM does. Do not interchange the two digest types.

An evidence bundle commits raw receipt, block header, position/replay witness, deployed
code/config, raw reference observations, recovery ledger and relationship investigation.
A claimant may supply a locator or document; it cannot supply the trusted comparison
digest, finalized header, whitelist or completeness decision. A self-hashed fabricated
receipt is still fabricated. `authenticateSynthetic()` is test scaffolding and must
never appear in a real claim collection path.

## Algorithm

1. Authenticate policy/registration from the policy ledger; validate exact chain,
   addresses, implementation, owner and beneficiary. Enforce pre-event registration,
   wait, covered interval and no post-bind risk increase. Reject provable mismatches.
2. Verify canonical finalized inclusion of the successful receipt and exact event.
   Require a trusted consensus header and receipt/state proofs, or a separately
   approved own-node/equivalent independent reconstruction policy. Streams HMAC or
   multiple endpoints sharing an upstream are insufficient. Missing/conflicting
   data → REVIEW. Our historical witness has **not** passed this gate.
3. Recover state at the selected transaction/call boundary, including earlier same-block
   transactions. Reject wrong locator/order. Execute the actual deployed method with
   all required storage; trap missing reads. Compare execution logs and relevant
   balances to the authenticated event. Do not equate parent-block state with pre-call.
4. Authenticate a contemporaneous independent reference: for this target, the deployed
   wrapper-to-stETH share conversion under the agreed stETH/base valuation assumption.
   Check reference code/control, relevant updates, slashing, pauses and redemption
   restrictions. A capped adapter cannot be its own independent reference. Stale,
   manipulated, unavailable or shared reference → REVIEW.
5. Compute observed eligibility and re-execute with only the covered oracle valuation
   changed. All position, debt, risk, block and execution-point data stay fixed.
   Require observed HF < 1 and reference HF >= max(1, contractual buffer), and confirm
   that the counterfactual actually prevents the selected liquidation. A narrative
   “healthy position” or two rounded screen HF values does not pass.
6. Verify actual economic depletion, debt benefit and recoveries. Related liquidator,
   fake protocol, deliberate exposure or proven fabrication → REJECTED. Unknown
   affiliation, unresolved compensation/rights or valuation → REVIEW.
7. Apply same-loss uniqueness and reserved capacities atomically outside this pure
   function. Produce deterministic findings/candidate payable and evidence digest.
   Authorized assessment/settlement remains a separate controlled action.

Implemented synthetic model uses exact arbitrary-precision integers and floors each
collateral valuation / threshold / HF operation. It uses 1e18 ratios/HF, explicit token
decimals and USDC micros. These equations are **not** an implementation of Aave's
GenericLogic rounding. The historical harness executes Aave bytecode, uses RAY half-up
debt accounting and records the raw unit scales. No historical numbers pass through
the simplified synthetic health formula.

## Loss and payout

At a fixed event timestamp, let C be **all** claimant collateral depletion including
protocol fees, D the actual debt reduction, R the contractual reference ratio and V
the independently authenticated event-time conversion from base units to USDC.
Account for direct proceeds and enforceable recovery rights without counting them
twice. Proposed formula:

```
Gbase = max(0, floor(C * R / ratioScale) - D)
Gmicros = conservativeConvert(Gbase, V)
net = max(0, Gmicros - authenticatedRecoveriesMicros - deductibleMicros)
candidate = min(policyRemaining, exposureRemaining, reservedEventRemaining,
                floor(net * participationBps / 10000))
```

For mixed collateral/debt assets use complete portfolio value deltas with explicit
valuation and rounding rules, rather than subtracting unlike token units. Round asset
loss down and debt benefits up where conversion is needed. Exact historical USDC
valuation and recoveries are unresolved here; do not convert 249.1874 WETH-equivalent
into a fabricated dollar payout. Existing receipt-only collateral/debt event amounts
are insufficient: the historical replay demonstrates fee and interest differences.

Recovery ledger records include transfer identity, amount/asset, beneficiary, causal
allocation, valuation time and source. Unknown is not zero. Future recoveries require
enforceable reimbursement/subrogation terms. Generic DAO allowance, duplicate ledger
row or a second policy cannot increase compensation.

## Finality, uniqueness and accumulation

On Ethereum, authenticate a finalized consensus header at/after the selected block;
on Arc Testnet adopt a verified chain-specific finality rule. The experiment's
`finalizedBlockHash` is a trusted-context input, not an implemented consensus check.
Reorg/contradiction invalidates pending verification; never silently preserve payment.

Loss ID: domain-separated digest of `(chainId, pool, owner, txHash, logIndex)` with
canonical encodings. Excludes policy/claim/delivery IDs. Add a global incident ID
covering oracle address + faulty configuration update + causal interval, shared by
affected pools. Track per-position liquidation lots within that incident. Deductibles
and recovery allocations apply to the contractual loss aggregate, so splitting one
loss into multiple logs/policies cannot reset caps or multiply reimbursement.

Reserve aggregate incident capacity before binding. Settlement must atomically insert
the loss ID, reserve/reduce policy/exposure/event balances and record the authorized
amount. The tests demonstrate serial shared-budget arithmetic, **not** concurrent
database enforcement or production capital adequacy.

## Scope of implementation

The v2 pure verifier returns VERIFIED only for a synthetic model with independently
held test context. HISTORICAL mode always returns REVIEW until an authenticated
historical proof adapter and recovery reconciliation are implemented. The separate
offline EVM runner establishes reproducibility of one supplied historical witness;
`REPLAY_COMPLETED` is not a claims outcome. [Adversarial tests](experiments/causal-v2/verifier.test.ts)
cover all B3 categories; [EVM regressions](experiments/causal-v2/evm-runtime/regression.test.mjs)
also remove a witnessed slot to ensure incomplete reconstruction fails explicitly.
