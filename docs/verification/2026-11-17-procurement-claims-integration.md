# Procurement + claims integration launch assessment

Verified: **2026-11-17**. Branch: **`integration/procurement-claims`**.

**CONDITIONAL GO for the explicitly labeled synthetic Arc Testnet beta.** The code integration is implemented and tested. An unconditional public launch remains gated on the authorized live wallet/operator run and launch-host checks below. This is not approval for real-world insurance or autonomous payouts.

Base: `feat/onchain-lifecycle` at `c30a29c`. Merged claims security checkpoint: `feat/claims-workflow` at `d627a7e`, preserving the histories of `0bfb266`, `feefab9`, `131fe17` and `d627a7e`. Merge checkpoint: `0519a11`. Reviewed hardening checkpoint: `7549228`.

The existing InsurancePool, Solidity sources, ABI and deployment manifest remain unchanged. **No financial transaction, deployment or broadcast occurred.**

## Integration decisions and reviewed boundaries

### One wallet authenticator

The claims nonce/session implementation is now shared by procurement and claims. Its compatibility cookie name remains `arcuex_claims_sid`; this does not represent a separate claims-only login. The SDK's old procurement nonce/bearer authenticator was removed, and its old database tables are retired.

- Wallet signatures validate a stored, origin/chain/address/expiry-bound message. Nonces expire after ten minutes and are single use. Nonce consumption and session creation are one transaction; concurrent verification admits only one session.
- Wallet authentication grants **claimant** identity only. Reviewer, authority and system permissions come from separately provisioned server credentials; caller-supplied owner, role, actor or `x-arcuex-*` identity headers cannot grant them.
- The shared eight-hour session is an opaque, host-only, httpOnly, SameSite=Lax cookie, with Secure enforced in production. No session token is returned in JSON or stored in browser sessionStorage/localStorage. Node SDK clients maintain a memory-only cookie jar; browsers use their native cookie jar.
- Procurement auth routes are compatibility adapters to the same nonce/session source. Claims logout revokes access to both features. Unsafe cross-origin requests are rejected. The optional expected-wallet header detects an account/session mismatch; it never authenticates an owner.
- Migration `008_shared_wallet_session_scope.sql` revokes earlier claims-only claimant sessions and consumes outstanding nonces, because their signed message promised a narrower purpose. Ops sessions preserve their roles. New shared sessions survive subsequent migration runs.
- Static claimant bearer tokens are retired. A bearer plus an asserted wallet/policyholder/agent header is not accepted as claimant identity. Provisioned ops/server bearer credentials remain role separated.
- Synthetic settlement permission requires both the stored authority permission and the currently enabled server flag. Turning the flag off fails closed even for an existing authority session.

### Canonical policy and exposure records

New public claim intake accepts only confirmed immutable procurement policies. It reads their existing owner, beneficiary, exposure, deductible, limit and coverage window. It does not copy a policy into legacy `policies` or an exposure into legacy `covered_exposures`, and does not introduce another policy model.

`claims_cases.procurement_policy_id` references the canonical procurement record. Its public `policyId` remains that same policy UUID. The exposure identifier is the registered agent UUID: each registered agent currently has one immutable exposure snapshot. A database trigger enforces the policy/exposure association and prevents retargeting the case's policy, exposure or incident.

The persistence context method is a read projection over the existing records, with a legacy adapter for historical rows. Legacy policy/quote reads are authenticated and owner-filtered. Historical claims remain accessible to their authenticated owner or provisioned ops; new public legacy-ledger claims intake is disabled.

### Claims authorization and loss identity

- Every customer case/policy list and detail read filters by the signature-backed owner. Foreign owners receive no case, timeline or evidence data. Ops/system roles can inspect the records their role permits.
- Intake authenticates and validates ownership before writing an incident. Case opening, submission and collection are transactional. Intake retries keep the same case; changing a policy/exposure/event under the same key is rejected.
- Incident timestamps must be within the accepted coverage window and cannot be future-dated. A confirmed policy's deployed fields must reconcile before new intake.
- A canonical observed event reference is required. For a policy/exposure/event tuple, intake reuses the incident across different request keys. This preserves the existing `@arcuex/onchain` loss-key computation and prevents fresh request IDs from creating a new loss key for the same event. The legacy compatibility path also reuses its canonical incident. Existing frozen bindings are not rehashed.
- The product's synthetic flag is derived from its immutable policy, overriding a caller's attempt to clear it. Claimant evidence labels cannot assert independent verification. Missing evidence, unverified loss and unknown recoveries retain REVIEW behavior and zero settlement authorization. Claimants may append evidence while in REVIEW but cannot bypass reviewer-only reopening through the completion endpoint.
- The existing ClaimsCase engine remains the only adjudication/settlement engine. Partial pending/paid compensation reduces remaining **net economic loss**, including deductible/recoveries, as well as the loss cap. Preparation also checks pending/paid commitments across all loss keys against the immutable policy limit.
- Frozen adjudication binds policy, exposure, amount, canonical loss key, evidence root and beneficiary. Preparation rechecks those fields, current manifests, synthetic permission and committed compensation.

