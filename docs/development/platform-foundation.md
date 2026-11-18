# Platform foundation implementation

These additive local modules implement the approved A1, A3, A2 and synthetic enterprise-AI A4 slices. They do not change the deployed release, contracts, existing oracle runtime, policy identities, terms digests or financial accounting. They add no workflow editor, model provider, issuer, reserves or payment executor.

## Definitions and samples

- `packages/domain/src/product-definition.ts`: strict versioned `InsuranceProductSchema`, asset/reference contracts, domain-separated hashes and immutable snapshots.
- `product-coverage.ts`: typed exposures, occurrence/claims-made/discovery/circumstance triggers, reporting conditions, clause/exclusion references and evidence requirements. Definitions contain no executable expressions. Missing facts are not silently supplied.
- `product-templates.ts`: concrete, hash-resolved first-party Arc oracle and bank dispute liability specimens. Both are **synthetic draft templates**, not approved policies or priced offers. General currency descriptions do not create a fiat settlement rail.
- [Oracle definition](../examples/platform/oracle-product.json) and [bank-liability definition](../examples/platform/bank-dispute-product.json) are JSON examples. Template content is independently pinned by artifact digests. The existing oracle product and regression test files are unchanged.

See the [compatibility decision](../architecture/platform-foundation-compatibility.md). The original synthetic ledger Policy and Arc ProcurementPolicy stay distinct. This implementation adds no third persistent policy representation and performs no historical policy backfill.

## Product publication provenance

The pure publication state machine is in `packages/domain/src/product-publication.ts`. Persistent, product-only history is provided by `ProductPublicationRepository` in `packages/persistence/src/product-publications.ts`.

Registry initialization is **explicit opt-in** through `initializeProductRegistry(db)` on an intentionally selected local/test SQLite database. The existing twelve default migrations are unchanged; default app startup does not create registry tables. No production registry is initialized by these slices.

The embedding server must authenticate organization, subject, permissions and authorization reference before constructing a `ProductPrincipal`. This trusted application context must never be copied from caller-provided JSON, product configuration or model output. No new HTTP mutation endpoint or identity provisioning system is introduced here.

The author creates an immutable draft version, requests review, and may withdraw a review. A separate actor with approval permission approves the exact content. An actor with publication permission then publishes it, referencing the independent approval event. Retirement is another append-only event. Even an actor holding both author and approval permissions cannot approve their own version. Stale revisions, illegal transitions, cross-organization access and backdated events are rejected. Content and provenance cannot be updated/deleted through the registry, and SQL triggers protect these invariants. Edits create a new version even during drafting.

These product permissions grant no quote, bind, adjudication, settlement or other financial authority. Stored provenance records software authorization decisions, not regulatory/carrier approval. Root authority provisioning, a future authenticated UI and broader tenant isolation are outside these slices.

## Read-only bank examination

The synthetic examiner receives submissions, separately supplied observations, a validated product template and an explicit fixture trust store. It has no repository, reserve or transaction executor. It does not issue policies or update live claims.

Each case has an AI recommendation and final decision with acting principal, time, model version and correlation reference. Source IDs, recorded times, event IDs and content digests retain provenance. Separate financial observations represent compensation, fines, recoveries and expenses. Ephemeral Ed25519 fixture attestors sign these records; the examiner verifies against operator-supplied public keys and permitted record kinds. A record cannot install its own trusted key. Private attestor keys stay in the generator's memory and are never written or logged. These are **synthetic attestations**, not independently verified bank records or wallet signers.

Override identification compares actual recommendation, final decision and actor, independently of requested fixture population counts. Missing/duplicate/forged/contradictory records create explicit uncertainty. Incomplete source metadata cannot authorize an action. The fixture's model recommendation is not assumed correct merely because it was recorded.

For the standard 1,800-case specimen:

