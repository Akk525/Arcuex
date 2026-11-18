# First three implementation tasks

These are PR specifications for review, not code already written or permission to begin implementation. Sequence: **A1 → A3 → A2**. A3 supplies the concrete coverage/evidence contracts before product approval semantics are finalized. All three are local contracts and pure functions, without financial execution or production migration.

## PR 1 — A1 Define the product envelope and immutable references

**Proposed title:** `feat(domain): add versioned insurance product definition contracts`

**Problem and outcome:** Product information is split between metadata-only `CoverageProduct` and hardcoded `PROCUREMENT_PRODUCT`. Add one new descriptive contract that future services can reference while leaving both existing contracts intact.

**Owned files:** New `packages/domain/src/product-definition.ts`, `product-canonical.ts`, their tests, small test fixtures and additive exports in `packages/domain/src/index.ts`. Read the scoped domain AGENTS.md before implementation. Do not edit existing product, terms, monetary or transition modules.

**Contract to implement:**

- A schema-versioned `InsuranceProductDefinitionV1` envelope with stable product identity, positive definition version, display information, synthetic classification and organization/party-role references. A party reference identifies an intended role; it does not certify insurer status or grant authority.
- Explicit typed immutable references for exposure, coverage/trigger, wording, questionnaire, underwriting rules, claims evidence requirements, routing rules, workflow definitions and supported settlement capabilities. A reference carries kind, stable ID, version and content digest. Unsupported reference kinds/schema versions fail validation. Descriptive asset metadata uses explicit identifier and integer scale; it does not implement FX or balance operations.
- Canonical definition content is separate from publication state, approval records, computed hash and operational timestamps. Version a domain-separated digest profile for new definition content, with deterministic canonical JSON. Reject non-JSON values, duplicate ambiguous representations and unsupported numbers; do not silently strip unknown keys before approval hashing.
- Retain canonical content as the authority, not a mutable JavaScript object. An approved content reference must resolve to the exact bytes/digest. In-memory readonly types or freezing are convenience protections, not substitutes for immutable storage and references.

**Test matrix:**

| Case                                                                                                          | Expected result                                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Descriptive oracle product and non-Arc property-exposure specimen                                             | Valid envelopes with explicit synthetic/unapproved status; neither requires a wallet field in the generic envelope. |
| Unknown schema/reference kind, negative amount/scale, floating-point monetary value, malformed version/digest | Reject with a field-specific validation error.                                                                      |
| Extra `script`, executable callback, authority-grant or unknown key                                           | Reject; no arbitrary configuration payload is evaluated.                                                            |
| Equivalent JSON key ordering                                                                                  | Same canonical content/digest for this new profile.                                                                 |
| Change a nested requirement reference or wording version                                                      | Different canonical content/digest; no stale-reference reuse.                                                       |
| Publication status/approval event changes                                                                     | Approved content bytes/digest unchanged.                                                                            |
| Existing legacy product/quote fixtures                                                                        | Original parsing, serializers and terms digests unchanged; no new required field.                                   |

**Acceptance gate:** Unit tests and `pnpm --filter @arcuex/domain typecheck` pass; root typecheck catches export/import regressions. Diff is limited to additive domain contracts/tests/exports. No runtime feature is claimed merely because the envelope parses.

**Non-goals:** Product registry persistence, public API, builder UI, product approval, issuance, runtime rule evaluation, policy backfills, new dependencies/providers or modified legacy hash algorithms.

**Review questions:** Does a nonfinancial/non-Arc specimen parse without a misleading blockchain default? Can identity, authority or executable behavior be smuggled into a definition? Are canonical content and mutable publication metadata separated explicitly?

## PR 2 — A3 Define concrete coverage and evidence artifacts

**Proposed title:** `feat(domain): model coverage triggers and product evidence requirements`

**Problem and outcome:** Existing procurement assumes an Arc lending position and a single observed-event time window. Add product-specific typed definitions that preserve distinct trigger/notice, classification, technical causation and liability requirements.

**Owned files:** New `packages/domain/src/coverage-definition.ts`, `evidence-requirements.ts`, corresponding tests/fixtures and additive exports. Consume PR 1 immutable references. Do not modify `ClaimsCase`, `Incident`, `CoverageTerms`, existing loss keys or USDC arithmetic.

**Contract to implement:**

