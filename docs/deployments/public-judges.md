# Public Arcuex deployment for judges (November 20, 2026)

**URL:** <https://arcuex-production.up.railway.app>. Public, with no acceptance gate. This replaces
the services removed by accident on November 20 (Plan A `arcuex-nov20-beta`, staging
`arcuex-backend-rc` and the MCP test service).

|                  |                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Source           | `main` at `2890dc77db1f1d9d84164ff3fcfe9f98a45003ad`, which adds `ARCUEX_PUBLIC_ACCESS`                             |
| Railway          | Project `arcuex-mcp-acceptance` `4f45e66f…`, environment `production` `ab9a6fe8…`                                   |
| Service / volume | `arcuex` `5136247d-81c9-4662-972c-c8bc5a8e8df2`; new empty volume `0dadbcb8-ae54-4226-a0dd-3af60993c70e` at `/data` |
| First deployment | `35ede841-bb60-49bb-a120-657e80511e3a`, SUCCESS                                                                     |
| Chain            | Arc Testnet `5042002` through the public RPC; reconciliation starts at block 73180758                               |
| Data             | New database. Plan A's and staging's data volumes are untouched and detached in their own projects.                 |

## One container

`deploy/backend/start-isolated.sh` starts the supervisor, which runs:

- Next.js, serving the website, every `/api/*` route and the MCP endpoint `/api/mcp`. MCP tools call
  the API route handlers in-process.
- The policy reconciliation worker, in the same container and on the same volume.

The optional AI claims examiner is not included. It needs a model-provider key, and the startup
guard keeps that key out of the web/API/MCP container.

## Access and safety

- `ARCUEX_PUBLIC_ACCESS=1` removes only the acceptance gate.
- Still enforced: edge/origin/host checks, rate limits, secure cookies, freshly generated operator
  credentials (held only in Railway), the pinned chain and pool, and
  `CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP=0`.
- Coverage is synthetic testnet coverage. Nothing pays real money.

## MCP for judges

- **Endpoint:** `https://arcuex-production.up.railway.app/api/mcp` (Streamable HTTP).
- **Token:** get one with a wallet signature via `/api/mcp/auth/challenge` and `/api/mcp/auth/token`
  (see [the MCP guide](../integrations/mcp.md)). No gate header is needed.

## Acceptance

`apps/web/scripts/mcp-hosted-acceptance.mts live`, run against the public URL with no gate token,
passed 49/49 checks ([results](../verification/2026-11-20-public-deployment/live-results.json)).

- **Container:** website pages and MCP health are served without a gate, from the same container.
- **Agent setup:** wallet token issuance and refusals; owner-confirmed registration.
- **Procurement:** delegation-gated quotes, and fail-closed purchase preflight for an unfunded payer.
- **Authorization:** tenant isolation, no bearer passthrough, and rate limiting that spoofed proxy
  headers can't bypass.
- **Lifecycle:** token revocation; expired and revoked delegations refused.
- **Blocked tools:** underwriting returns `MCP_EXPOSURE_NOT_ACCEPTED`.

The harness's test agents, quotes and delegations belong to throwaway wallets. They are visible
only to those wallets.
