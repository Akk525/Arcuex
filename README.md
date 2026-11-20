# Arcuex

`main` is the canonical development and future deployment branch. Railway remains pinned to
Plan A, `f8365a85f0c4a6298f713be7e799cb7538ca1fc7`; consolidating this repository does not deploy it.
See the [reconciliation report](docs/verification/2026-11-18-repository-consolidation.md)
and [deployment and recovery procedure](docs/deployments/main-and-plan-a.md).

Arcuex is an early-stage infrastructure project exploring programmable financial protection for autonomous AI agents. This repository combines live Arc Testnet connectivity with a policy-agnostic **synthetic** insurance core (quotes, policies, claims, capital ledger).

## Implemented

- Typed Arc Testnet config (chain ID `5042002`), wallet connect/switch/balance, explicit testnet transfer
- QuickNode Arc Testnet RPC client + dashboard status (Streams still incomplete — see docs)
- `@arcuex/domain` entities, immutable terms, state machines, USDC micros, capital math
- `@arcuex/persistence` SQLite migrations/repositories with audit + idempotent event processing
- `@arcuex/insurance` quote-to-bind, claims pipeline, capital services (synthetic product)
- Dashboard panels for live Arc/wallet and synthetic Coverage / Claims / Capital
- Foundry `InsurancePool` (deposit / bind / reserve / authorized settle / restricted withdraw)
- `@arcuex/onchain` ABIs, canonical ids, tx pipeline, SQLite↔chain reconcile helpers
- `@arcuex/agent-sdk` quote → inspect → accept → prepare approve/bind (no private keys)
- Agent MCP server (`/api/mcp`, Streamable HTTP + local stdio) over the existing backend routes — [docs](docs/integrations/mcp.md); hosted acceptance passed on isolated Railway test services only ([report](docs/verification/2026-11-20-mcp-hosted-acceptance.md))

The [testnet lifecycle runner](docs/development/arc-testnet-lifecycle.md) validates explicitly selected steps before execution, skips completed steps, and reports transaction receipts separately from process outcome.

## Limitations

- Synthetic underwriting is **not** real insurance issuance or production pricing
- Arc Testnet pool and one synthetic-claim settlement are [verified read-only](docs/verification/2026-11-17-settlement-review.md); this is not production issuance
- No mainnet deployments or AI-authorized payouts (`claimsAuthority` only)
- QuickNode Streams webhook authentication, inbox and backfill code exist; live provider delivery
  remains unverified. RPC usage does not establish Streams completion.
- Local SQLite ledger is Node-runtime only (`ARCUE_X_SQLITE_PATH`); contract state is authoritative once deployed

## Prerequisites

- Node.js 20+
- pnpm 11+ (repo `packageManager` field)
- Optional: injected EVM wallet + Circle faucet USDC for chain panels

## Setup

```bash
pnpm install
cp .env.example .env.local   # optional overrides
# Optional for contracts:
# curl -L https://foundry.paradigm.xyz | bash && foundryup
# (cd contracts && forge install)
pnpm dev                     # http://localhost:3000
```

```bash
pnpm test                    # TypeScript package tests; contracts are separate
pnpm test:contracts
pnpm lint
pnpm typecheck
pnpm build
```

## Environment variables

| Variable                               | Purpose                      | Default                                |
| -------------------------------------- | ---------------------------- | -------------------------------------- |
| `NEXT_PUBLIC_ARC_RPC_URL`              | Arc RPC for dashboard        | `https://rpc.testnet.arc.io`           |
| `NEXT_PUBLIC_QUICKNODE_RPC_URL`        | QuickNode Arc RPC            | `https://rpc.quicknode.testnet.arc.io` |
| `QUICKNODE_RPC_URL`                    | Server QuickNode override    | same public host                       |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Optional WalletConnect       | unset                                  |
| `ARCUE_X_SQLITE_PATH`                  | Synthetic ledger SQLite path | `.data/arcuex.sqlite`                  |
| `ARCUE_X_POOL_ADDRESS`                 | Deployed `InsurancePool`     | unset until testnet deploy             |

## Connectivity verification

```bash
node scripts/verify-arc-rpc.mjs
curl -s http://localhost:3000/api/health/live
curl -s http://localhost:3000/api/health
curl -s http://localhost:3000/api/capital
```

## Railway public-beta hosting

