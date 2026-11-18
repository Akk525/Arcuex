# Platform foundation compatibility

Implementation baseline: release source `f8365a85f0c4a6298f713be7e799cb7538ca1fc7`. Platform changes are isolated on `feat/platform-foundation`; no deployment, contract or production-data changes are included.

## Policy model decision before persistence

The original `Policy`/`CoverageTerms` model is the synthetic SQLite ledger workflow. `ProcurementPolicy`/`ProcurementTerms` is the authenticated Arc procurement workflow, with independently reconciled financial receipts. Neither is converted into the other, and neither becomes a new platform policy table in these slices.

The new `InsuranceProduct` is a product-definition envelope, not a policy or assertion of legal issuance. Versioned product publication history may be persisted independently; it never inserts, upgrades, copies or mutates either existing policy representation. Existing policies remain authoritative in their original models. A future new-offer integration must explicitly select a source model and pin a definition through an additive link; historical policies cannot be assigned invented publication approval.

Legacy product codes, USDC micro-units, serializers, quote hashes, `arcuex:policy:<uuid>` identities, loss keys, accounting and contract ABIs remain unchanged. New definition hashes use the separate `arcuex.<artifact-kind>.v1` SHA-256 profile and do not replace legacy keccak terms hashes.

## Approved slices

The user-approved A4 now means the read-only enterprise-AI examination scenario, superseding the earlier planning backlog's A4 questionnaire task. No general workflow editor, model provider or automatic payment executor is included. General currencies in product descriptions do not add a payment rail or alter current USDC accounting.

A1 adds strict product envelopes, explicit artifact/asset references and immutable snapshots. A3 adds concrete definitions and two synthetic templates. A2 adds product-only publication records with separate authors/approvers. A4 produces synthetic evidence findings and a review dossier with no live financial authority.

Existing oracle and regression test files remain unchanged; additive compatibility tests establish the boundary. A1 was committed as `5e1fd06`, A3 as `316d060`, and A2 as `f653ee9`; A4 is committed as `9e981f2`; all four slices are on the same isolated branch.

Publication persistence is explicitly opt-in via `initializeProductRegistry(db)` on a caller-selected local database. The default `openDatabase` migration list and its twelve historical migrations are unchanged. The registry stores only immutable product bundles and append-only publication events; no platform policy representation is introduced. Database triggers prevent updates/deletes and invalid event sequencing. Every application operation uses a transaction and organization-scoped, server-trusted product permissions. No HTTP endpoint, tenant provisioning, insurer authorization root, financial permission or deployment is added. The embedding application must authenticate the principal and resolve grants outside untrusted product/workflow content.

Product content is immutable starting at draft: edits create a new version. Approval and publication are distinct events. A product author cannot approve their own version, even if they also hold the approval permission. Publication references the independent approval event, and retirement preserves content and provenance. These records establish software provenance only, not regulatory or insurer approval.

## Compatibility evidence

| Boundary                      | Verification                                                                                                                                                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy synthetic policy/terms | New domain golden test retains the original terms JSON and policy ID preimage. Existing legacy services and regression tests are unchanged.                                                                                                                                  |
| Issued Arc V1 quote           | New `agent-sdk/src/platform-compatibility.test.ts` recomputes the historical `0xf45654…d3add` digest, `0xb14dc8…d638` on-chain policy ID and exact previously authorized bind calldata. No transaction is sent.                                                              |
| Oracle product                | Existing `PROCUREMENT_PRODUCT`, `ProcurementService`, pricing/timing behavior and oracle test files remain unchanged. The new descriptive oracle template retains its event/exclusions; it does not replace live pricing or underwriting.                                    |
| SQL startup/history           | Existing twelve default migrations remain unchanged and their historical upgrade tests pass. Registry initialization is opt-in. New tests preserve a pre-existing record byte-for-byte and verify no policy rows are created.                                                |
| Monetary/accounting paths     | `UsdcMicros`, net-loss math, capital math, loss-key functions and on-chain source/ABI are unchanged. New generic asset descriptors and candidate economic calculations have no financial execution consumer.                                                                 |
| Reviewer output               | 1,800 synthetic cases and 10,800 signed observations replay to the saved dossier. The 1,350 human overrides are derived from records; 450 AI denials remain pending, not payable. Fines are separately represented.                                                          |
| Synthetic trust               | Only operator-supplied fixture public keys are used. Missing, forged, duplicate and contradictory records remain uncertain; signatures do not prove actual bank activity or legal causation. Exported evidence contains no private key material.                             |
| Authority                     | Product author/approver separation and organization-scoped product permissions are enforced for repository operations. The scenario has no reserve, decision, denial, rescission, settlement or payment capability. No server financial permission is granted by a template. |

## Verification results

All checks were local to the isolated worktree. No deployment, production data access or financial broadcasts occurred during implementation.

- `pnpm test`: 254 package tests across eight packages/app targets, including the two added historical financial-identity goldens.
- `pnpm typecheck`: passed across the workspace; the final added compatibility test also passed its package typecheck.
- `pnpm lint`: passed across the workspace; the final added compatibility test also passed its package lint.
- `pnpm build`: passed, including the existing Next.js application build. No live application behavior was changed or newly browser-tested.
- `pnpm test:contracts`: 22 tests passed. Initially blocked by missing ignored Foundry libraries in the fresh worktree. Reused existing local cached `forge-std` 1.17.0 and OpenZeppelin 5.2.0 in this worktree's ignored `contracts/lib`; no tracked contract file changed. Relevant cached source SHA-256 values: `forge-std/src/Test.sol` = `6ac6a04a9723f3b51a86fcd0c4cf02e8011f112df052a8eea8e986d85b0bb3d7`; `SafeERC20.sol` = `8d3062e8831a07bab894607a7e6990f0b336024079ed5baaaae1f2b103e292ad`.
- `pnpm --filter @arcuex/insurance example:bank-review`: generated the full local synthetic evidence and dossier plus committed summary. Replaying the exported evidence reproduced the dossier exactly; both recorded file hashes matched.
- Baseline diff check: existing regression test files, financial service implementations, legacy default migrations and tracked contracts remain unchanged. The sole dependency addition is the local `tsx` development runner for the reproducible example; no provider/service integration was added.

See [the implementation guide](../development/platform-foundation.md) for sample definitions, output paths, synthetic-evidence limitations and eight outstanding reviewer-UI decisions. The full local JSON artifacts are ignored by Git and can be regenerated; the compact summary and source generator are committed. No generic workflow runtime/editor, real-world evidence verification, insurer approval, tenant onboarding, binding/adjudication authority or automatic payout is claimed by these slices.
