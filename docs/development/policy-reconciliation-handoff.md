# November 20 backend integration handoff

Implementation: `backend/nov20-policy-reconciliation`, based on release `fb6fe5d`.
Inspection/verification: November 17, 2026 local time (live RPC captures November 18 UTC).

## Ownership and merge contract with Cursor

Backend owns the additive `010_policy_reconciliation.sql` migration, migration registration,
`ProcurementStore.claimsEligible`, procurement claim-context validation, reconciliation engine/tests
under `apps/web/src/lib/server/policy-reconciliation*`, scripts under `apps/web/scripts/reconcil*`,
`policy-read-api*`, the new `/api/session/me`, `/api/policies/[policyId]/lifecycle`,
`/api/policies/reconciliation` routes, and `packages/domain/src/backend-contracts.ts`.

Cursor owns pages, components, hooks, app providers, navigation, layouts and global styles.
This branch changes none of those. Backend only adjusts the existing server-side
`claims-integration.test.ts` fixture to provide explicit canonical evidence.
At UI commit `887de65`, changed-file comparison against release shows no overlapping files.
This document is the integration contract; Cursor has not yet acknowledged or consumed it.
No merge or deployment has been performed.

## Authority map

| Field                                                             | Authoritative evidence                                                                          | Limits                                                                                                      |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Chain and pool                                                    | Existing Arc chain config and checked-in deployment manifest                                    | RPC chain ID is checked at both ends of each scan. No new network/address parameters.                       |
| Onchain policy ID                                                 | `toPolicyIdBytes32` of the persisted primary entity ID; exact event bytes32                     | Bytes32 cannot recover a lost UUID. Caller-selected IDs do not authenticate ownership.                      |
| Terms hash, beneficiary, premium payer, premium, limit, start/end | Canonical `PolicyBound` log and `policies` storage at the scan anchor                           | Pool does not interpret offchain terms. Payer/beneficiary do not establish owner or insured exposure.       |
| Offchain terms                                                    | Immutable quote/policy snapshot, recomputed `procurementDigest`, exact committed hash           | Never reverse-engineered from event amounts or dates.                                                       |
| Owner, agent and insured exposure                                 | Immutable authenticated registration, quote and terms acceptance, matched by IDs and digest     | Synthetic position control is an owner attestation, not an external financial-event/ownership proof.        |
| Delegation                                                        | Original policy's delegation ID and immutable delegation/revocation records at acceptance       | Lost delegated policy records are not reconstructed by selecting a plausible delegation.                    |
| Confirmation/provenance                                           | Chain/pool/tx/block number/block hash/log index plus actual block timestamp                     | Two descendant blocks by default are a confirmation-depth policy, not absolute finality.                    |
| Session/roles/capabilities                                        | Existing signed-wallet or server-provisioned ops session, expiry/revocation/config epoch checks | Workspace selection, address headers, query strings and frontend role labels grant no privilege.            |
| ClaimsCase and economic-loss identity                             | Existing canonical policy/exposure/incident bindings and loss-key helpers                       | No copied legacy policy, rehashed historic binding, new settlement authorization or changed financial math. |
| Settlement receipt reference                                      | Existing `SETTLEMENT_RECONCILED` ClaimsCase event                                               | Projection does not freshly verify a settlement. Existing historic settlement API/evidence is preserved.    |

The existing receipt confirmer remains available. Its `bind_tx` alone no longer makes a
procurement policy eligible for claims. Eligibility additionally requires fresh canonical indexing.
Legacy synthetic policy behavior and the historic settlement receipt endpoint are unchanged.

## Reconciliation and historical import

`reconcilePolicyBinds(db, fromBlock, toBlock, client?, confirmations=2n)` reads chain state and
writes only the local reconciliation index and safely recovered/confirmed procurement records.
It cannot sign or broadcast. Inclusive ranges contain at most 2,001 blocks. Use a confirmed
anchor at least two blocks behind the head. Every run revalidates all previously canonical
event block hashes, even outside the requested range, and refreshes their completeness.

