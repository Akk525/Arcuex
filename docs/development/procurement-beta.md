# Arc Testnet procurement beta

Implementation and read-only deployment verification: **2026-11-17**.

This is a synthetic demonstration of oracle-adapter-induced wrongful lending liquidation. It is not legal insurance, mainnet issuance, externally verified position protection, or real risk pricing. The existing deployed pool is unchanged: `0x6657974EEdF488380251bDD95A7FFfb0D456E49E`, chain `5042002`. No transaction was broadcast during implementation.

## Human journey

1. Open `/coverage`, connect an injected EVM wallet, and switch to Arc Testnet if needed.
2. Sign a nonce-bearing sign-in message. Authentication does not authorize a transfer. Load existing agents or register an agent signer, synthetic position identifier and exposure value in integer USDC micros. Registration attests control; no external protocol ownership check is integrated.
3. Choose a registered agent, limit, duration and beneficiary. Complete all four eligibility attestations. Unknown incidents, unhealthy positions, non-synthetic evidence and lack of position control fail eligibility. Only the registered demo protocol is supported.
4. Generate a quote. Demo limits are 1, 10, 50 or 100 USDC, bounded by the registered exposure; durations are 1, 7 or 30 days. Premium is limit / 100 and deductible is limit / 10, using bigint micros. This is a **testnet demo schedule**, not risk pricing.
5. Inspect premium, limit, deductible, beneficiary, exclusions, deadlines and the complete immutable versioned terms snapshot and digest. Explicitly accept the exact digest.
6. Prepare payment. The backend checks ownership/delegation, quote expiry, deployed chain/token/code, existing binding and available capital. A prepared policy provides no coverage.
7. Click **Approve exact USDC premium**, approve in the external wallet, and wait for the receipt. The backend verifies and records the exact ERC-20 approve transaction. This grants the pool an allowance; it does not activate coverage.
8. Click **Pay premium & bind policy**. The client rechecks account/network and backend permission, simulates the call, and asks the external wallet for authorization. The contract atomically pulls the premium and reserves the full limit.
9. The backend verifies the successful PolicyBound event, payer, pool, digest, beneficiary, amounts, coverage window, acceptance chronology and binding deadline, then reconciles the current deployed policy. Only then does the local policy become confirmed.
10. Follow the success link to `/policies/[id]`. `/policies` lists only records owned or paid by the authenticated wallet. Refresh details for live reconciliation, cancellation, exhaustion and transaction links. If RPC is unavailable, the immutable record remains accessible with current chain state explicitly unverified. A submitted bind hash can be recovered from session storage or pasted into the detail screen.

Coverage is scheduled **15 minutes after quote creation**. Quotes expire after **10 minutes**. A supported bind must be mined before quote expiry and after terms acceptance. Confirmation alone does not advance the scheduled start. A late bind can succeed onchain but is **ineligible for backend recognition**; the UI and docs disclose this contract limitation. Do not submit near the deadline.

## Agent SDK/API

Preferred remote client: `ProcurementApiClient` from `@arcuex/agent-sdk`. Keys never enter the API or SDK. The owner first authenticates, registers the agent/exposure, and creates a delegation on `/agent`. The agent authenticates using the registered signer wallet. Agent funds pay the premium; owner funds are not pulled through this backend.

```ts
const api = new ProcurementApiClient({ baseUrl: 'http://localhost:3000' });
await api.authenticate(agentAddress, (message) => externalSigner.signMessage({ message }));
const products = await api.products();
const registeredAgents = await api.agents();
const authority = await api.authority({ delegationId });
if (authority.revoked || authority.expired) throw new Error('No current authority');
const quote = await api.quote({
  idempotencyKey: 'stable-request-identifier',
  agentId,
  delegationId,
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
const prepared = await api.procure({
  quoteId: quote.terms.quoteId,
  acceptedDigest: quote.digest,
  delegationId,
});
// The external authorized wallet validates and submits the returned narrow
// approve and bind actions on chain 5042002. The API does not broadcast.
await api.approval({ policyId: prepared.policy.terms.policyId, hash: approvalHash });
await api.confirm({ policyId: prepared.policy.terms.policyId, hash: bindHash });
const status = await api.policy(prepared.policy.terms.policyId);
```

Owner registration requires `idempotencyKey`, `signer`, `label`, `position`, `exposureMicros`, and `ownerAttestsControl: true`. Optional chain/protocol inputs, when supplied, must match the supported product. Delegation requires `idempotencyKey`, `agentId`, `premiumCapMicros`, `limitCapMicros`, `beneficiary` (defaults to owner), and Unix-second `expiresAt` within 30 days. The registered position and allowed product are fixed into the delegation. Only the authenticated owner may create or revoke it.

Delegation premium caps are **cumulative** across all prepared policies, including abandoned or failed preparations. Per-policy limit caps are enforced separately. Preparation and cap reservation share a SQLite transaction. Retrying the same quote returns the same policy without reserving twice; a different quote cannot consume the same remaining budget. A replay with a different acceptance digest or authority is rejected. Quote/registration/delegation request keys reject reuse with different inputs. No automatic budget reset/release is implemented.

All authenticated endpoints now share the wallet nonce/httpOnly session implementation with claims. Signatures bind an origin, Arc Testnet, wallet, single-use nonce and expiry. Nonces last ten minutes; wallet sessions last eight hours. The host-only cookie is httpOnly, SameSite=Lax and Secure in production. No bearer/session token is exposed to browser JavaScript or stored in sessionStorage/localStorage. Node SDK clients keep their cookie jar only in memory. Smart-contract-wallet/EIP-1271 authentication remains unsupported. Ops roles require separate server-provisioned credentials and cannot be asserted by an agent. Procurement delegation does not grant claims ownership or reviewer/authority rights.

Old procurement bearer sessions are retired. Pre-integration claims-only wallet sessions/nonces are invalidated once during migration to require a fresh shared-purpose signature. See the [integration assessment](../verification/2026-11-17-procurement-claims-integration.md) for migration, security and launch evidence.

| Method     | `/api/procurement/…`        | Behavior                                                                    |
| ---------- | --------------------------- | --------------------------------------------------------------------------- |
| GET        | products                    | Public discovery and fixed deployment                                       |
| POST       | auth/challenge, auth/verify | Challenge and wallet authentication                                         |
| GET / POST | agents                      | Identify/register owned or assigned agents                                  |
| GET / POST | delegations                 | Inspect/create scoped owner permissions                                     |
| POST       | delegations/revoke          | Owner revocation                                                            |
| POST       | authority                   | Inspect delegated scope, expiry/revocation and remaining budget             |
| POST       | quotes                      | Validate exposure/eligibility and freeze terms                              |
| POST       | procure                     | Accept exact digest, reserve cap once, read-only preflight, return calldata |
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
- The pool had 3.1 USDC available at verification. Larger limits need separately authorized LP capital; this session neither deposited nor requested a transaction. Capital may change or be consumed concurrently; the bind contract remains authoritative.
- Position control, health and incident status are owner/agent attestations for a synthetic protocol, not independently verified lending data. No external loss oracle is integrated.
- Public hosting/HTTPS, edge request-rate limiting, operational SQLite persistence/backup and actual extension-wallet/device testing must be verified in the launch environment. No deployment was performed here. The unauthenticated challenge endpoint requires deployment-level abuse limits.
- The UI does not automatically restore abandoned delegation budget. Backend revocation cannot retract calldata, allowances or directly signed transactions.
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
