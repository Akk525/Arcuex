# MCP server: final merge acceptance (November 20, 2026)

- **Accepted code candidate:** `d90cc8162e2400bba5eb014545797de07164232a`. This is merge `1e307b7`
  (`feat/arcuex-mcp-server` into `main` `a817341`) plus the underwriting reason-code correction.
  Both isolated services ran exactly this tree, with `ARCUEX_GIT_SHA` set to it. The commit that
  adds this report changes only documentation.
- **Not done:** no push, no transaction signed or broadcast, and no change to existing staging
  (`arcuex-backend-release-staging`) or Plan A (`arcuex-nov20-beta`).

Evidence is in [`2026-11-20-mcp-merge-acceptance/`](2026-11-20-mcp-merge-acceptance/):

| File                          | Contents                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `live-results.json`           | Live service results, redacted                                                                          |
| `live-restart-results.json`   | Restart-recovery results, redacted                                                                      |
| `fixture-claim-results.json`  | Fixture claim results, redacted                                                                         |
| `*-runtime-logs.redacted.txt` | Runtime logs with secret values, bearer tokens and session cookies replaced. A scan found none present. |
| `deployments.json`            | Deployment IDs and statuses                                                                             |

## Underwriting tool correction

`main` added synthetic underwriting applications with human insurer review (`/api/underwriting`).
Four MCP tools still claimed `NOT_SUPPORTED_BY_BACKEND`:

- `arcuex_request_risk_assessment`
- `arcuex_submit_underwriting_application`
- `arcuex_get_underwriting_status`
- `arcuex_submit_underwriting_evidence`

They now return `BLOCKED` / `MCP_EXPOSURE_NOT_ACCEPTED` and name the backend API. MCP does not call
that API; it stays blocked until the API separately passes MCP authorization and integration
acceptance. `arcuex_request_policy_renewal` and `arcuex_request_claim_reconsideration` stay
`NOT_SUPPORTED_BY_BACKEND`, because `main` has no renewal or reconsideration workflow.
`arcuex_get_underwriting_requirements` now says `NOT_EXPOSED_VIA_MCP` instead of `NOT_IMPLEMENTED`.

## Local gates on the final tree

| Check                         | Result                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`, `pnpm lint` | pass                                                                                                            |
| `pnpm test`                   | 484 passed (domain 25, chain 5, persistence 20, quicknode 9, onchain 48, insurance 112, agent-sdk 16, web 249). |
| `pnpm build`                  | pass; MCP routes and `/api/underwriting/[[...id]]` built                                                        |
| `forge test`                  | 46 passed. Contracts are identical to `main`.                                                                   |

`pnpm test` was run with the Claude Code shell's `CLAUDE_CODE_MESSAGING_TOKEN` unset. The fixture
runtime correctly rejects that variable as a non-allowlisted credential.

## Hosted results

| Run                    | Service / deployment                             | Result                                                          |
| ---------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| Live testnet           | `mcp-live` / `2a2ee1d6`                          | **49/49**                                                       |
| Restart recovery       | Same deployment after `railway restart`          | **6/6**                                                         |
| Hosted synthetic claim | `mcp-fixture` / `cfc719b9` (built as `eebbec66`) | **22/22**, finished 55 s after the seed                         |
| Expired fixture lease  | Same deployment, after the 300 s checkpoint      | Health, readiness and MCP challenge all **503**, failing closed |

### Live service

**Registration, approval and quoting**

- Registration requests come back as owner actions. The owner confirms through the existing
  `POST /api/procurement/agents` route.
- A quote without a delegation returns `DELEGATION_REQUIRED`. After the owner creates a delegation,
  quoting works and a limit above the cap returns `CAP_EXCEEDED`.
- Wrong quote digests are refused. Accepted terms stay `not_bound`.

**Purchase**

- Wallet-action requirement: the backend preflight checked the unfunded payer and returned
  `INSUFFICIENT_PREMIUM_BALANCE` with no transaction. The policy was never reported bound.

**Authorization boundaries**

- Ingress gate enforced.
- Bearer failures return 401 with `WWW-Authenticate`.
- Forged signatures and unknown scopes are refused at issuance.
- Read-only scope limits are enforced.
- Agent binding and tenant isolation hold for the agent, quote and delegation.
- The MCP bearer gets no backend passthrough.
- No adjudication or settlement tools are discoverable.

**Lifecycle and limits**

- Expired and revoked delegations are refused.
- After token revocation, the token returns 401 `TOKEN_REVOKED`.
- Rate limiting: 90 calls with spoofed proxy headers returned 38 × 200 and 52 × 429.
- Protected-resource metadata names the public origin.
- The four underwriting tools return `MCP_EXPOSURE_NOT_ACCEPTED`.

### Restart recovery

After `railway restart`, the prestart backup was captured, the database and source were verified,
and reconciliation was healthy. The pre-restart MCP token and wallet session still authenticated.
The registered agent, accepted quote and active delegation were all intact. The policy was still not
reported bound, and the token was revoked afterwards.

### Fixture claim

The fixture was seeded with a deliberately **checksummed** `ARCUEX_FIXTURE_OWNER`. This confirms the
seed-normalization fix, which the previous round only worked around operationally. The run covered:

- The policy appears as `fixture_rehearsal`, and purchase preparation is refused.
- The claim is filed; a duplicate filing returns the same case, and tenant isolation holds.
- The evidence gap is shown, and the proof is recorded with its hash. Malformed JSON is refused.
- Verification is run.
- The reviewer's evidence request, which contains an injection attempt, reaches the agent as
  untrusted data. The agent responds through MCP.
- Verification goes stale, then is current again after re-running.
- The human reviewer approves.
- The agent sees `AWAITING_FINANCIAL_AUTHORITY` with `SYNTHETIC_SETTLEMENT_PROHIBITED` and no receipt.

## Operational findings this round

`railway up` uses the service's current start command, and `railway redeploy` reuses the previous
deployment's command. A start-command override left by the previous round therefore made the first
fixture build start the real entrypoint against unseeded storage. It refused, failing closed
(deployments `d369f6aa` and `9eb9e72d` FAILED). The run succeeded after restoring the conditional
start command. Fixture attempts 1 to 3 are preserved on the fixture volume until teardown.

## Readiness

| Area                           | Status                                                                                                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP integration release        | Ready to merge. All local and combined hosted acceptance passed on the exact candidate. Only these isolated, gated test services are accepted; no other environment is.                                                                                             |
| Hosted claims                  | Accepted for the synthetic fixture source only, within its 300-second lease. Claims against a live, canonically bound Arc policy were not run hosted, because that needs a bound policy (a broadcast).                                                              |
| Live policy procurement        | Partial. Registration, owner authorization, delegation, quoting and fail-closed purchase preflight were accepted live. The unsigned-transaction path needs a payer funded with testnet USDC and was verified only locally. Binding needs an owner-signed broadcast. |
| Human underwriting through MCP | Not ready, and blocked by design. The backend exists; the MCP tools return `MCP_EXPOSURE_NOT_ACCEPTED` until a separate authorization and integration acceptance passes.                                                                                            |
| Live reimbursement             | Not ready. Synthetic settlement is prohibited, MCP exposes no settlement execution, and `REIMBURSED` requires a confirmed canonical USDC settlement receipt. No real settlement path was exercised.                                                                 |