The durable event key includes chain, normalized pool, block hash, transaction hash and log index.
A partial unique index permits one canonical bind per chain/pool/onchain policy ID. Identical
redeliveries and reruns are idempotent. Conflicting duplicate binds roll back the whole batch.
Missing logs in a rescanned range or changed canonical block hashes orphan previous observations;
the old provenance remains queryable. Reappearing events can be reconsidered on a later scan.
Immutable existing receipt references are retained; a different replacement transaction cannot
silently overwrite one and remains incomplete.

Each attempt first revokes scope freshness. Successful evidence/link/import/confirmation changes
and the healthy checkpoint commit in one SQLite transaction. A per-run ID prevents a slower,
superseded scan from committing after a newer attempt. RPC failures, chain/state disagreement,
mid-scan reorgs or failed database writes leave that attempt unable to grant eligibility. Errors
are sanitized and the same range can be retried; the viem transport has its existing bounded retry.
No cursor is advanced on failure. `through_block`/`through_hash` record the last successful
requested range endpoint, not proof that every preceding block has been scanned.

| Status             | Meaning                                                                                                  | Claims                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `VERIFIED_LINKED`  | Exact onchain match plus complete immutable quote, acceptance, registration, exposure and ownership link | Only the authenticated owner can intake; existing claim rules still apply. |
| `ONCHAIN_UNLINKED` | Confirmed event without a safely established local policy link                                           | Disabled. Never infer owner from payer/beneficiary.                        |
| `INCOMPLETE`       | Local identity found but required data is absent or disagrees                                            | Disabled. No fabricated replacement fields.                                |
| `ORPHANED`         | A previously observed event is absent or its block is no longer canonical                                | Disabled. Preserve historic evidence/accounting.                           |

A missing **self-procured** local policy can be recovered only from its original complete quote
and authenticated owner acceptance, both matching the event and registration. All original terms
and IDs are retained. Without those records, only chain evidence is imported. No claim, loss-key,
settlement, capital ledger or legacy policy row is created by import.

Run against a local database or reviewed offline backup, never the currently deployed Railway beta:

```sh
# Set ARCUE_X_SQLITE_PATH to an explicit local SQLite file, then supply decimal block numbers.
pnpm --filter @arcuex/onchain exec tsx ../../apps/web/scripts/reconcile-policy-binds.mts FROM_BLOCK TO_BLOCK

# Public RPC smoke, in-memory database only; optional bytes32 finds a historical bind block.
pnpm --filter @arcuex/onchain exec tsx ../../apps/web/scripts/reconciliation-read-smoke.mts
pnpm --filter @arcuex/onchain exec tsx ../../apps/web/scripts/reconciliation-read-smoke.mts POLICY_BYTES32
```

Before enabling claims in a future integrated deployment, an operator must cover the intended
historical range in contiguous batches, then poll overlapping recent confirmed ranges at least
once per five minutes (preferably once per minute). All prior canonical blocks are revalidated
on each poll. The job/scheduler is deliberately not installed on Railway by this sprint.
Missing/failed/stale (>300 seconds) checkpoints fail closed for procurement claims and retries.
For a large history this full prior-block revalidation has a linear RPC cost; measure throughput
before increasing beta volume. RPC completeness and correctness remain provider trust assumptions.

## Frontend read contracts

Import `SessionMe` and `PolicyLifecycle` as **types** from `@arcuex/domain`.
All routes are Node runtime, dynamic, `Cache-Control: no-store`, and use the existing API request
boundary/security wrapper. No route performs reconciliation or changes insurance/settlement state.
Production security middleware may update its existing rate-limit counters.

### `GET /api/session/me`

Uses only the existing httpOnly session cookie. Missing, invalid, expired, revoked or wrong-epoch
sessions return HTTP 200 with `{ version:1, state:'anonymous', wallet:null, chainId:null,
role:null, capabilities:[] }`. No bearer token is exchanged by this read.

Authenticated responses include `state:'authenticated'`, normalized `wallet` (or null for ops),
`chainId:5042002` for wallet sessions (null for ops), server role and capabilities:

