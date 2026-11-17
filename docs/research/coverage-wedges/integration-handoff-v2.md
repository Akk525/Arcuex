# Integration handoff v2 — Codex A

Read-only inspection of `feat/onchain-lifecycle` at
`fff3404475941a05a5d9863881c670f6bae8dfa9` on 2026-11-17 UTC. That branch is active;
recheck interfaces before integrating. This research did not modify or merge it.

## Existing extension points

`packages/domain/src/interfaces.ts` currently exposes:

```
EvidenceProvider.collect({incident}) -> {bundle, facts}
IncidentVerifier.verify({incident,facts}) -> {verified,outcome?,reason}
CoverageRule.evaluate({policy,terms,incident,facts})
  -> {covered,outcome?,reason,payableMicros?}
```

`outcome` uses the existing `TriStateOutcome`. Set `verified`/`covered` true **only**
for VERIFIED. For REVIEW, return both booleans false, outcome REVIEW and zero payable;
preserve evidenced/pending review state instead of converting uncertainty into denial.
No domain-interface change is proposed. Existing immutable terms lack structured
wedge parameters; bind a versioned, immutable sidecar by digest, rather than parse
mutable notes. `synthetic` must match the evidence mode across policy, incident and rule.

## Concrete evidence handoff

Use schema `oracle-causal/2` and the encoding in [verifier spec](causal-verifier-spec.md).
Keep a raw-evidence store separate from string-valued `EvidenceFact` records. Proposed
fact keys are namespaced and versioned:

| Fact key                     | Required content / authenticated producer                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `oracle-causal/2.terms`      | Immutable underwriting-side sidecar digest; policy/exposure IDs and mode; policy service                                                        |
| `oracle-causal/2.locator`    | Chain/pool/borrower/block hash/height/tx hash/tx index/log index/call boundary; claimant may suggest, collector resolves                        |
| `oracle-causal/2.receipt`    | Raw receipt/log digest plus canonical inclusion verification; chain collector/proof verifier                                                    |
| `oracle-causal/2.state`      | Pre-execution code/storage witness, reserve configuration, collateral/debt balances, indices and all portfolio assets; archive/replay collector |
| `oracle-causal/2.reference`  | Raw stETH conversion and base-feed observations, code/path/time, source-integrity investigation; independent reference verifier                 |
| `oracle-causal/2.replay`     | Pinned engine/hardfork/code hashes, actual/counterfactual outputs, exact intervention and missing-read report; deterministic replay process     |
| `oracle-causal/2.loss`       | Complete collateral depletion, debt benefit, conservative valuation and proposed gross amount; deterministic loss calculator                    |
| `oracle-causal/2.recoveries` | All refunds/grants/other insurance/rights, beneficiary and allocation proofs; reconciler and authorized reviewer                                |
| `oracle-causal/2.control`    | Owner/beneficiary/liquidator/operator relationship investigation and exclusion decision; underwriting/claims authority                          |

Claimants may supply transaction locators, ownership challenges and supporting recovery
documents. They cannot supply allowlists, canonical headers, verified source facts,
finality decisions, completeness flags or the trusted hashes against which their
receipt is compared. Review independently sourced evidence, not simply a signed
arbitrary backend's conclusion.

### Minimum collector/proof requirements

For the selected historical target, allowlist Ethereum chain **1**, Core pool,
wstETH/WETH addresses and adapter exactly as [historical replay](historical-replay.md).
Do not automatically allowlist Prime, a current address-book implementation or a
similar event emitted from another contract. Incident-time proxies, implementation
slots, libraries and oracle source mappings must be authenticated. Arc mode must
allowlist chain **5042002** and the actual separately approved mock deployment.
Historical Ethereum data must never be labelled an Arc event.

Required RPC observations:

- `eth_chainId`, block-by-hash/number, transaction and receipt; complete block receipts
  for transaction/log ordering and receipt-root verification.
- `eth_getCode`, historical storage/config calls, historical oracle source mappings,
  all relevant asset metadata/risk settings, reserve indices and scaled balances.
