# Decision brief

Phase B update: see [final go/no-go](final-go-no-go.md) and
[handoff v2](integration-handoff-v2.md). Historical witness replay succeeds, but
independent authentication and recovery reconciliation remain incomplete.

Research checked 2026-11-16 local / 2026-11-17 UTC. Implement the **synthetic
oracle exchange-rate liquidation wedge** first (83/100). Strongest fallback:
**external protocol deposit impairment** (80/100). See [all six scores and
disqualifications](candidate-comparison.md). These are conditional product hypotheses,
not a production underwriting recommendation or a claim of actuarial viability.

## Recommended insured event

A registered agent-owned lending position is liquidated because a specified adapter
understates an independently verifiable wrapper redemption ratio; exact-state replay
shows the position would otherwise remain healthy. Indemnify only seized value less
debt extinguished, recoveries, deductible and retained loss, within reserved limits.
Do not insure all liquidation volume or generic oracle-price disagreement.

This gives Arcuex the clearest narrow causal question to demonstrate: **would this
liquidation have occurred with the contractual canonical ratio?** The
[CAPO postmortem](https://governance.aave.com/t/post-mortem-exchange-rate-misallignment-on-wsteth-core-and-prime-instances/24269)
and [reimbursement proposal](https://governance.aave.com/t/direct-to-aip-wsteth-capo-oracle-incident-user-reimbursement/24275)
document why the peril matters, without establishing an Arc market for it.

Buyer: agent treasury owner using a listed lending market; beneficiary: same owner's
pre-registered payout account; premium payer: owner or disclosed sponsoring platform.
Business benefit: residual protection of capital already inside an external protocol.
Wallet limits constrain future actions; they cannot correct that protocol's oracle.
Require a leverage buffer and loss retention alongside cover.

## Fallback and switch condition

If no independent, economically valid redemption reference and transaction-index
replay can be demonstrated for a real target market, stop oracle integration and use
the [protocol impairment specification](protocol-impairment.md). Cover only a listed
independent protocol's qualified exploit and demonstrably unrecovered registered
principal. This has broader need but slower, more discretionary incident qualification
and recovery valuation. Neither wedge requires pretending a service timeout is a loss.

## Trust assumptions and threats

- Canonical finality, receipts and ordered historical state are available. Two RPCs
  sharing upstream infrastructure are not independent economic truth.
- For the oracle wedge, the canonical wrapper ratio represents the contractually
  intended valuation and is not manipulated/restricted. A market depeg is excluded.
- Reviewers authenticate exploit qualification, relationships, recovery rights and
  reference validity; keys/attestations can be compromised. Conflicts → REVIEW.
- The claimant cannot create the covered protocol/oracle or benefit through its
  liquidator/LP/attacker. Pre-listing and affiliation review are indispensable.
  Undetected collusion remains the strongest threat to both wedges.
- Immutable registration, continuous exposure, waiting period and no post-bind risk
  increases prevent buying protection after discovering a loss. Insider knowledge
  remains harder to detect than late deposits.
- Compensation, rebates, surviving rights and other insurance are reconciled.
  Durable same-loss uniqueness and atomic policy/event capacity prevent double pay.
- Streams transport authentication is not event adjudication. Never use webhook
  receipt, a synthetic ledger entry or AI votes as payout authorization.

## Real dependencies and next decisions

1. Select one actual independent lending/wrapper market and verify its intended
   valuation, deployed code/admin control, ABI, finality and replay method. No such
   Arc deployment is verified by this work. Do not build a fake production protocol
   just to create an insurable event. Arc can host a synthetic demonstration and
   eventually settlement, while external-chain exposure would require separately
   approved multi-chain collectors and legal scope.
2. Reconstruct one historical erroneous liquidation from raw receipts/state, including
   all compensation. Acceptance: two independent reviewers reproduce the same
   causal result and net loss. A source-backed narrative is not that reconstruction.
3. Ask at least five treasury/platform operators for actual positions, current risk
   controls, required remedy, acceptable retention and willingness to pay. Go/no-go:
   identify a funded pilot buyer and a coverable exposure, rather than infer demand
   from incident headlines. Do not choose premium from the fixture constants.
4. Get an underwriter/capital provider to accept event accumulation, recovery rights
   and the relationship controls; obtain jurisdiction-specific issuance/distribution
   review. No live capital commitment, license or insurance authorization established.
5. Provision QuickNode Streams credentials, a reachable authenticated receiver,
   archive access and immutable raw evidence storage. Current repo docs say Streams
   is incomplete; this research tested only the public RPC chain/block read.

Differentiation must be **pre-registered agent exposures and reproducible causal/loss
evidence**, not “first oracle insurance” or merely “an insurance MCP.”
[Current competitors and precise limitations](sources.md#competitor-check) include
Nexus's oracle/code coverage, OpenCover's agent-facing entry and service bonds.

## Interface handoff for Codex A

Read-only repository review at base `d9d47a5` found existing
`EvidenceProvider`, `IncidentVerifier`, `CoverageRule` in
`packages/domain/src/interfaces.ts`, a string-valued `EvidenceFact` schema, and
`collectAndValidateCoverage` in `packages/insurance/src/claims-pipeline.ts`.
No production files were changed. Do not merge a fixed insurance peril into domain.

Suggested versioned external evidence envelope (proposed, not implemented wire format):

```ts
type WedgeEvidenceV1 = {
  schemaVersion: 1;
  mode: 'synthetic' | 'verified-external';
  productCode: 'oracle-ratio-v1' | 'protocol-impairment-v1';
  policyId: string;
  exposureId: string;
  termsDigest: string;
  chainId: number;
  pool: string;
  codeHash: string;
  owner: string;
  beneficiary: string;
  event: {
    blockHash: string;
    blockNumber: string;
    timestamp: number;
    transactionHash: string;
    transactionIndex: number;
    logIndex: number;
  };
  lossKey: string; // chain + canonical event/position/covered loss lot
  rawEvidenceDigests: string[];
  methodVersion: string;
  verifierId: string;
  verifierSignature: string;
  positionStateDigest: string;
  replayDigest: string;
  recoveryLedgerDigest: string;
  relationshipReviewDigest: string;
  payload: unknown; // validate against the chosen wedge schema, no loose casts
};
```

Amounts on wire: decimal strings in USDC micros, never floating point. Ratios/HF:
explicit scale and bigint decimal strings. Digests commit canonical serialized bytes;
use an agreed serialization/hash algorithm before implementing signatures. No
algorithm or signature interoperability is claimed by this research.

Minimal approved follow-up work, outside this branch's scope:

| Component         | Concrete integration change                                                                                                                                                                                                                  | Acceptance criterion                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| EvidenceProvider  | Collect raw receipt/state, validate provenance, store envelope/digests as namespaced facts; select fixture provider only for synthetic policies                                                                                              | Synthetic evidence cannot satisfy external policy; immutable terms digest and real registration match    |
| IncidentVerifier  | Verify allowlisted chain/address/code, finality, completeness, ordered replay, independent authority and reference; never authorize transfers                                                                                                | Forged log, wrong chain, contaminated reference and partial history cannot validate                      |
| CoverageRule      | Separate product strategy implements the selected specification; produce reason code, evidence digest and payable micros                                                                                                                     | Happy/rejected/ambiguous fixtures reproduce; amounts limited by verified net loss and capacity           |
| Claims adapter    | Preserve `REVIEW` with zero payable; current boolean interfaces cannot express it directly. Map to non-validated/evidenced incident plus explicit audit/manual-review record, or add a reviewed typed result in a separately approved change | REVIEW never becomes covered, automatic denial or a submitted payable claim                              |
| Authority/capital | Existing explicit assessment and settlement path; add same-loss uniqueness across policy/claim IDs and atomic event/exposure reservations/recovery updates                                                                                   | Concurrent claims cannot exceed event allocation; duplicate delivery and duplicate loss cannot pay twice |

Current production terms lack structured wedge-specific parameters, event reservations
and a verified evidence digest contract. A namespaced, versioned evidence/terms sidecar
is a possible minimum; Codex A must choose and validate the design, rather than hiding
binding parameters in mutable free-text notes. The current claims path's independent
authorization call must enforce the rule-derived payable amount; do not assume a
`payableMicros` return alone prevents a later caller requesting more.

Start with the offline fixture provider and explicit synthetic policy. The schema above
is the proposed bridge to real verification, not permission to deploy contracts or
change UI/API. [Demo steps and blocked work](demo-and-verification.md) name the actual
events, evidence requirements and provider dependencies.