November 20 release candidate branch: `release/nov20-arc-testnet-beta`.
Manifest and sanitized Railway env checklist:
[docs/deployments/nov20-release-candidate.md](docs/deployments/nov20-release-candidate.md).
Host runbook: [docs/deployments/railway-public-beta.md](docs/deployments/railway-public-beta.md).
Do not expose the service publicly until those checklists pass.

## Repository map

| Path                   | Role                             |
| ---------------------- | -------------------------------- |
| `apps/web`             | Developer dashboard + API routes |
| `contracts/`           | Foundry `InsurancePool`          |
| `packages/chain`       | Arc config/clients               |
| `packages/quicknode`   | QuickNode RPC                    |
| `packages/domain`      | Insurance domain                 |
| `packages/persistence` | SQLite                           |
| `packages/insurance`   | Application services             |
| `packages/onchain`     | Contract ABIs + tx/reconcile     |
| `packages/agent-sdk`   | Agent quote/bind facade          |
| `docs/`                | Architecture and integrations    |

## Documentation

- [docs/README.md](docs/README.md)
- [docs/architecture/decisions/002-policy-agnostic-insurance-core.md](docs/architecture/decisions/002-policy-agnostic-insurance-core.md)
- [docs/architecture/trust-boundaries.md](docs/architecture/trust-boundaries.md)
- [docs/integrations/quicknode.md](docs/integrations/quicknode.md)
- [docs/integrations/mcp.md](docs/integrations/mcp.md)
- [Premium frontend and backend v1 local acceptance](docs/verification/2026-11-19-premium-backend-v1.md)
- [AGENTS.md](AGENTS.md)

### Authenticated synthetic procurement beta

`/coverage` now provides wallet authentication, agent/exposure registration,
validated demo quotes, immutable terms acceptance and explicit wallet-authorized
USDC approval/binding. `/policies` and `/policies/[id]` expose policy history,
receipts and read-only chain reconciliation. `/agent` manages owner-authenticated
backend delegations; `ProcurementApiClient` supports the remote agent workflow.

This covers **synthetic oracle-adapter-induced wrongful lending liquidation** on
Arc Testnet. Pricing is a demo schedule. Contract commitments and backend-only
eligibility/delegation controls are different guarantees; the deployed pool is
permissionless and does not validate signed quotes. Read the [procurement guide](docs/development/procurement-beta.md)
for endpoints, exact limitations, launch blockers and the claims-sprint handoff.

### Procurement + claims integration

The integration branch uses one wallet-signature/httpOnly session across
`/coverage → /policies/[id] → /claims/new → /claims/[id]`. Claims reference the
immutable procurement policy/exposure directly; reviewer and authority rights
remain separately provisioned. Legacy claimant tokens and procurement browser
bearer sessions are retired. No contract changes or broadcasts are part of this
integration. See the [launch assessment and exact gates](docs/verification/2026-11-17-procurement-claims-integration.md).
Railway hosting packaging and CONDITIONAL GO notes:
[docs/verification/2026-11-17-railway-launch-infrastructure.md](docs/verification/2026-11-17-railway-launch-infrastructure.md).

### Policy reconciliation and shared identity

The backend branch adds a canonical Arc Testnet `PolicyBound` index and read-only session,
lifecycle and incomplete-policy APIs. Procurement claims now require a complete authenticated
policy/exposure link and a healthy reconciliation check within five minutes. Operator scheduling
and historical scanning are required before enabling claims in a future integrated deployment.
See the [Cursor integration contract](docs/development/policy-reconciliation-handoff.md) and
[verification evidence](docs/verification/2026-11-17-policy-reconciliation.md). Chain confirmation
and synthetic offchain preparation remain distinct; no API record guarantees coverage.

### Combined November 20 private-deployment candidate

The integrated product UI reads identity from `/api/session/me` and policy status from
`/api/policies/{policyId}/lifecycle`. A wallet success, approval receipt, bind hash, or
legacy confirmed row alone cannot confirm coverage in the UI. Canonical reconciliation
must report a fresh `VERIFIED_LINKED` policy; claim intake remains owner-authorized.
Incomplete chain records appear separately with claims disabled. Re-check confirmation
or refresh policies after the operator indexer runs. Synthetic terms remain explicitly labeled.

See [the combined deployment acceptance report](docs/verification/2026-11-18-combined-private-deployment.md)
for the tested source SHA, results, indexer/backfill conditions and remaining live acceptance.
The acceptance gate remains enabled. The [hosted deployment report](docs/verification/2026-11-18-combined-railway-hosted.md) records the deployed operational successor, backup, migration and hosted acceptance evidence.

