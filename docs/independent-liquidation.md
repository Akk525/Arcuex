# Independent oracle-liquidation pilot

Product code `ARC_ORACLE_LIQUIDATION_INDEPENDENT_V1`. Verifier `arc-oracle-liquidation-independent-v1`. This is an opt-in Arc Testnet pilot. The acceptance uses an isolated database, emulated chain reads and ephemeral evidence keys. The pilot needs a reviewed protocol deployment and independent evidence authorities before anyone can submit a live candidate.

## Existing synthetic gates

| Stage | Existing control and effect of the pilot |
| --- | --- |
| Product and issuance | `packages/domain/src/procurement.ts` defines the original synthetic product, protocol and exclusions. `packages/agent-sdk/src/procurement.ts` selects those terms for the demo protocol. The pilot is separately registered, priced and committed in an immutable terms digest. |
| Policy reconciliation | `apps/web/src/lib/server/policy-reconciliation.ts` requires a matching canonical bind and policy state, including the original synthetic attestation for demo terms. The pilot has an exact separate terms predicate and requires the owner as payer and beneficiary. |
| Incident and claim intake | The claims API derives evidence mode from the confirmed policy. A pilot incident needs the canonical Arc event reference. The server checks claimant access and exposure linkage. |
| Requirements and verification | Demo approval depends on its catalog fixture and deterministic fixture verifier. The pilot verification route exclusively runs the independent profile. A caller-supplied manifest or method label cannot authenticate pilot evidence. |
| Human adjudication | Both paths require existing reviewer authority and a documented contractual determination. Demo approval requires the fixture manifest and record. Pilot approval requires a matching current independent record, manifest, incident and canonical block. |
| Settlement preparation | Fixture deployments and synthetic claims remain blocked from production preparation. Independent preparation reuses the verification ID and context frozen in human approval, rechecks canonicality and freshness, and applies existing confirmation, role, loss and reservation controls. |

## Coverage and limits

- A registered bytes32 lending position on the configured reviewed protocol is liquidated in Arc Testnet chain ID 5042002. The collateral and debt extinguished by the liquidation are denominated in USDC. The position owner must be the frozen policy owner and payout beneficiary. The current pilot is owner-purchased. An authenticated registered agent may file for the linked exposure under existing claims permissions. Delegated buying is outside this product.
- The adapter ratio at execution must be strictly below the onchain liquidation threshold. Independent replay of the same pre-liquidation position and state, substituting the approved canonical oracle input, must put the ratio at or above that threshold and exclude other sufficient causes. An auditor must substantiate that the oracle error caused the loss under the policy terms. Market movement, ordinary insolvency, misconduct, known or pre-existing liquidation, other assets or protocols, unregistered positions, unresolved recoveries and duplicate losses are excluded.
- Premium 0.01 USDC, deductible 0.10 USDC and payout limit 1 USDC. Gross loss is actual USDC seized minus USDC debt extinguished. The common adjudication calculator deducts independently substantiated recoveries, prior compensation and the deductible, then applies the contractual and remaining limits. Zero recoveries or compensation require an affirmative attestation. The approved canonical event reference may have only one active or paid commitment across claims in the authoritative database.
- Quotes expire 10 minutes after issuance. Policy inception is 15 minutes after quote issuance, with a seven-day coverage window. Reconciliation requires a successful eligible bind before quote expiry and inception. The incident’s recorded time must equal the canonical block timestamp exactly, in UTC epoch milliseconds derived from Arc’s integer Unix seconds. The shared chronology gate accepts both effective-window endpoints and rejects future incidents. Human approval and preparation require an unexpired pilot policy. The existing pool enforces an active onchain window at execution, including the contract’s expiry second. Schedule any separately authorized rehearsal with ample margin before expiry.
- Recovery accounting must cover at least through the incident and expire five minutes after the signed cutoff. Both approval and unsigned preparation must use the same still-current record. The existing state machine has no route to refresh an approved claim in place. Run approval and preparation within that window. An expired approval is held by the current controls.

## Verifier contract

**Profile and trust roots.** The server reads `ARCUEX_INDEPENDENT_LIQUIDATION_PROFILE` only on the Arc Testnet source. Its value is a JSON object with `verifier`, `emitter`, `runtimeCodeHash`, `replayPublicKey` and `recoveryPublicKey`. Addresses and hashes are lowercase hex with `0x`. Each distinct Ed25519 public key is a raw 32-byte lowercase hex string without a prefix. Omit the variable to keep the pilot unavailable. An approved profile is frozen into the policy digest and matched to server configuration at verification, approval and preparation. Key custody, rotation and review are external operational responsibilities. Version 1 supports one configured profile at a time. Plan continuity for in-force policies before rotating pins. Private evidence keys stay with the two authorities.

