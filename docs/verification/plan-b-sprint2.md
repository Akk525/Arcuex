# Plan B Sprint 2: integration and adjudication

Verified locally November 18, 2026. This report authorizes no deployment, production migration,
transaction, data restoration or Plan A change.

## Reconciliation

Integration branch: `integration/plan-b-sprint2`, based on consolidated `main` `42e2c22`.

- `ff3d86481b81a75cc51dd88d63438924874a48b6` → `2290284`: persisted verification implementation.
- `aa96d16c2c02864cd62d10b9a8e040904890a916` → `bbe341e`: offline settlement/contract regressions.
- `d5135fe`: Sprint 2 adjudication, browser integration and financial-boundary regressions.
- Both source branches, `feat/plan-b-sprint1-verification` and
  `analysis/plan-b-sprint1-settlement`, remain at their original commits. No branch was deleted.
- The sole cherry-pick conflict was adjacent README additions; both links were retained.

Migration `011_claim_verifications.sql` is retained exactly from the verification source: one
append-only table with case/request deduplication, foreign key and update/delete prevention.
The twelve migrations through `010_policy_reconciliation.sql` remain byte-for-byte unchanged.
A new upgrade test seeds the consolidated twelve-migration schema, migrates twice, and checks
policy, incident, case, audit, capital, settlement and indexer rows plus foreign keys. There are
thirteen default migration records; product publication storage remains opt-in.

