# Arcuex MCP server

Verified locally on November 20, 2026 against `@modelcontextprotocol/sdk@1.32.2`
([MCP specification](https://modelcontextprotocol.io/specification),
[TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)).
**Hosted acceptance passed on two isolated, acceptance-gated Railway test services on November 20,
2026** ([report](../verification/2026-11-20-mcp-hosted-acceptance.md)). That result covers those
test services only. Existing staging, Plan A and any future environment are not accepted until the
same harness passes there. Each deployment's `/api/mcp/health` keeps reporting
`hostedAcceptance: not_performed`, because the server cannot attest to its own acceptance.

The MCP server lets an MCP-compatible autonomous agent use the same insurance workflows a
human policyholder uses: registration requests, product discovery, quotes, purchase preparation,
policy status, claims, evidence and settlement tracking. It does not contain an insurance engine.

## Architecture

```
MCP client ──HTTP POST /api/mcp (Bearer amcp_…)──▶ withApiSecurity (host/origin/edge/rate limit)
                                                   │
                                     authenticateMcpToken (per request)
                                                   │
                            McpServer (stateless, JSON responses, per request)
                                                   │
                       tool → scope check → BackendGateway (in-process)
                                                   │
         existing route handlers: /api/procurement/*, /api/policies/:id/lifecycle,
         /api/claims/cases[/:id[/investigation|/verification]]
```

- **Endpoint:** `POST /api/mcp` (Streamable HTTP, stateless, `enableJsonResponse`). `GET`/`DELETE`
  are routed to the SDK transport, which answers per the stateless specification.
- **Local transport:** `ARCUEX_MCP_TOKEN=amcp_… pnpm --filter @arcuex/web mcp:stdio` (development
  only; refuses `NODE_ENV=production`; still requires a token for the same database).
- **No duplicated business rules.** Every tool reaches Arcuex only through the existing API route
  handlers (`apps/web/src/lib/mcp/backend.ts`). Request-boundary checks, wallet-session
  authentication, agent-signer matching, idempotency, delegation, quote digest/expiry, capacity
  preflight, receipt verification, canonical reconciliation and claims rules run unchanged.
- **Diagnostics:** `GET /api/mcp/health` (secret-free; tool catalog, scopes, token store check,
  `hostedAcceptance`). Protected-resource metadata: `/.well-known/oauth-protected-resource/api/mcp`.
- **Correlation and audit:** every HTTP request gets `x-request-id`; every tool call gets an
  `operationId` (`<requestId>:<uuid>`) and an `audit_events` row (`mcp_tool_call`) with wallet,
  agent, client, status, reason code, resource and a SHA-256 of the input (never evidence content).
  The internal backend request carries the same ID in `x-request-id`.

Source: `apps/web/src/lib/mcp/`, routes under `apps/web/src/app/api/mcp/`.

## Authentication and authorization

1. `POST /api/mcp/auth/challenge {address}` returns the existing Arcuex wallet challenge
   (`issueClaimsNonce`, origin-bound, single use, 10-minute TTL).
2. The agent signs it **in its own wallet**. Arcuex never sees keys.
3. `POST /api/mcp/auth/token {nonce, signature, scopes?, agentId?, clientName?}` verifies the
   signature with the existing `verifyWalletAndCreateSession`, then issues `amcp_<32 random bytes>`.
   - `agentId` binds the token to a registered agent only if `agent.signer` is the signing wallet.
   - Stored: SHA-256 of the token, wallet, agent, scopes, expiry (= wallet session TTL, ≤ 8h),
     and the wallet-session secret sealed with AES-256-GCM under a key HKDF-derived from the token.
     A database reader can recover neither the token nor the session (migration `013_mcp_access_tokens.sql`).
4. `POST /api/mcp/auth/revoke` (Bearer) revokes the token and its backing session.

Per MCP request the server re-validates: token format, existence, revocation, expiry, the sealed
session (expiry, revocation and `ARCUEX_SESSION_EPOCH` rotation), wallet match, and agent binding.
Failures return `401` with `WWW-Authenticate: Bearer … error_description="<REASON>" resource_metadata=…`.

| Layer               | Enforces                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP scopes          | `arcuex:read`, `arcuex:register`, `arcuex:quote`, `arcuex:purchase`, `arcuex:claims` — narrow only.                                                                               |
| Agent binding       | Bound tokens reject any other `agentId` argument (`AGENT_BINDING_MISMATCH`).                                                                                                      |
| Backend (unchanged) | Ownership, signer, delegation validity/expiry/revocation/caps, beneficiary, payer, quote digest and expiry, capacity, canonical receipts, claim access, reviewer/authority roles. |

- **No token passthrough:** the bearer token is never forwarded; backend routes reject it (tested).
  The gateway presents only the token's own sealed wallet session.
- **Model input is never authority:** signer is always the authenticated wallet; agent IDs are
  hints checked by the backend against the session signer; owner, tenant and role arguments do not exist.
- **Tenant boundary:** Arcuex procurement has no organization tenancy; the owner wallet is the
  tenant. Cross-wallet reads return `NOT_FOUND`/`FORBIDDEN` from the backend.
- **Replay/duplicates:** mutations carry `idempotencyKey` handled by existing backend idempotency
  (procurement records, claim intake, investigation `requestKey`); conflicting reuse → `IDEMPOTENCY_CONFLICT`.
- **Prompt injection:** evidence, reviewer request text and examiner output are returned as
  labeled untrusted data; next actions are derived from backend state only.
- **Never exposed:** delegation grant/revoke, owner registration completion, adjudication,
  settlement preparation/signing, `mark_paid`/`mark_failed`, examiner worker callbacks, a general
  signer, or URL fetching.
- **Not implemented:** an OAuth 2.1 authorization server (authorization code + PKCE, dynamic client
  registration). Clients must obtain tokens through the wallet-signature endpoints.

## Result envelope

Every tool returns `structuredContent` (and the same JSON as text) with `status` ∈
`SUCCESS | PENDING | ACTION_REQUIRED | UNDER_REVIEW | BLOCKED | FAILED`, `operationId`, `tool`, and
where applicable `reasonCode`, `resourceId`, `sourceMode`, `authorizedActions`,
`requiresHumanApproval`, `requiresWalletSignature`, `nextAction {actor, tool?, endpoint?, body?}`,
`evidenceReferences`, `transactionHash`, `canonicality`, `data`. Backend refusals keep their
backend `code` as `reasonCode` (401/403/409 → `BLOCKED`, 429/503 → `PENDING`, others → `FAILED`).

## Tool inventory

Implemented (47): identity `arcuex_get_identity`, `arcuex_register_agent`,
`arcuex_register_exposure`, `arcuex_get_registration_status`, `arcuex_list_owned_agents`,
`arcuex_get_agent`, `arcuex_list_exposures`, `arcuex_get_delegation`, `arcuex_request_delegation`,
`arcuex_get_permissions`; coverage `arcuex_list_products`, `arcuex_get_product`,
`arcuex_get_coverage_terms`, `arcuex_check_eligibility` (advisory), `arcuex_get_underwriting_requirements`;
procurement `arcuex_request_quote`, `arcuex_get_quote`, `arcuex_accept_quote`,
`arcuex_prepare_policy_purchase`, `arcuex_reconcile_policy_binding`, `arcuex_get_purchase_status`;
policies `arcuex_list_policies`, `arcuex_get_policy`, `arcuex_get_policy_coverage`,
`arcuex_get_policy_status`, `arcuex_get_policy_transactions`; claims `arcuex_file_claim`,
`arcuex_list_claims`, `arcuex_get_claim`, `arcuex_get_claim_requirements`,
`arcuex_submit_claim_evidence`, `arcuex_submit_onchain_evidence`, `arcuex_mark_evidence_complete`,
`arcuex_run_claim_verification`, `arcuex_list_evidence_requests`,
`arcuex_respond_to_evidence_request`, `arcuex_send_claim_message`,
`arcuex_get_verification_findings`, `arcuex_get_examiner_assessment`,
`arcuex_request_examiner_reassessment`, `arcuex_get_claim_timeline`, `arcuex_get_claim_decision`;
settlement (read-only) `arcuex_get_settlement_status`, `arcuex_get_reimbursement_details`,
`arcuex_get_financial_gate`, `arcuex_get_payment_receipt`; `arcuex_get_next_actions`.

Resources: `arcuex://products`, `arcuex://products/{productCode}/terms`, `arcuex://identity`,
`arcuex://policies/{policyId}`, `arcuex://claims/{claimId}/dossier`,
`arcuex://claims/{claimId}/evidence-requests`, `arcuex://claims/{claimId}/settlement`.
Prompts: `insure_registered_position`, `respond_to_evidence_request`, `review_claim_status`.

### How requested workflows map to the backend

- **Registration.** The backend binds an agent only when the _owner_ wallet registers a signer
  (`POST /api/procurement/agents`). `arcuex_register_agent` therefore prepares that exact owner
  action (signer = authenticated wallet) and stores nothing; `arcuex_get_registration_status`
  confirms the owner who completed it. A durable owner inbox for agent requests does not exist.
- **Exposures** are part of each agent registration record; `arcuex_register_exposure` prepares
  another owner registration.
- **Delegation requests** are prepared owner actions; only the owner can create or revoke one.
- **Human approval before binding.** Agents can quote/buy only under an owner delegation; the
  live independent product is owner-purchase only (backend-enforced). The backend's synthetic underwriting applications and human insurer review (`/api/underwriting`) are not exposed through MCP yet.
- **Purchase.** MCP returns backend-prepared unsigned transactions (`ACTION_REQUIRED`,
  `requiresWalletSignature`). A policy is reported bound only when the backend links a canonical
  `PolicyBound` event (`canonical_verified_linked`); a verified receipt alone is `PENDING`.
- **Evidence.** Text/JSON/UTF-8 documents up to 16,000 bytes via the investigation journal
  (hash-chained, immutable, attributed, `unverified`); Arc transaction references as untrusted
  manifests. Binary attachments are not supported by the backend.
- **Settlement stages** are projected from backend state; `REIMBURSED` requires
  `paymentFinality: confirmed` with a matching canonical receipt. Synthetic claims report
  `SYNTHETIC_SETTLEMENT_PROHIBITED`.

### Blocked tools

These tools are registered so agents can discover them. They always return `BLOCKED` and never act
or simulate state.

| Tool                                     | `reasonCode`                | Why                                                                                                                           |
| ---------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `arcuex_request_risk_assessment`         | `MCP_EXPOSURE_NOT_ACCEPTED` | The backend computes risk adjustments for each underwriting application (`/api/underwriting`). MCP doesn't call that API yet. |
| `arcuex_submit_underwriting_application` | `MCP_EXPOSURE_NOT_ACCEPTED` | The backend accepts applications. MCP doesn't call that API yet.                                                              |
| `arcuex_get_underwriting_status`         | `MCP_EXPOSURE_NOT_ACCEPTED` | The backend tracks application status. MCP doesn't call that API yet.                                                         |
| `arcuex_submit_underwriting_evidence`    | `MCP_EXPOSURE_NOT_ACCEPTED` | The backend handles insurer evidence requests and applicant responses. MCP doesn't call that API yet.                         |
| `arcuex_request_policy_renewal`          | `NOT_SUPPORTED_BY_BACKEND`  | There is no renewal contract; policies are fixed-window binds.                                                                |
| `arcuex_request_claim_reconsideration`   | `NOT_SUPPORTED_BY_BACKEND`  | There is no appeal or reconsideration workflow; `DENIED` is terminal.                                                         |

`MCP_EXPOSURE_NOT_ACCEPTED` means the backend API exists, but MCP won't call it until the API has
separately passed MCP authorization and integration tests. Until then, human owners use the web
underwriting workspace, and insurer decisions stay human.

Also missing: a durable agent-registration request inbox for owners, an OAuth 2.1 authorization
server, and binary document attachments.

## Connecting a client

1. Obtain a token (example with viem; the agent's own key stays in the agent runtime):

```ts
const c = await (
  await fetch(`${BASE}/api/mcp/auth/challenge`, {
    method: 'POST',
    body: JSON.stringify({ address: account.address }),
  })
).json();
const t = await (
  await fetch(`${BASE}/api/mcp/auth/token`, {
    method: 'POST',
    body: JSON.stringify({
      nonce: c.nonce,
      signature: await account.signMessage({ message: c.message }),
      scopes: [
        'arcuex:read',
        'arcuex:register',
        'arcuex:quote',
        'arcuex:purchase',
        'arcuex:claims',
      ],
      clientName: 'my-agent',
    }),
  })
).json();
```

2. Configure an MCP client (Streamable HTTP):

```json
{
  "mcpServers": {
    "arcuex": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer ${ARCUEX_MCP_TOKEN}" }
    }
  }
}
```

Local: `pnpm dev`, then use `http://localhost:3000/api/mcp`, or the stdio command above.

### External (hosted) configuration

The client needs the HTTPS origin of an accepted deployment, a token issued by that deployment, and,
while the deployment is acceptance-gated, the operator-issued gate header. The token is bound to that
deployment's database and session epoch, so it does not work on any other environment.

```json
{
  "mcpServers": {
    "arcuex": {
      "type": "http",
      "url": "https://<accepted-host>/api/mcp",
      "headers": {
        "Authorization": "Bearer ${ARCUEX_MCP_TOKEN}",
        "x-arcuex-acceptance-gate": "${ARCUEX_ACCEPTANCE_GATE_TOKEN}"
      }
    }
  }
}
```

Token issuance calls (`/api/mcp/auth/challenge`, `/api/mcp/auth/token`) also need the gate header.
A deployment opened with `ARCUEX_PUBLIC_ACCESS=1` has no gate, so leave out the
`x-arcuex-acceptance-gate` header. `/api/mcp/health` reports `ingress: public` or
`ingress: acceptance_gated`.
Operational limits come from the existing API boundary:

- **All requests:** 300 per minute per edge-verified client IP.
- **Mutations:** 60 per minute per IP. Every MCP JSON-RPC POST counts, and so do the internal
  backend mutations it makes.
- **Authentication routes:** 20 per minute per IP.

Spoofed `X-Forwarded-For` or `X-Real-IP` values do not create new buckets. A throttled call returns
HTTP 429 with `Retry-After`, or `PENDING` / `RATE_LIMITED` inside a tool result.

What works on a live Arc Testnet deployment:

- Registration requests with owner confirmation.
- Delegation-gated quotes, and accepting a quote's terms off-chain.
- Purchase preparation, which returns unsigned transactions only when the payer wallet holds the
  premium in testnet USDC. Otherwise it fails closed with `INSUFFICIENT_PREMIUM_BALANCE`.
- Policy and claim reads.

A claim lifecycle needs a canonically bound policy. The hosted claim acceptance therefore used the
pinned fixture source (`fixture_rehearsal`). It is synthetic, has a 300-second lease, and is not
Arc evidence.

## Tests

`apps/web/src/lib/mcp/mcp-integration.test.ts` drives the server with the official SDK `Client`
over `StreamableHTTPClientTransport` (custom in-process `fetch` into the real route handlers).
Chain I/O is replaced by the same doubles used by the existing procurement API tests; owner and
reviewer actions use the existing HTTP routes. See
[the verification report](../verification/2026-11-20-mcp-server.md).

`apps/web/scripts/mcp-hosted-acceptance.mts live|fixture` runs the same SDK client against a
deployed HTTPS origin. Secrets are read from files, and the script refuses to write a transcript
that contains one. See [the hosted acceptance report](../verification/2026-11-20-mcp-hosted-acceptance.md).
