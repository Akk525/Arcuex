# Platform foundation compatibility

Implementation baseline: release source `f8365a85f0c4a6298f713be7e799cb7538ca1fc7`. Platform changes are isolated on `feat/platform-foundation`; no deployment, contract or production-data changes are included.

## Policy model decision before persistence

The original `Policy`/`CoverageTerms` model is the synthetic SQLite ledger workflow. `ProcurementPolicy`/`ProcurementTerms` is the authenticated Arc procurement workflow, with independently reconciled financial receipts. Neither is converted into the other, and neither becomes a new platform policy table in these slices.

The new `InsuranceProduct` is a product-definition envelope, not a policy or assertion of legal issuance. Versioned product publication history may be persisted independently; it never inserts, upgrades, copies or mutates either existing policy representation. Existing policies remain authoritative in their original models. A future new-offer integration must explicitly select a source model and pin a definition through an additive link; historical policies cannot be assigned invented publication approval.

Legacy product codes, USDC micro-units, serializers, quote hashes, `arcuex:policy:<uuid>` identities, loss keys, accounting and contract ABIs remain unchanged. New definition hashes use the separate `arcuex.<artifact-kind>.v1` SHA-256 profile and do not replace legacy keccak terms hashes.

## Approved slices

The user-approved A4 now means the read-only enterprise-AI examination scenario, superseding the earlier planning backlog's A4 questionnaire task. No general workflow editor, model provider or automatic payment executor is included. General currencies in product descriptions do not add a payment rail or alter current USDC accounting.

A1 adds strict product envelopes, explicit artifact/asset references and immutable snapshots. A3 adds concrete definitions and two synthetic templates. A2 adds product-only publication records with separate authors/approvers. A4 produces synthetic evidence findings and a review dossier with no live financial authority.

Test results and operational limits will be recorded after each implementation slice. Existing oracle and regression test files remain unchanged; additive compatibility tests establish the boundary.
