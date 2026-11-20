# MCP server: local verification (November 20, 2026)

Branch `feat/arcuex-mcp-server` from `main` `d649761`. Local source verification only. No push,
no deployment, no Railway change, no transaction signed or broadcast, and no live RPC write.
**Hosted acceptance: not performed.**

## Commands and results

| Check                                                     | Result                                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                          | pass                                                                                                                                    |
| `pnpm lint`                                               | pass                                                                                                                                    |
| `pnpm test`                                               | 478 passed (domain 25, chain 5, persistence 20, quicknode 9, onchain 48, insurance 112, agent-sdk 16, web 243)                          |
| `forge test` (contracts unchanged)                        | 46 passed                                                                                                                               |
| `pnpm build`                                              | pass; `/api/mcp`, `/api/mcp/auth/*`, `/api/mcp/health` and protected-resource metadata built as dynamic routes                          |
| stdio smoke (`scripts/mcp-stdio-smoke.mts`, throwaway DB) | official SDK stdio client: 53 tools, `arcuex_get_identity` SUCCESS, products `ARC_ORACLE_LIQUIDATION_DEMO_V1` / `synthetic_arc_testnet` |

Environment note: eight web tests fail when the shell exports `CLAUDE_CODE_MESSAGING_TOKEN`
(the runtime config refuses non-allowlisted credential-like variables). They pass with that
variable unset; it is unrelated to this change.

## MCP client integration harness

`apps/web/src/lib/mcp/mcp-integration.test.ts`: official SDK `Client` + `StreamableHTTPClientTransport`,
with `fetch` routed in-process to the real route handlers. Chain reads/receipts use the same
doubles as the existing procurement API tests (`preflightPayment`, `verifyApproval`,
`verifyReceipt`, `reconcile`, and a fake RPC client for `reconcilePolicyBinds`). Owner actions use
the existing wallet-session procurement routes; reviewer actions use the existing reviewer-token
claims routes. **No receipt in these tests is a real Arc transaction**, and no reimbursement is claimed.

Required flow, all asserted: connect and discover (53 tools, every tool has input/output schemas,
no adjudication/settlement/delegation-grant tools); agent-initiated registration; unauthorized
registration refused (`INSUFFICIENT_SCOPE`, `OWNER_MISMATCH` for a foreign owner); owner approval
through `POST /api/procurement/agents`; product discovery; exposure selection; underwriting
requirements; human approval enforced (`DELEGATION_REQUIRED` until the owner creates a delegation);
quote; accept + prepare purchase (`WALLET_SIGNATURE_REQUIRED`, payer = agent wallet); wallet
authority preserved (owner cannot prepare the agent-accepted payment: `FORBIDDEN`); receipt
verified → `PENDING` until canonical link → `canonical_verified_linked`; policy read (active,
claims eligible); claim filed; initial proof; reviewer evidence request; MCP response; verification
stale after new evidence and current after re-verification; human adjudication `APPROVED`;
agent reads approved-but-unpaid (`AWAITING_FINANCIAL_AUTHORITY`, `SYNTHETIC_SETTLEMENT_PROHIBITED`, no receipt).

Negative cases asserted: expired and revoked delegations; cap exceeded; wrong beneficiary; quote
expiry; idempotency conflict; duplicate registration and duplicate claim (same IDs); cross-wallet
policy, claim, claim-filing and resource reads; agent-binding mismatch; malformed JSON evidence;
oversized evidence (bytes and schema); missing verification blocker; synthetic payment prohibition;
missing/malformed/unknown/revoked bearer tokens (401 + `WWW-Authenticate`); forged signature,
unknown scope and foreign agent binding at issuance; MCP token rejected by backend routes (no
passthrough); transport closed mid-flow and resumed with idempotent claim retry; audit rows for
every tool call with correlation IDs and no evidence content.

Receipt reorganization is covered by projection unit tests (`projections.test.ts`): `reorged`
payment finality → `REORGED`, `ORPHANED` bind → `reorged`, `PAID` without confirmed finality is never
`REIMBURSED`. An end-to-end reorg needs an authority-paid independent claim and was not simulated.

Recorded transcript: [2026-11-20-mcp-server-transcript.json](2026-11-20-mcp-server-transcript.json).

## Deployment-relevant change

Additive default migration `013_mcp_access_tokens.sql` (new table only). It will be applied to any
database opened by this source, including a pinned fixture database. Validate it against a backup
before any authorized deployment.
