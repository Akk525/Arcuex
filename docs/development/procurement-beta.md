# Arc Testnet procurement beta

Staged procurement and read-only Arc verification updated **2026-11-19**.

The existing pool is `0x6657974EEdF488380251bDD95A7FFfb0D456E49E` on Arc Testnet chain `5042002`. The synthetic oracle-liquidation demo is available by default. The independent-evidence pilot is owner-purchased and requires the externally provisioned [reviewed protocol and verifier profile](../independent-liquidation.md). Both use fixed testnet schedules. The staged flow has been exercised offline with an emulated wallet and RPC.

## Human journey

1. Open `/coverage` and select a versioned product from the server catalog. The page distinguishes a fixture quote from a quote eligible for Arc payment preflight. The separate capacity read is a snapshot.
2. Connect and sign in with an Arc wallet. Select an owned exposure for the product or register a new exposure. Confirm the product’s health, known-incident and control attestations, and choose the allowed limit, duration and beneficiary.
3. Generate and inspect the immutable quote. The synthetic product offers limits of 1, 10, 50 or 100 USDC and durations of 1, 7 or 30 days, subject to registered exposure. The independent pilot offers 1 USDC for seven days with the owner as beneficiary. Premium is limit divided by 100 and deductible is limit divided by 10 in integer USDC micros. Quotes reserve no capital.
4. Accept the exact digest. This creates or returns the same offchain record and reserves backend delegation budget when applicable. Portfolio details let the accepted payer resume an unexpired purchase. Fixture mode stops at quote review.
5. Click **Approve exact USDC premium**. The server checks the accepted payer, product, quote expiry, deployed chain, contract, token, existing bind, capacity and payer balance, then returns the exact unsigned approval. The browser simulates the call and the wallet prompts for authorization. Receipt verification records the allowance transaction.
6. Click **Pay premium & bind policy**. Before returning unsigned bind calldata, the server repeats the checks and verifies the current allowance. The wallet prompts again. The pool pulls the premium and reserves the limit within the same successful bind.
7. Confirm the matching receipt. Canonical index linkage and a fresh reconciliation checkpoint are required before the portfolio shows confirmed coverage. The policy stays scheduled until inception. Submitted hashes can be rechecked without sending a second transaction, including from the portfolio if the original browser session is interrupted.

Coverage is scheduled **15 minutes after quote creation**. Quotes expire after **10 minutes**. A supported bind must be mined before quote expiry and after terms acceptance. Confirmation alone does not advance the scheduled start. A late bind can succeed onchain but is **ineligible for backend recognition**; the UI and docs disclose this contract limitation. Do not submit near the deadline.

## Agent SDK/API

Preferred remote client: `ProcurementApiClient` from `@arcuex/agent-sdk`. Keys never enter the API or SDK. The owner first authenticates, registers the agent/exposure, and creates a delegation on `/agent`. The agent authenticates using the registered signer wallet. Agent funds pay the premium; owner funds are not pulled through this backend.

```ts
const api = new ProcurementApiClient({ baseUrl: 'http://localhost:3000' });
await api.authenticate(agentAddress, (message) => externalSigner.signMessage({ message }));
const products = await api.products();
const product = products.products.find((entry) => entry.purchaseAuthority === 'owner_or_delegated_agent');
if (!product || products.paymentMode === 'fixture_offline') throw new Error('Arc payment unavailable');
const capacity = await api.capacity();
if (capacity.status !== 'verified' || BigInt(capacity.availableMicros!) < 1000000n)
  throw new Error('Capacity unavailable for the selected limit');
const authority = await api.authority({ delegationId });
if (authority.revoked || authority.expired) throw new Error('No current authority');
const quote = await api.quote({
  idempotencyKey: 'stable-request-identifier',
  agentId,
  delegationId,
  productCode: product.code,
  productVersion: product.version,
  beneficiary: authority.delegation.beneficiary,
  limitMicros: '1000000',
  durationDays: 7,
  eligibility: {
    positionHealthy: true,
    noKnownIncident: true,
    syntheticOnly: true,
    ownerAttestsControl: true,
  },
});
// Inspect exact immutable terms, current authority and demo limitations before accepting.
const accepted = await api.accept({
  quoteId: quote.terms.quoteId,
  acceptedDigest: quote.digest,
  delegationId,
});
const payment = { policyId: accepted.policy.terms.policyId, acceptedDigest: quote.digest };
const approval = await api.payment({ ...payment, stage: 'approve' });
// The external wallet can authorize approval.transaction in a separately approved live run.
// After a verified approval receipt, request the exact bind.
await api.approval({ policyId: payment.policyId, hash: approvalHash });
const bind = await api.payment({ ...payment, stage: 'bind' });
// The external wallet can authorize bind.transaction separately.
await api.confirm({ policyId: payment.policyId, hash: bindHash });
const status = await api.lifecycle(payment.policyId, agentId);
```