- Exact pre-transaction witness (`debug_traceTransaction` prestate tracer or equivalent)
  plus own-node replay from an authenticated parent state through every earlier
  transaction. Traces alone are untrusted witnesses. `eth_getProof` may authenticate
  account/storage at block boundaries; it does **not** directly prove transaction-index
  state. Replay earlier transactions to reach that point.
- Wrapper ratio-provider code/state and ETH/USD source answer/round/update metadata at
  the same execution point. A stETH share conversion and a market ETH/USD feed answer
  answer different questions; both need integrity checks. Recoveries need direct
  beneficiary transfer/receipt and rights reconciliation.

[QuickNode proof documentation](https://www.quicknode.com/docs/ethereum/eth_getProof)
documents the RPC facility, not that these particular archive proofs are available
on an existing plan. No credential or QuickNode Ethereum endpoint was used here.

## Streams observations and exact event needs

Current [network matrix](https://www.quicknode.com/docs/streams/supported-chains), read
2026-11-17, lists Ethereum and Arc Testnet datasets. Provision and test them separately.
For Ethereum collect headers, transactions and receipts/logs, with trace capability
where needed. Pin ABIs by deployed-source digest before decoding:

```solidity
event LiquidationCall(address indexed collateralAsset, address indexed debtAsset,
  address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount,
  address liquidator, bool receiveAToken);
event CapParametersUpdated(uint256 snapshotRatio, uint256 snapshotTimestamp,
  uint256 maxRatioGrowthPerSecond, uint16 maxYearlyRatioGrowthPercent);
```

Liquidation topic0 observed in the captured receipt:
`0xe413a321e8681d831f4dbccbca790d2952b56f977908e45be37335533e005286`.
The CAPO event declaration comes from the deployed ABI in `adapter-verification.json`;
do not use the discarded early guessed signature in a production filter.

Filter exact pool + liquidation topic + indexed wstETH collateral, but retain **all
transaction receipts/logs** for loss accounting. Include collateral/aToken transfers,
variable-debt burns/index changes, protocol-fee transfers, oracle/admin/source changes
and beneficiary reimbursement transfers. The selected liquidation event's collateral
amount excludes part of the actual account depletion. Do not compute net harm from
that log alone. Configuration-update correlation must span Core/Prime when separately
verified, rather than reserve new incident capacity per pool for one shared oracle fault.

For the optional Arc mock use the new ABI in [synthetic demo](synthetic-demo-contract.md),
registration events, configuration changes and eventual approved settlement receipt.
No existing Arcuex deployment or Streams URL is assumed.

Validate [Streams webhook HMAC](https://www.quicknode.com/docs/streams/destinations/webhooks),
archive original bytes, check chain/address/topic/canonical hashes, backfill gaps and
invalidate orphaned evidence. Webhook HMAC authenticates delivery, not oracle accuracy,
transaction-index state, beneficial ownership or economic loss. A missing webhook is
never proof of absence. Store cursors and both delivery and economic-loss IDs.

## Adapter behavior and acceptance

1. `EvidenceProvider` collects evidence and records unresolved facts explicitly.
2. `IncidentVerifier` authenticates completeness and causal replay. Missing proofs,
   provider conflicts, unsupported code/hardfork, stale/reference dependency overlap
   or unknown relationships → REVIEW. Historical mode in the supplied pure verifier
   intentionally stops here with REVIEW.
3. `CoverageRule` binds exact product terms and computes net candidate only after
   verified cause AND authenticated recoveries. Formula and same-loss ID are in the
   [spec](causal-verifier-spec.md). No recovery ledger → no payable result.
4. Existing authorized assessment must enforce `authorizedMicros <= ruleCandidate`,
   same policy/exposure/terms/evidence digest, unique economic loss and atomic shared
   incident capacity. A caller-supplied authority string or model consensus is not
   sufficient. Never use the experiment's result as a transfer instruction.
5. Settlement follows the existing explicit wallet approval/authorized contract path.
   The SDK/UI can expose findings and review reasons without inventing a successful
   historical claim or real insured value.

Integration acceptance: replay the included historical witness offline; preserve its
REVIEW economics/authentication status; run all three synthetic cases; reject a forged
receipt, wrong execution point, related liquidator and duplicate loss; prove atomic
event capacity under concurrent production claims in Codex A's test suite. The research
does not implement that concurrency control or deploy a new protocol.