- 1,350 records show a human final denial overriding an AI approval recommendation.
- 450 show recorded AI denials and remain potentially eligible **pending further checks**, never automatically payable.
- A contrary submitted AI-only attribution generates an evidence discrepancy and an adjuster/SIU referral, not a finding of intentional fraud.
- Enabling/disabling the specimen human-intervention exclusion changes only the preliminary policy-wording-dependent finding, not evidence attribution.
- Causation, legal liability and fraud remain unestablished. Issued wording, chronology, legal review, independently substantiated loss and prior compensation are missing-information requests.

The output includes case-level findings, record references, aggregate counts, loss categories, missing information and a structured Tier 3 adjuster/SIU dossier. `uncertainEvidenceCases` measures source-record uncertainty only; zero does not establish coverage, liability or a fully investigated claim.

## Quantum interpretation

Amounts are integer units with an explicit asset/scale. In the bank specimen, USD scale 2 means cents. Each category retains its own assessment status and evidence reference. Unknown, duplicate, incorrectly denominated or unauthenticated categories remain uncertain.

For individually synthetic-assessed compensation, expenses and recoveries, the examiner computes **candidate economic net** as `max(compensation + expenses - recoveries, 0)`. Fines remain separate, with insurability/coverage still requiring review. The net is not a covered quantum, a reserve or a payable amount; no deductible/limit application is invented without a complete issued-policy assessment. For example, the first two cases have economic nets of 10,200 and 10,278 cents, rather than allocating loss by the 450/1,800 case ratio.

No outcome can change reserves, bind coverage, deny coverage, rescind a policy, authorize settlement or pay. Those output capabilities are all false and each case has settlement authorization `none`. Existing financial accounting is not called or modified.

## Generate and inspect the dossier

```sh
pnpm install --frozen-lockfile
pnpm --filter @arcuex/insurance example:bank-review
```

The command writes only synthetic local artifacts in this checkout:

- `.data/platform-foundation/bank-synthetic-evidence.json`: 1,800 submissions, 10,800 signed observations, template and public fixture trust roots.
- `.data/platform-foundation/bank-review-dossier.json`: complete case-level and aggregate review dossier.
- [Committed dossier summary](../examples/platform/bank-dossier-summary.json): aggregate results, limitations and example human/AI-attributed cases with full-artifact hashes.

Counts and substantive findings are reproducible. Ephemeral attestor keys/signatures and artifact hashes change on regeneration. Local full artifacts are ignored by Git; no private keys, actual bank/customer records, application database paths, wallet interactions or network requests are involved. The script does not load the production environment.

## Outstanding questions for the human reviewer UI

1. Which authenticated organization provisions product author, approver, publisher and examiner roles, and how are grants revoked and reviewed? A role label must not become insurer or financial authority.
2. How should an examiner distinguish allegation, recorded attribution, evidence authenticity, causation, liability, preliminary exclusion analysis and final authorized determination on screen?
3. Which original logs/documents can each reviewer see, and what redaction, privilege, retention/legal-hold and source-trust rules apply? Avoid exposing 1,800 customers' data in a portfolio summary.
4. What is the workflow for contested actor identity, shared accounts, missing audit periods, corrected records and independent corroboration of AI recommendation correctness?
5. How should per-head compensation, fines, recoveries, expenses, prior payments, deductibles, sublimits and aggregates be reviewed without treating candidate economics as payable loss?
6. Who can refer to SIU, assess misrepresentation and approve a reserve recommendation? What communications/appeal and specialist legal review are required before denial or rescission?
7. How are new evidence and changed wording represented without rewriting historical findings or applying a new product version retroactively?
8. What separate, scoped authority and review process would be required before any reserve mutation, adjudication decision or financial action exists? These slices deliberately provide none.

Product-specific wording and jurisdictional decisions require the responsible insurance specialists. The templates and scenario do not establish insurability of fines, covered loss or fraud.

## Verification

Run `pnpm test`, `pnpm typecheck`, `pnpm lint` and the contract regression command `pnpm test:contracts` where Foundry dependencies are installed. Existing test files were retained. New tests cover content immutability, bundle substitution, publication provenance/access, 1,800-case classification, record tampering/uncertainty, exclusion changes and differentiated loss categories. Final results and any environment blockers are recorded in the compatibility report after verification.