The observed reference, position control and incident time are **synthetic attestations**, not independent financial-event proof. No external lending monitor or loss oracle was added.

### Settlement integration without broadcasts

The authority-only adapter uses the existing `prepareSettleClaim` transaction builder. It reads current deployed policy state, reservation, coverage window, beneficiary, authority and onchain same-loss accounting. The returned account is the designated claims authority. It does not sign or send a transaction.

`mark_paid` no longer accepts an arbitrary receipt reference as proof. It requires a successful Arc pool receipt from the claims authority at that block, with a matching `ClaimSettled` event for the exact policy, case/claim settlement ID, canonical loss key, beneficiary, amount and loss cap. The existing state machine still requires prior authorized preparation. Failed reconciliation does not record a paid transition.

When a case has no separate legacy claim UUID, its case UUID is the settlement-record ID passed through the existing `toClaimIdBytes32` helper. This is distinct from economic loss identity. No second settlement engine or alternate loss hash was introduced.

## Migration compatibility

Original migration IDs are full filenames, not their numeric prefixes. Both branch histories already use distinct `004_*` and `005_*` filenames. Their identities are preserved rather than renaming an already-applied migration and replaying it.

- Fresh databases apply all ten migrations in an explicit order.
- `007_procurement_claims_integration.sql` rebuilds the claims parent table to admit direct procurement references while preserving existing rows, child events, evidence and frozen binding JSON. It adds the canonical procurement incident association.
- Foreign-key enforcement is disabled only outside the single rebuild transaction, with pre/post integrity checks and unconditional restoration. A failed upgrade rolls back without recording the migration ID.
- Tests cover fresh databases, procurement-only history, claims-only history, the combined history, failed rebuild rollback and shared-session scope rotation. Existing immutable procurement snapshots, claims history and ops sessions are checked explicitly.
- The web native SQLite dependency and explicitly traced SQL directory from the procurement base are retained. Actual built-server HTTP/SQLite smoke verifies the production path, not merely the build compiler.

## Customer acceptance matrix

| Step / route                     | Implemented behavior                                                                                                                        | Verification                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `/coverage`                      | Connect, one wallet nonce login, register agent/exposure, eligibility, quote, exact terms acceptance, separate approval/bind wallet actions | Mocked browser journey; actual signature/SDK HTTP smoke; service/API tests    |
| `/policies/[id]`                 | Authenticated immutable terms, bind/approval links, read-only chain match, synthetic claim link                                             | Browser journey; ownership and reconciliation tests                           |
| `/claims/new?policyId=…`         | Same session, preselected owned procurement policy/exposure, canonical event reference, incident time, synthetic evidence intake            | Browser journey and actual API-handler/SQLite integration tests               |
| `/claims/[id]`                   | Owner-only case/timeline/evidence, investigation/REVIEW status, no customer reviewer controls, policy backlink                              | Browser journey, foreign-owner read/write tests                               |
| `/claims/review` and ops actions | Separate provisioned roles, frozen bindings and synthetic restrictions; no transaction broadcast                                            | Role, binding, REVIEW, same-loss and receipt tests; no live operator transfer |
| Legacy reads/mutations           | Owner-filtered policy/quote reads; claims ledger restricted to ops; public legacy mutations/intake disabled                                 | API authorization and containment tests                                       |

The full browser regression uses **mocked wallets, RPC and API responses**. It covers connect → authenticate → register → attest → quote → accept → rejected approval → retry → approve → bind → policy detail → claim intake → case detail. It advances the browser clock past scheduled coverage, asserts exactly one wallet signature for authentication, checks that JavaScript cannot read the httpOnly cookie, verifies absence of claimant reviewer controls and checks no horizontal overflow at 390px. It is not proof of a live onchain procurement or settlement.