**Chain input.** The server’s RPC client queries a successful direct transaction to the reviewed emitter and verifies that its historical runtime bytecode hash matches the pin. The receipt and both reads of the canonical block must agree. The application requires two descendant blocks and checks the anchor again before approval and preparation. The receipt must contain exactly one emitter event with this ABI, and exactly one matching Arc ERC-20 USDC transfer from emitter to the non-owner liquidator for the seized amount.

```solidity
event CoveredLiquidation(
    bytes32 indexed positionId,
    address indexed owner,
    address indexed liquidator,
    address asset,
    uint256 seizedUsdcMicros,
    uint256 extinguishedDebtUsdcMicros,
    uint256 adapterRatioBps,
    uint256 liquidationThresholdBps
);
```

The emitter review must establish that the event represents an executed liquidation, that the extinguished debt and adapter inputs reflect real state changes, and that upgradeable dependencies cannot invalidate those semantics. Bytecode pinning authenticates the approved runtime and the token event corroborates the outflow. It does not independently establish debt state or causation. Version 1 has no interchangeable event adapters.

**Proof envelope.** Submit to `POST /api/claims/cases/{id}/verification` with existing claim access. The JSON object has `body`, `replaySignature` and `recoverySignature`. Signatures are lowercase 64-byte hex strings. `body` is a JSON string serialized with ECMAScript `JSON.stringify`, no additional whitespace, with exactly these keys in order.

| Ordered keys | Values |
| --- | --- |
| `verifier`, `chainId` | `arc-oracle-liquidation-independent-v1` and integer `5042002` |
| `caseId`, `policyId`, `exposureId`, `incidentId` | Persisted UUIDs |
| `termsHash`, `transactionHash`, `logIndex`, `blockHash` | Exact lowercase hashes and integer receipt log index |
| `replayDigest`, `canonicalRatioBps`, `otherCausesExcluded` | Nonzero 32-byte artifact digest, integer bps, explicit boolean |
| `accountingDigest`, `recoveriesResolved`, `recoveriesMicros`, `priorCompensationMicros`, `accountedThroughMs` | Nonzero 32-byte artifact digest, explicit boolean, exact nonnegative USDC micro amounts as decimal strings, and integer Unix milliseconds |

Each authority signs the UTF-8 bytes of `arcuex/arc-oracle-liquidation-independent-v1/<role>\n<body>`, where `<role>` is `replay` or `recovery`, with a literal newline between prefix and body. The replay artifact should preserve the block and transaction anchors, pre-liquidation balances and adapter inputs, the authoritative price feed and round provenance, and a reproducible same-state replay with other causes addressed. The accounting artifact should preserve gross event amounts, each disposition of liquidated assets and debt, and each recovery or prior compensation item with source and cutoff. Both authorities must use independently sourced records, verify the entire signed claim binding, and retain the artifacts for the reviewer. The service checks their signatures and digests. Reviewers must obtain the artifact preimages through their approved evidence channels. Version 1 does not retrieve those preimages or run the replay itself.

**Persisted result.** The verifier records an append-only execution with input digest, evidence context digest, verifier version, actor, outcome and reasons. Only a successful execution adds the authenticated evidence manifest, anchor, freshness deadline and loss assessment. The approval binds the exact verification ID, evidence root, digest, payout recipient and amount. Settlement preparation rechecks that binding and the existing financial constraints. Rejected or stale proof leaves the claim unpayable on that evidence. Model findings are outside this product’s verification and authority path.

**HTTP acceptance flow.** With the profile provisioned, the existing procurement API exposes a second catalog product. The owner registers the position and obtains and accepts a matching quote. Only independently reconciled policy state permits intake. The authorized claimant submits the event reference `evm:5042002:<lowercase transactionHash>:<logIndex>` and canonical observed time. Submit the authenticated envelope, complete evidence through the existing claims endpoint, and require human adjudication using the persisted verification ID and exact supported amounts. An authority-only preparation request confirms the frozen recipient, amount, loss key and evidence root. Its output is unsigned calldata. Final `PAID` remains gated by existing settlement receipt reconciliation.

## Remaining live dependencies

1. Review and pin an actual Arc Testnet protocol and its historical runtime, and establish an eligible USDC position and a genuinely qualifying liquidation. Provision a trusted archival Arc RPC and verify historical code, receipt and canonical chain reads at incident depth.
2. Appoint independent replay and recovery authorities. Establish the canonical price feed and reproducible replay procedure, access to auditable artifacts, and a reliable recovery/prior-compensation process. Use one authoritative claims database for duplicate-event commitments.
3. Check the existing deployed pool, available reserve, policy holder funds, gas, active coverage and designated settlement authority immediately before a separately authorized financial rehearsal. Obtain separate authorization for any policy or financial operation. An approved claim or unsigned payload is insufficient to establish payment.

Arc references: [Arc Testnet network and chain ID](https://docs.arc.io/arc/references/connect-to-arc) and [Ethereum JSON-RPC receipt and block semantics](https://ethereum.org/en/developers/docs/apis/json-rpc/).