Owner registration requires `idempotencyKey`, `signer`, `label`, `position`, `exposureMicros`, and `ownerAttestsControl: true`. Optional chain/protocol inputs, when supplied, must match the supported product. Delegation requires `idempotencyKey`, `agentId`, `premiumCapMicros`, `limitCapMicros`, `beneficiary` (defaults to owner), and Unix-second `expiresAt` within 30 days. The registered position and allowed product are fixed into the delegation. Only the authenticated owner may create or revoke it.

Delegation premium caps are **cumulative** across all prepared policies, including abandoned or failed preparations. Per-policy limit caps are enforced separately. Preparation and cap reservation share a SQLite transaction. Retrying the same quote returns the same policy without reserving twice; a different quote cannot consume the same remaining budget. A replay with a different acceptance digest or authority is rejected. Quote/registration/delegation request keys reject reuse with different inputs. No automatic budget reset/release is implemented.

All authenticated endpoints now share the wallet nonce/httpOnly session implementation with claims. Signatures bind an origin, Arc Testnet, wallet, single-use nonce and expiry. Nonces last ten minutes; wallet sessions last eight hours. The host-only cookie is httpOnly, SameSite=Lax and Secure in production. No bearer/session token is exposed to browser JavaScript or stored in sessionStorage/localStorage. Node SDK clients keep their cookie jar only in memory. Smart-contract-wallet/EIP-1271 authentication remains unsupported. Ops roles require separate server-provisioned credentials and cannot be asserted by an agent. Procurement delegation does not grant claims ownership or reviewer/authority rights.

Old procurement bearer sessions are retired. Pre-integration claims-only wallet sessions/nonces are invalidated once during migration to require a fresh shared-purpose signature. See the [integration assessment](../verification/2026-11-17-procurement-claims-integration.md) for migration, security and launch evidence.

| Method     | `/api/procurement/…`        | Behavior                                                                    |
| ---------- | --------------------------- | --------------------------------------------------------------------------- |
| GET        | products                    | Published product versions, supported configurations and payment mode        |
| GET        | capacity                    | Current Arc free capacity, unavailable state or offline fixture state        |
| POST       | auth/challenge, auth/verify | Challenge and wallet authentication                                         |
| GET / POST | agents                      | Identify/register owned or assigned agents                                  |
| GET / POST | delegations                 | Inspect/create scoped owner permissions                                     |
| POST       | delegations/revoke          | Owner revocation                                                            |
| POST       | authority                   | Inspect delegated scope, expiry/revocation and remaining budget             |
| POST       | quotes                      | Validate exposure/eligibility and freeze terms                              |
| POST       | accept                      | Freeze exact digest and payer/delegation, with no calldata                   |
| POST       | payment                     | Fresh preflight and one exact unsigned approve or bind request              |
| POST       | procure                     | Compatibility flow for acceptance and both unsigned transactions             |
| POST       | approvals                   | Verify and persist exact ERC-20 approval receipt                            |
| POST       | confirm                     | Verify bind receipt and deployed immutable state                            |
| GET        | policies, policies/[id]     | Authenticated history/detail and read-only reconciliation                   |

`POST /api/agent/procure` is an alias for the authenticated procure endpoint. `POST /api/procurement` preserves the older action-shaped `ProcurementHttpClient` API, using the same authorization/preflight handler. Legacy `POST /api/coverage` returns 410: caller-provided `fundingVerified` no longer creates policies. Older generic ledger/claims routes remain synthetic demos and do not issue this product or transfer onchain funds.

## Exact enforcement boundary

The deployed [InsurancePool](../../contracts/src/InsurancePool.sol) is permissionless for binding. It does **not** verify an insurer-signed quote or interpret the terms hash. Backend recognition must never be described as a contract guarantee.