### Additive platform foundation

The additive product-definition foundation and synthetic bank-dispute examiner are documented in
[the platform foundation guide](docs/development/platform-foundation.md), with
[policy-model compatibility decisions](docs/architecture/platform-foundation-compatibility.md).
Definitions and product publication provenance do not change existing policies or grant financial
authority. The enterprise-AI dossier is synthetic and read-only; it cannot bind, deny, reserve or pay.
Run `pnpm --filter @arcuex/insurance example:bank-review` to generate the local synthetic evidence
and review dossier. No model-provider, production or financial integration is required.

Plan B Sprint 1 adds server-side synthetic fixture verification records and authenticated read APIs:
[implementation and limits](docs/verification/plan-b-sprint1-verification.md). Verification does not approve a claim or authorize settlement.
Plan B Sprint 1 offline settlement feasibility and authorization boundaries:
[settlement review](docs/verification/plan-b-sprint1-settlement.md). No deployment or live operation is authorized by this review.

Plan B Sprint 2 binds synthetic verification to explicit human adjudication, evidence sufficiency,
contractual review and frozen loss calculations. See the [reconciliation, validation and readiness
report](docs/verification/plan-b-sprint2.md). Fixture success never authorizes payment; production
synthetic settlement restrictions remain in force.

Plan B Sprint 3 exercises the real local policyholder/reviewer journey with disposable SQLite and
an explicitly synthetic read-only RPC boundary. See [browser evidence and lifecycle UX changes](docs/verification/plan-b-sprint3.md)
and [hosted candidate prerequisites](docs/deployments/plan-b-disposable-candidate.md). Hosted deployment
and financial operations remain separately authorized; no reimbursement occurred in this rehearsal.

Plan B Sprint 4 integrates Sprint 3 into an isolated release-candidate branch and revalidates the
local journey, migration constraints and read-only Arc pool controls. The hosted gate remains closed
on fixture provenance/checkpoint requirements; no Railway candidate was deployed. See the
[Sprint 4 decision and evidence](docs/verification/plan-b-sprint4.md).

Sprint 4.1 implements explicit embedded fixture source selection, pinned checkpoints that survive
restart without renewal, and fixture-aware policy/claim labels. See the
[implementation and validation](docs/verification/plan-b-sprint41.md) and
[fixture operating boundary](docs/deployments/plan-b-fixture-source.md). Local acceptance passed;
hosted deployment remains gated on actual platform/image isolation and separate authorization.

### Iterative claims investigation

The existing claims UI and agent SDK now share append-only proof requests, submissions, examiner
findings and human responses on one claim. Claim details connect open requests and source citations
to the recorded timeline. Long timelines group events by UTC date and fold older activity.
Citations open the corresponding evidence records. The reviewer workbench groups cases by their next
action. A shared shell shows the current route and environment across Protect, Build, Claims and Ops.
OpenAI analysis runs in a separate bounded worker and never authenticates evidence or authorizes a
decision or payment. The OpenAI key belongs only in the separate worker environment. See
[workflow, authority boundaries and acceptance](docs/claims-investigation.md).

The [backend readiness report](docs/verification/2026-11-19-backend-live-readiness.md) records the current Arc procurement, independent evidence and reimbursement gates. The [isolated backend runbook](docs/deployments/backend-isolated.md) describes the separate hosted candidate configuration.

The [backend integration contract](docs/integrations/backend-integration-v1.md) specifies staged procurement, controlled settlement authorization, and reorg-aware payment reads. [Synthetic JSON response examples](docs/integrations/backend-integration-v1.json) are available for frontend integration.

### Agent MCP server

`/api/mcp` exposes the policyholder workflows to MCP-compatible agents through the official
TypeScript SDK. Tools call the existing API route handlers in-process, so backend authorization is
unchanged. Wallet-signature tokens are scoped and revocable. Underwriting review, renewal and claim
reconsideration are reported as unsupported because the backend has no such services. See
[the MCP integration guide](docs/integrations/mcp.md) and the
[local verification report](docs/verification/2026-11-20-mcp-server.md). The
[hosted acceptance report](docs/verification/2026-11-20-mcp-hosted-acceptance.md) records real
remote SDK clients against two isolated, gated Railway test services. Existing staging and Plan A
were not changed or accepted.