The preserved competing `011_policy_indexer.sql`, worker lease/cursor, eligibility projections
and supervisor are **not integrated**. Their recovery/worktree evidence remains as documented in
[consolidation](2026-11-18-repository-consolidation.md#intentionally-excluded). That implementation
still requires a separate reconciliation, schema handoff and restart/reorg plan. A database with
that competing implementation is not an accepted deployment/upgrade input for this sprint.

The original ClaimsCase transitions, migration `007` identity trigger, canonical policy and incident
models, loss keys, onchain code/ABIs and Railway files remain authoritative. No alternate policy,
state machine, indexer or settlement executor was added.

## Adjudication behavior

Fixture verification remains a separate, authenticated, persisted execution. It cannot approve,
deny, prepare or pay a claim. The current catalog is `wrongful-liquidation:v2`: its hashed raw
scenario now explicitly includes resolved zero recoveries and zero prior compensation. Gross
economic loss is derived from 2 USDC seized collateral less 0.5 USDC extinguished debt. The
fixture's illustrative deductible is not substituted for the actual linked policy deductible.
These are synthetic scenario assumptions, not real-world evidence or independent authentication.

A covered approval now requires all of the following:

1. An authorized reviewer/authority principal and the original linked policy/exposure/incident.
2. A persisted successful verification ID for that case and its current context. The context hash
   includes incident, canonical policy eligibility, full original terms and evidence manifests.
3. A catalog fixture manifest. Unsupported/additional noncatalog evidence requires review;
   an arbitrary claimant-uploaded JSON digest is not sufficient proof of loss.
4. No unresolved negative/missing execution in that same context. Choosing an older successful
   record cannot hide contradictory or missing evidence. The case remains in REVIEW with a reason.
5. Confirmed policy/reconciliation eligibility, incident association, incident time within the
   original window (including any legacy waiting period), registered exposure and frozen beneficiary,
   limits and deductible. Only the supported original synthetic products/contractual terms apply.
6. Explicit human confirmation of event applicability and resolved exclusions, with a nonempty
   rationale. Fixture consistency alone cannot establish either contractual conclusion.
7. Gross loss, resolved recoveries and prior compensation matching the supported persisted scenario.
   Unknown recoveries or arbitrary gross/recovery amounts cannot become payable.

The existing net-loss calculation subtracts the policy deductible, external compensation,
recoveries and existing same-loss commitments, then caps payment by request, exposure limit and
loss-cap room. Approval freezes the case/incident/verification/context, USDC with six decimals,
gross/deductions/net/limit/payable, beneficiary, evidence root, loss key, reviewer principal/role
and contractual rationale in the existing binding and decision audit event. The actual settlement
authority remains a separate principal/step. Server token authentication identifies the existing
provisioned role principal; it does not assert a natural person's identity beyond that credential.

The browser shows fixture findings and the absence of independent authentication, offers an
explicit attach/verify action, and requires contractual confirmation and rationale before enabling
the reviewer approval button. Claimants have no reviewer controls. The server enforces the same
requirements irrespective of browser state. The detail response/parser retain these findings.

Verification envelopes accept an optional positive `revision` to append a fresh execution after
context changes, without mutating prior records. Same-envelope retries remain idempotent; stale
replays fail. Reverification does not resolve contradictory records in an unchanged context or
silently remove unsupported evidence. A new supported evidence context and human review are
required; general evidence correction/withdrawal workflows remain outside this narrow slice.
Legacy v1 verification records lack the new assessment/context and cannot authorize a new approval.

## Financial boundary

Only offline tests connect the reviewed/authority-authorized result to the existing settlement
transaction builder. Decoded calldata must match policy, claim, canonical economic loss key,
amount, loss cap and beneficiary; the prepared transaction names the designated pool authority.
Identical inputs produce identical calldata. Existing backend/contract tests reject wrong owners,
unauthorized reviewers/settlers, altered bindings, duplicate claims/settlements, stale reconciliation,
insufficient reservation, policy/same-loss overcommitment and expired settlement windows.

The pool's USDC asset is fixed at construction; there is no client-selected asset argument.
The deadline is the original onchain policy `coverageEnd`, not a new signature deadline or caller
field. Tests accept the exact end timestamp and reject one second late. Contract tests verify actual
offline EVM replay protection, beneficiary transfers, conservation and solvency. A transaction
builder alone does not guarantee that a claim is unsettled; the contract remains authoritative.

Production synthetic settlement restrictions, runtime validation and wallet approval requirements
remain intact. No new live route or bypass was added. New bindings additionally recheck their
verification context before the existing settlement authorization. Historical bindings retain their
original checks. Test-only principals may use the existing explicit synthetic preparation permission;
public-beta/enforced production configuration still prohibits that permission.

## Validation

- `pnpm test`: **299 passed**, including 83 insurance, 99 web/API and 19 persistence tests.
- `pnpm test:contracts`: **46 passed**, including offline Sprint 1 inheritance/fuzz regressions.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: passed; final command logs are retained below.
- Existing mocked local Chrome browser regressions: **33 passed, 0 failed, 0 waived**.
- New mocked browser adjudication checks: **6 passed** (verification does not approve; human
  confirmation/rationale and persisted ID required; correct request bindings; claimant isolation).
- `git diff --check`: passed. No tracked contract implementation, onchain implementation or Railway
  source/config change. No live Arc/provider functionality was newly asserted or tested here.

[Workspace tests](plan-b-sprint2/workspace-tests.txt), [contracts](plan-b-sprint2/contracts.txt),
[typecheck](plan-b-sprint2/typecheck.txt), [lint](plan-b-sprint2/lint.txt),
[build](plan-b-sprint2/build.txt), [existing browser regression](plan-b-sprint2/browser-regression.txt),
[new browser results](plan-b-sprint2/browser-adjudication.json).
The browser harness uses mocked APIs and an isolated localhost server; real backend boundaries are
covered by in-memory SQLite/authenticated route tests. This is not a completed guided wallet run,
new hosted acceptance, external loss authentication, security audit or payout authorization.

## Readiness and remaining gates

**Ready for a guided local synthetic browser acceptance run**, using a fresh isolated database,
existing provisioned reviewer/authority sessions and a confirmed/reconciled synthetic procurement
fixture. For an eligible claim, paste the exact current catalog raw evidence into the submission
form (or create intake without a manifest, then use the detail attach/verify button). Arbitrary
upload text remains unsupported and must stay in review; the button does not sanitize or erase it.
Inspect verification findings, test unresolved recoveries, complete explicit human contractual review,
and verify APPROVED/pending-authority rather than PAID. The production restriction should block
synthetic settlement preparation. A live authenticated wallet/Arc/indexer guided run has not occurred.

**Not ready for a testnet payout under unchanged production controls.** The demonstrated loss is
still synthetic and production preparation is prohibited. A separately authorized testnet rehearsal
would require an explicitly isolated approved environment, a freshly reconciled funded policy whose
settlement window remains open, current pool/USDC/claimsAuthority/reservation checks, exact reviewed
transaction bindings and per-step wallet/operator authorization. Old expired policies cannot be used.
Those live preflights and authorizations are outstanding; no relaxation is implemented or implied.
No real-world authenticated loss source, arbitrary recovery assessment or mainnet issuance is added.

The exact Plan A remains `f8365a85f0c4a6298f713be7e799cb7538ca1fc7`, preserved by its fallback tag.
Nothing was pushed, deployed, broadcast or changed on Railway or in production data.