Run [the browser fixture](../../scripts/e2e/procurement.browser.js) in a **fresh Playwright page** using the browser tool's filename option, with the built app on port 3003. The fixture advances its page clock and must not be reused on a previously advanced page.

## Verification results

- Full TypeScript suite: **175 passed**. Breakdown: domain 15, chain 5, onchain 47, persistence 10, QuickNode 9, insurance 38, agent SDK 10, web 41.
- Foundry: **22 passed**. Contracts unchanged.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: **passed** for the integrated branch. Run standalone typecheck after build to avoid a race while Next regenerates `.next/types`. The final standalone typecheck passed.
- Browser customer journey: passed with one authentication, httpOnly session, INVESTIGATING outcome, no privileged customer controls, zero financial broadcasts and no mobile overflow.
- Actual production HTTP/SQLite SDK smoke: passed owner/agent signature authentication, registration, authority inspection, quote preparation, idempotent cap reservation and revocation, with the policy correctly remaining prepared/unbound. Final smoke also asserts Secure/httpOnly/SameSite cookie flags and absence of a JSON session token.

Production smoke reproduction (no financial broadcasts):

```bash
pnpm build
pnpm --filter @arcuex/web start --port 3003
# Separate terminal:
pnpm --filter @arcuex/onchain exec tsx ../../apps/web/scripts/procurement-http-smoke.mts http://localhost:3003
```

The HTTP smoke creates local synthetic records under ephemeral test identities. It never prints or persists their private keys and does not approve or transfer USDC.

## Read-only Arc reconciliation

Observed 2026-11-17 using the checked-in manifest and `connectArcTestnetAdapter`, with provider URLs excluded from output:

| Field                         | Result                                       |
| ----------------------------- | -------------------------------------------- |
| Chain                         | 5042002                                      |
| InsurancePool                 | `0x6657974EEdF488380251bDD95A7FFfb0D456E49E` |
| USDC                          | `0x3600000000000000000000000000000000000000` |
| Runtime code present          | 4,517 bytes                                  |
| Assets / actual token balance | 4,100,000 / 4,100,000 micros                 |
| Reserved / available capital  | 1,000,000 / 3,100,000 micros                 |
| Shares                        | 5,100,000                                    |
| Adapter mismatches            | None                                         |

This is a point-in-time read, not a fabricated or cached UI metric. The current 1-USDC demo limit fits observed available capital; larger limits require separate authorized funding. These reads verify connectivity, expected token/code presence and accounting consistency; they do not establish an external insured loss.

## Exact remaining launch gates

1. **Authorized extension-wallet/operator run.** A funded real browser-wallet procurement, scheduled coverage start, synthetic incident intake and authority-preparation/receipt workflow must be exercised with separate explicit transaction authorization. No such financial broadcast was authorized or performed here. Mocked success must not be represented as that live acceptance.
2. **Launch environment verification.** Public hosting/HTTPS and forwarded-origin behavior, Secure cookies, distinct ops credentials, persistent SQLite storage, migration/native-driver assets, backups/restore and edge abuse/rate limits must be checked on the actual host. Local production startup/HTTP smoke passed; no public deployment was performed. Default synthetic settlement permission must remain off outside an explicitly authorized demo.
3. **Operational window and capital.** The deployed contract requires settlement within its recorded coverage window; the adapter blocks late/expired/cancelled preparation. It does not support a legal post-expiry claims tail. The observed pool has 3.1 USDC free capital, and no additional LP funding was authorized. Launch limits and operator response time must fit these constraints.

Known product limits are deliberate: the contract permits direct caller-priced/retroactive binds and does not enforce backend delegation or quote expiry; synthetic eligibility/evidence are attestations; compromised EOAs can bypass backend controls; EIP-1271 authentication and external incident verification are absent. These limits are disclosed and are incompatible with claims of production legal insurance. A stricter onchain guarantee would need a separately approved contract change; this integration does not propose or perform one.

Next handoff: run the authorized testnet acceptance against the launch host, provision the reviewer/authority runbook, monitor/reconcile approved settlement receipts, and keep external evidence verification as an explicitly separate scope expansion. The procurement-to-ClaimsCase data bridge and customer journey are implemented; they are no longer a claims-sprint placeholder.