| Role      | Capabilities                                |
| --------- | ------------------------------------------- |
| claimant  | `procurement:read`, `claims:intake`         |
| reviewer  | `claims:review`, `reconciliation:read`      |
| authority | `settlement:prepare`, `reconciliation:read` |
| system    | `reconciliation:read`                       |

Capabilities describe role-level access, not policy-specific eligibility or payout permission.
The chain ID is the signed session's domain, not the browser wallet's current selected network;
Cursor must retain its wallet chain/account-change checks. Session IDs, bearer tokens, reviewer
secrets, authority secrets and internal subjects are never returned. Switching workspaces cannot
change this response. Refresh after sign-in/logout/account change and on a 401 response.

### `GET /api/policies/{policyId}/lifecycle`

Requires an existing authenticated claimant/ops principal. Claimants may read only policies they
own or paid for; claim intake remains owner-only. `policyId` is the original UUID, never an
onchain bytes32 or arbitrary hashable string. Invalid, unknown and foreign IDs return 404;
unauthenticated requests return 401, with no foreign-policy disclosure.

The `PolicyLifecycle` version-1 projection includes original UUID and bytes32 identity, fixed
chain/pool, completeness, `checkedAt` in Unix seconds, owner-specific `claimsEligible`, optional
confirmation provenance/explorer URL, settlement case states/receipt references and safe explorer
URLs, and a synthetic-demo notice. Decimal block numbers are strings. Confirmation metadata
remains historical evidence when `state` is pending; do not display its presence as fresh coverage.

| Emitted state            | Evidence                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `prepared`               | Immutable offchain preparation, no indexed confirmation and quote still valid                                   |
| `confirmed`              | Fresh healthy `VERIFIED_LINKED` observation; may be before scheduled coverage start                             |
| `expired`                | Verified coverage end passed, or unconfirmed preparation's quote expired                                        |
| `reconciliation_pending` | Persisted bind reference/indexed observation exists but verification is missing, stale, incomplete or unhealthy |

`submitted` and `failed` are reserved typed states. They are **not emitted** because the base
release does not durably record a backend-authenticated submission or failed-bind receipt. Browser
session storage is not authoritative evidence. Do not convert approval receipts into bind submission.
`claimsEligible` means the owner may attempt intake under existing incident/exposure/window rules;
it does not guarantee adjudication or payout. Confirmed can precede coverage start, and an expired
policy can still describe an incident within its authenticated historical window.

Settlement metadata comes from existing case transition events, not a new settlement index.
Only a valid 32-byte transaction hash yields an explorer link. A missing reference stays null;
a case API row is not financial-event proof. Existing historic settlement data remains separately
available at `/api/claims/settlements/historic`.

### `GET /api/policies/reconciliation`

Same auth boundary. Returns `{ version:1, records:[{ onchainPolicyId, policyId:string|null,
completeness, claimsEligible:false, evidence }] }` for non-verified records.
`evidence` contains chain ID, pool, transaction hash, block number/hash, log index, actual block
timestamp, bytes32 policy ID, terms hash, beneficiary/payer and decimal integer amounts/dates.
Ops can inspect all records; wallet users see only records linked to their authenticated owner,
beneficiary or premium-payer relationship. Those latter relationships do not confer claim ownership.
Display this separately as **Reconciliation pending / incomplete**, with no claim CTA. There is
no write/import HTTP endpoint and no public privileged indexer trigger.

## Merge assessment

**CONDITIONAL GO** to integrate this backend branch with Cursor's UI branch after the documented
contracts are consumed and combined checks pass. The branches currently have no file overlap.
Backend tests/build and live read-only evidence are recorded in
[the verification report](../verification/2026-11-17-policy-reconciliation.md).

Conditions for beta claim availability: schedule the local indexer in the future integrated
environment, scan the intended history, observe a fresh checkpoint, and validate the complete
quote-to-bind-to-intake journey with Cursor's new header/navigation. Until then the fail-closed
eligibility change intentionally hides procurement policies from claim options. Historical policies
without their original terms/acceptance/exposure remain unlinked and nonclaimable. This is not a
GO for deploying, modifying the existing Railway beta, or issuing mainnet coverage.
