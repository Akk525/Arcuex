# MCP server: hosted acceptance (November 20, 2026)

Branch `feat/arcuex-mcp-server`. The acceptance client is the official MCP TypeScript SDK `Client`
with `StreamableHTTPClientTransport`, running on an operator workstation against real Railway HTTPS
origins (`apps/web/scripts/mcp-hosted-acceptance.mts`).

What was not done:

- No transaction was signed or broadcast. Ephemeral wallets signed only Arcuex login messages.
- Nothing was pushed.
- Existing staging (`arcuex-backend-release-staging`) and Plan A (`arcuex-nov20-beta`) were not
  modified.

## 1. Tool reconciliation (53 discovered)

| Group                                                        | Count | Tools                                                                                                                                                                                                                        |
| ------------------------------------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requested and executable                                     | 42    | All requested names except the six below                                                                                                                                                                                     |
| Executable, added for backend workflows                      | 5     | `arcuex_submit_onchain_evidence`, `arcuex_mark_evidence_complete`, `arcuex_run_claim_verification`, `arcuex_send_claim_message`, `arcuex_request_examiner_reassessment`                                                      |
| Registered but always `BLOCKED` / `NOT_SUPPORTED_BY_BACKEND` | 6     | `arcuex_request_risk_assessment`, `arcuex_submit_underwriting_application`, `arcuex_get_underwriting_status`, `arcuex_submit_underwriting_evidence`, `arcuex_request_policy_renewal`, `arcuex_request_claim_reconsideration` |
| Requested but unavailable (not registered)                   | 0     | —                                                                                                                                                                                                                            |

The earlier figure of 47 implemented tools is the 42 requested plus the 5 added; adding the 6
blocked tools gives the 53 discovered.

## 2. Migration 013 against a staging snapshot

The snapshot was taken with a read-only SQLite `.backup` of the staging service's
`/data/backend.sqlite`. It passed `integrity_check`, its SHA-256 is `6ba776e8…6b36b`, and the
transfer checksum matched. The test ran on a local disposable copy; staging was not written.

| Check                                   | Result                                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Migrations                              | 14 → 15 (`013_mcp_access_tokens.sql` appended); unchanged after restart                                           |
| Pre-existing rows (35 tables)           | All preserved: an `EXCEPT` comparison against the original found 0 missing or altered rows in every table touched |
| Token issued after migration            | Authenticated, still authenticated after a process restart, `TOKEN_REVOKED` after revocation                      |
| `integrity_check` / `foreign_key_check` | ok / no violations (after migration and after restart)                                                            |

## 3. Isolated resources

|                       | Live (`arc-testnet`)                                                       | Fixture (claims)                                                              |
| --------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Project               | `arcuex-mcp-acceptance` `4f45e66f-c388-4147-83eb-384cb8e0ff0c`             | `arcuex-mcp-fixture-acceptance` `485d657c-e4ce-48e8-b6bd-8b05e643e964`        |
| Service / environment | `mcp-live` `d911082d…` / `ab9a6fe8…`                                       | `mcp-fixture` `6fca4d67…` / `29e2dac6…`                                       |
| Volume                | `872f1838-ff57-40dc-b8e9-dd06babec0eb` at `/data`                          | `8d0d57b5-1c0c-4296-92c7-f6ddce789bc2` at `/mnt` (data dir `/mnt/candidate3`) |
| Origin                | `https://mcp-live-production.up.railway.app`                               | `https://mcp-fixture-production.up.railway.app`                               |
| Deployment / source   | `60a61d4d…` from `4800792`                                                 | `74bcf583…`, same build source                                                |
| Credentials           | Fresh 64-hex rate, reviewer, authority and gate secrets; new session epoch | Fresh, distinct set; session epoch = candidate ID                             |
| RPC                   | Public `https://rpc.testnet.arc.io` (no API key)                           | None (fixture forbids RPC)                                                    |
| Ingress               | Acceptance gate required on every route                                    | Acceptance gate required on every route                                       |

Both services run one replica. Neither has shared variables, sibling services or a copied database.
The live service starts through `deploy/backend/start-isolated.sh`, which rejects the Plan A IDs.
Its startup log shows `database initialized and source verified` and reconciliation healthy.

## 4. Live service: 46/46 passed (`2026-11-20-mcp-hosted-live.json`)

- **Ingress and auth.** Requests without the gate get 401. Missing, malformed and unknown bearer
  tokens get 401 with `WWW-Authenticate`. Protected-resource metadata names the public origin.
  The MCP bearer is not a backend credential: `/api/procurement/agents` returns 401.
- **Issuance.** A forged signature and an unknown scope are refused.
- **Discovery and invocation.** 53 tools, each with input and output schemas. None performs
  adjudication, settlement, signing or delegation grants. Identity resolves to the signing wallet.
- **Scope boundaries.** A read-only token cannot register or quote.
- **Registration.** The agent request returns `ACTION_REQUIRED`. The owner confirms through
  `POST /api/procurement/agents`, after which the status is `REGISTERED`. The same position claimed
  for a different owner gets `OWNER_MISMATCH`. A bound token rejects a foreign `agentId`.
- **Delegation and quote:**
  - Without a delegation: `DELEGATION_REQUIRED`.
  - The delegation request grants nothing.
  - An owner-created delegation is active.
  - A limit above the cap gets `CAP_EXCEEDED`.
  - The quote carries a canonical digest; a wrong digest gets `TERMS_NOT_ACCEPTED`.
  - Accepting the terms off-chain returns `PENDING` / `not_bound`.