| Policy term/control                                                             | Existing contract enforcement                                                                                     |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Policy UUID                                                                     | Hashed to bytes32; mapping prevents duplicate binding                                                             |
| Complete versioned terms                                                        | Digest stored immutably; semantic meaning not interpreted                                                         |
| Beneficiary                                                                     | Stored nonzero address; settlements must pay it                                                                   |
| Premium                                                                         | Pulls the caller-supplied nonzero amount; does not validate demo schedule                                         |
| Limit                                                                           | Nonzero, fully reserved from available capital; payout bounded by remaining limit/reservation                     |
| Payer                                                                           | Immutable msg.sender recorded at bind                                                                             |
| Start/end                                                                       | End > start; settlement must occur in the recorded window; **retroactive starts are allowed by the raw contract** |
| Agent/owner, product/protocol/position/notional, eligibility, quote ID/deadline | Digest commitment only; backend checks/attestations                                                               |
| Deductible, insured-event definition, exclusions                                | Digest commitment only; claims authority must evaluate offchain                                                   |
| Delegation scope/caps/expiry/revocation                                         | Backend only; no contract delegation mechanism                                                                    |
| Claims authorization                                                            | Designated claimsAuthority; never an AI majority vote                                                             |

SQLite uses insert-only snapshots, unique policy/quote/receipt keys and SQL immutability triggers. Revocation is a separate append-only record. Backend controls **cannot protect a compromised EOA**, revoke already prepared calldata/allowance, stop direct contract binding at arbitrary pricing, or prevent a direct retroactive bind. Direct or mismatched bindings are not recognized by this beta. No contract redeployment is required for these explicitly limited backend guarantees. Strong onchain underwriting/delegation/expiry would require a separately approved contract change.

## Launch blockers and claims handoff

- A funded, externally approved wallet run of this new UI remains outstanding. Development uses mocks/read-only queries, per the no-broadcast instruction. Do not claim a new live policy was procured by this implementation.
- The pool had 2.11 USDC available at Arc block 73083356 on 2026-11-19. Limits above 1 USDC need additional capacity; this session neither deposited nor requested a transaction. Capital may change or be consumed concurrently; the bind contract remains authoritative.
- Position health and control remain underwriting attestations. The independent pilot requires the approved verifier profile and independently authenticated claim evidence before settlement preparation.
- Public hosting/HTTPS, edge request-rate limiting, operational SQLite persistence/backup and actual extension-wallet/device testing must be verified in the launch environment. No deployment was performed here. The unauthenticated challenge endpoint requires deployment-level abuse limits.
- The UI does not automatically restore abandoned delegation budget. Revocation blocks new payment preparation and blocks recognition when the grant was revoked or expired at the bind block. The contract can still accept previously issued calldata and existing allowances.
- Claims integration now consumes the immutable procurement snapshot/digest and verified bind time; evaluate only incidents after effective time and within expiry; reconcile chain cancellation, remaining reservation and payouts; apply deductible and exclusions with deterministic synthetic replay; preserve lossKey/claimId uniqueness; require designated claimsAuthority authorization. The ClaimsCase intake now links directly to procurement records, validates incident timing and freezes the accepted beneficiary. Existing generic claims retain their historical references; they are not copied into new policies. See the integration assessment for the remaining launch/operator handoff.

See the [acceptance/verification record](../verification/2026-11-17-procurement-beta.md) for per-screen evidence and remaining gaps.

## Runtime packaging

The web app directly depends on the native `better-sqlite3` driver so Next can externalize it. `getDb` supplies the source SQL migration directory explicitly; Next traces those SQL files from the monorepo root. Run `pnpm dev` / the filtered web start command from the checked-out repository. Deployment packaging must retain the traced migration files and a native driver compatible with its Node/platform. The local built-server smoke above verifies this path; a successful build alone does not.

## Canonical reconciliation requirement (November 17 backend sprint)

Receipt confirmation alone no longer enables procurement claims. The canonical reconciliation
index must establish the immutable quote/acceptance/agent/exposure link, and its healthy chain
checkpoint must be no older than five minutes. Missing historical records remain visible through
`GET /api/policies/reconciliation` with claims disabled. The read-only `GET /api/session/me` and
`GET /api/policies/{UUID}/lifecycle` contracts, local operator commands, recovery rules and merge
conditions are documented in the [backend handoff](policy-reconciliation-handoff.md).
The currently deployed Railway beta has not been changed.