- `InsuredExposureDefinition`: explicit subject kind (person/entity/activity/system/asset) and registered schema reference; descriptive product constraints, not arbitrary dynamic code or a universal ownership oracle.
- `CoverageDefinition`: insuring-agreement and clause IDs, named insured/activity/territory constraints, event classifications, trigger and notice definition references, exclusions/conditions, limits/sublimits/deductible descriptors, and product-selected indemnity or parametric quantum method references. A method reference is not executable or approved merely because its ID is valid.
- Trigger families for occurrence, claims-made-and-reported, discovery-and-reported and circumstance notice, with explicit event/discovery/demand/report date roles. Retroactive dates, reporting periods, timezone/precision and applicable clauses are product data. Optional means justified/not applicable, never defaulted from an unrelated policy form.
- `EvidenceRequirementDefinition`: requirement ID, facts/documents needed, relevant checkpoint/clause, permitted source categories, required verification-attestation category, freshness/cardinality, confidentiality classification and retention-policy reference. Distinguish source content, verification result and advisory assessment. An independent verifier's identity/trust scope must be resolvable later; a free-text `verificationMethod` is insufficient proof.
- Resolution of artifact IDs and bounded typed conditions within a bundle. Reject references to unsupported rule types or cycles. Questionnaire execution is A4, rule execution is B2/B3, and real evidence authentication is D1.

**Test matrix:** occurrence vs claim/report date; discovery vs report date; retroactive/extended-period constraints; missing material date remains unknown; liability-not-applicable requires a product-specific reason; evidence source claim is not a verification; conflicting source requirements; malformed references/cycles; a synthetic oracle specimen; a descriptive property specimen; indemnity and parametric benefit descriptors with no executable payout.

**Acceptance gate:** Fixtures retain the source document's actual nine checkpoints, including claim/event classification and separate liability. No universal AI risk score, copied insurer reporting deadline, LLM confidence threshold or financial method is embedded as a platform default. Existing domain tests/typecheck remain green. This PR creates no new route, verifier provider or settlement action.

**Compatibility proof:** Legacy fixture terms and old serializers remain byte-identical. Product V1 descriptive specimens are not retroactively attached to historical policies as if approved at issuance. Oracle behavioral fixture integration remains A6.

**Non-goals:** Claim adjudication execution, legal conclusions, document collection services, AI models, generic programming-language predicates, capital changes or actual product publication.

## PR 3 — A2 Define publication lifecycle and approval provenance

**Proposed title:** `feat(domain): define immutable product publication transitions`

**Problem and outcome:** An `active` boolean does not express which exact product wording/rules were reviewed. Model publication as versioned content plus separate lifecycle events, without claiming to implement real insurer authority.

**Owned files:** New `packages/domain/src/product-lifecycle.ts`, tests and additive exports. Consume A1 content references and A3 artifact validation results. Persisting the lifecycle is A5, after tenant/authority/audit tasks.

**States and permitted effects:**

| Transition                    | Required local contract condition                                                                                                                                  | Preserved invariant                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Draft revision → review       | Complete bundle validation and exact revision/content reference                                                                                                    | Review identifies the exact content, not a moving latest pointer.                                 |
| Review → approved             | Trusted authorization-decision reference, reviewer/approval provenance, unchanged content/revision, required independent approvals satisfied in the input contract | Content remains immutable. This pure module does not authenticate the decision or mint a grant.   |
| Review → revised draft        | Documented change request and new revision identity                                                                                                                | Previous submitted content and reasons remain available.                                          |
| Approved → retired            | Retirement authority-decision reference and reason                                                                                                                 | New offers may be stopped; issued policies and historical versions remain readable and unchanged. |
| Edit approved/retired → draft | Prohibited as an in-place mutation; create a distinct successor version                                                                                            | No rewriting of the version previously approved or issued.                                        |

**Test matrix:** every allowed/forbidden edge; optimistic revision conflict; changed nested artifact after review; missing/mismatched approval digest; author-only self-approval when independent review is required; forged caller role string without a trusted decision input; retirement with historical references; no change to prior approved content when a successor is created.

**Acceptance gate:** Pure-function tests and domain/root typecheck pass. All outputs are JSON-safe lifecycle events or validation failures. Reviewers can see precisely which security checks are deferred to E1/E2/A5; no public endpoint trusts the new input contract before those checks exist.

**Compatibility:** Original `CoverageProduct.active`, current product constants and bound-policy terms remain unchanged. No production database, new publication endpoint, workflow execution or carrier-approved status is created.

## Shared validation and handoff

For each implementation PR, install only the pinned repository dependencies with pnpm if required; use in-memory/temporary test data. Run relevant domain tests/typecheck/lint and then the broader existing checks warranted by the changed dependency boundary. CI already defines `pnpm lint`, `pnpm typecheck`, package tests, Foundry tests and build. Do not replace assertions with updated snapshots to hide a digest/ID change.

The audit did not execute these future tests or write implementation files. After review, these tasks can be implemented one at a time. A1/A3/A6 complete the smallest useful descriptive product-contract slice; A2 ensures approval semantics are settled before any registry is activated. The next local evaluation tasks are B2 underwriting and D3 tier routing. The live beta remains on the release branch throughout.