- **Purchase authorization.** The backend's live preflight read the ephemeral payer's testnet USDC
  balance and returned `FAILED` / `INSUFFICIENT_PREMIUM_BALANCE` with no transaction. This is the
  correct fail-closed result for an unfunded wallet. The unsigned-transaction response itself is
  verified only by the local integration test, because funding a wallet would require a transfer.
  - The policy is never reported bound.
  - A fabricated bind hash is not accepted as canonical.
- **Tenant isolation.** An outsider cannot read the agent, quote or delegation, and cannot bind a
  token to a foreign agent.
- **Delegations.** An expired delegation gets `DELEGATION_EXPIRED`. A revoked delegation gets
  `DELEGATION_REVOKED`, and quoting under it is refused.
- **Revocation.** The revoke endpoint returns 200; afterwards the token gets 401 `TOKEN_REVOKED`.
- **Blocked workflows.** Reconsideration, underwriting application and renewal return
  `NOT_SUPPORTED_BY_BACKEND`.
- **Rate limits and proxy headers.** 90 rapid tool calls with a different spoofed
  `X-Forwarded-For` / `X-Real-IP` on each produced 3 × 200 and 87 × 429, because the edge-verified
  client IP bucket is used.

## 5. Fixture service: complete synthetic claim, 22/22 passed (`2026-11-20-mcp-hosted-fixture.json`)

Seeded per `docs/deployments/plan-b-fixture-source.md`. The digest is `21a1af4f…0bc7` and the
checkpoint is valid for 300 seconds. The harness finished 47 seconds after the seed.

- **Policy.** Visible with `fixture_rehearsal` / `fixture_rehearsal_not_canonical` and claims
  eligible. Purchase preparation is refused in fixture mode.
- **Claim.** Filed (`CLAIM_COLLECTING_EVIDENCE`). A duplicate filing returns the same case, and an
  outsider cannot read it.
- **Evidence gap.** `FRESH_PERSISTED_VERIFICATION_REQUIRED` is reported. The proof is recorded with
  its content hash, and malformed JSON is refused.
- **Verification.** The first run is sufficient.
- **Evidence request.** The reviewer API creates an evidence request containing an injection
  attempt. The agent receives it as untrusted data and answers through MCP.
- **Freshness.** Verification goes stale after the new evidence and is current after re-running.
- **Decision.** The reviewer resolves the request and approves through the existing route. The
  agent reads `APPROVED`, decided by `reviewer`.
- **Settlement.** `AWAITING_FINANCIAL_AUTHORITY` with gate `SYNTHETIC_SETTLEMENT_PROHIBITED` and
  no receipt. Never `REIMBURSED`.

## 6. Defects found by hosted acceptance

1. **Protected-resource metadata advertised the container origin.** It returned
   `https://0.0.0.0:8080/api/mcp` because `request.url` behind the Railway edge is the container
   address.
   - Fixed in `1e324d4`: the metadata and `WWW-Authenticate` now use `canonicalSigningOrigin`.
   - Regression test: `public-origin.test.ts`.
   - Redeployed (`60a61d4d`) and re-accepted.
2. **The fixture seed did not normalize `ARCUEX_FIXTURE_OWNER`.** A checksummed operator address
   seeded a policy owned by a mixed-case wallet, while wallet sessions are lowercase. The owner's
   policy list came back empty.
   - On the hosted service this was worked around by supplying the lowercase address. That
     dataset is preserved under `/mnt/candidate2`.
   - Fixed in source: `seedFixture` validates and lowercases the owner and signer addresses (test
     in `fixture-source.test.ts`).
3. **Fixture rehearsal attempts.** Attempts 1 and 2 expired unused and are preserved on the volume
   (`/mnt/candidate`, `/mnt/candidate2`).
   - Attempt 1: `railway redeploy` reuses the snapshotted start command, so the init placeholder
     kept serving.
   - Attempt 2: hit defect 2.
   - Attempt 3 used a start command that runs the real entrypoint only when the pinned digest is
     present.

## 7. Receipt reorganization and failure safety

A reorg cannot be induced on Arc Testnet without broadcasting.

- **Hosted:** a fabricated bind hash never produced `canonical_verified_linked`.
- **Unit tests (`projections.test.ts`):** `reorged` finality maps to `REORGED`, an `ORPHANED`
  bind maps to `reorged`, and `PAID` without confirmed finality is never `REIMBURSED`.

## 8. Expired fixture lease fails closed

After the 300-second checkpoint lapsed, the fixture service answered every probed route with
`503 Request unavailable; no server transaction was sent`. That covered MCP token challenge,
`/api/mcp/health` and `/api/health/ready`. No claim, token or session could be created against the
expired source, and nothing renewed the lease.

## 9. Secrets

- The generated secrets were piped to Railway on stdin and never appeared in shell arguments or
  output.
- Hosted logs (both services) contain none of the generated secrets, no `amcp_` token, no
  `Bearer` header and no session cookie.
- Transcripts were checked by the harness, and again by `grep`, for every secret value.
- Tests (`tokens.test.ts`):
  - The database never stores the raw token.
  - A token expires with its backing session (`TOKEN_EXPIRED`).
  - A swapped sealed session is rejected (`TOKEN_INVALID`).

## 10. Deployment status

Both isolated test services are running and acceptance-gated. They are not linked to staging or
Plan A, and nothing was promoted. Retiring them requires separate teardown authorization.
