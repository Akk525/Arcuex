# Combined frontend + backend private deployment acceptance

**Decision: CONDITIONAL GO for a gated private Railway deployment of the combined application.**

This is a source/local-production acceptance report, verified November 18, 2026.
The combined application has not been deployed to Railway. The existing Railway deployment,
acceptance gate, contract deployment and financial state were not modified. No financial
transaction was broadcast. Public rollout and live claim availability remain gated below.

## Source identity

- Isolated branch: `integration/nov20-combined-acceptance`.
- Worktree: `.worktrees/nov20-final-integration`; unrelated main-checkout changes were left untouched.
- Latest tested release baseline: `fb6fe5dc8b80107b4860ce3ef2926bf343c493cb`.
- Exact backend parent: `f579aef86ebe7d4ceff95e28f560699b2b98c17e`.
- Exact frontend parent: `9e36062e527bb9ffa13907b71c30b3f414174e49`.
- Backend merge: `eac42b5`; frontend merge: `07ec616`; both conflict-free, non-fast-forward merges.
- Integrated application commit: `ef3d0d1041e5cdc6fa9dea4e2906c3094e45bf00`.
- Final tested candidate: **`ef3d0d1041e5cdc6fa9dea4e2906c3094e45bf00`**. Later report/evidence-only commits do not change executable source.

The final candidate includes API wiring, a regression fix preserving authoritative eligibility
for historical incidents on expired verified policies, and reproducible browser harnesses.
The final production build and verification runs use this candidate's application source.

## Integration behavior and safety preservation

- `useClaimsSession` reads typed `/api/session/me`, including authoritative role and capabilities.
  Account/chain changes, successful login/logout, focus and API 401 responses refresh session state.
  Superseded requests cannot restore an old identity. Workspace selection grants no server privilege.
- AccountBar, Protect/Build navigation, four-stage coverage wizard, claim labels/detail and Ops
  presentation are preserved. Failed sign-in/sign-out is surfaced. Policy projections are cleared
  on session/account/network change; stale asynchronous projections cannot restore confirmation.
- Wizard confirmation requires the lifecycle API's `confirmed` state, `VERIFIED_LINKED`
  completeness and a checkpoint no older than 300 seconds. A successful approval, wallet receipt,
  `/confirm` response, browser session storage, or legacy `state:confirmed` row is insufficient.
  The operator runs reconciliation; the user re-checks confirmation afterward.
- Policies load `/api/policies/{UUID}/lifecycle` and `/api/policies/reconciliation`. Unlinked,
  incomplete/orphaned records are separate, nonclaimable entries. Fresh lifecycle eligibility
  controls claim actions, including historical incident intake on expired verified policies. Indexed bind evidence and settlement references are labeled as evidence;
  historic metadata does not override current lifecycle status or prove a financial settlement.
- All backend/API, insurance/domain, procurement persistence implementation, contracts,
  Dockerfile and `railway.toml` files are byte-identical to the tested backend parent `f579aef`.
  The only additional persistence change is regression-test coverage. ClaimsCase transitions,
  loss keys, immutable bindings, owner eligibility, payout authorization, settlement verification,
  session epochs and financial accounting controls are retained.
- The public-beta acceptance gate remains mandatory. Existing request-boundary tests cover
  accepted gated ingress and rejection without the gate. Production synthetic settlement
  preparation remains disabled. No automatic signer, indexer HTTP write endpoint or payout path
  was introduced.

## Verification

Environment: Node 24.16.0, pnpm 11.20.0, Next 15.5.29; headless installed Chrome via
Playwright 1.49.1. `pnpm install --offline --frozen-lockfile` succeeded without lockfile changes.
Production server: `http://localhost:3027`, `local-test`, separate durable SQLite under `/tmp`.
Secure/HttpOnly session cookies, distinct ephemeral server credentials, pinned Arc chain/pool
and disabled synthetic settlement preparation were retained. No existing Railway volume was opened.

| Check                                                       | Result                                                                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                 | 228/228 pass across eight workspace packages/apps                                                         |
| `pnpm test:contracts`                                       | 22/22 pass; unchanged contracts; local ignored dependency copies from the existing lifecycle worktree     |
| `pnpm typecheck`                                            | PASS                                                                                                      |
| `pnpm lint`                                                 | PASS, zero warnings                                                                                       |
| `pnpm build`                                                | PASS; existing advisory about Next ESLint plugin detection remains                                        |
| Fresh/upgrade SQLite migration and index checks             | 9 migration tests pass; 12 ordered migration files through `010`                                          |
| Real-backend API + browser acceptance                       | 17/17 pass                                                                                                |
| Combined mocked browser acceptance                          | 33/33 PASS, 0 FAIL, 0 WAIVED                                                                              |
| `pnpm smoke:launch`                                         | PASS against rebuilt local production server; auth, cookies, unauthorized writes, limiter, durable SQLite |
| Local `/api/health/ready`                                   | HTTP 200; database, chain, deployment and solvency true; recovery hold false                              |
| Live read-only reconciliation                               | PASS twice over the same range, chain 5042002; in-memory database; no events observed                     |
| Financial broadcasts / contract redeploy / Railway mutation | None                                                                                                      |

SQLite regression coverage exercises fresh creation, repeat migration, procurement-only,
claims-only and combined older histories, existing-release upgrade, rollback on invalid foreign
keys and session retirement. The release-to-010 test snapshots ClaimsCase rows/events/sessions,
policies, exposures, capital pools/reservations, settlements and chain settlement records before
migration and checks exact preservation. Historical procurement payload and receipt references
remain unchanged; migration creates no invented canonical proof or claim eligibility.

Index tests reject duplicate canonical binds while retaining orphaned evidence and checking the
local-policy lookup index. The backend's 19 reconciliation tests cover repeat delivery, authenticated
historical recovery, unlinked imports, missing immutable inputs, reorgs, conflicting duplicates,
failed/superseded scans, incorrect chain/state and stale eligibility. These are controlled fixtures;
the live empty range does not independently prove a funded bind or historical recovery.

The real-backend browser checks use real signed-wallet authentication and local SQLite, register
synthetic exposure, quote and prepare offchain terms after read-only chain preflight. A fabricated
bind hash is rejected by the real receipt verifier and leaves lifecycle prepared/nonclaimable.
Policy UI, AccountBar, claimant Ops restriction and real logout are verified. The ephemeral wallet
has no funded transaction role and never broadcasts.

Mock browser checks cover the original 29 UI scenarios plus explicit mock-success, stale-checkpoint, historical
incident eligibility and stale claim-action checks. `INT-01` keeps confirmation pending even when wallet/RPC success and `/confirm`
return success; only a separate authoritative lifecycle fixture permits the confirmed label.
`INT-02` rejects a stale verified checkpoint. `INT-03/04` preserve the server
claim-eligibility decision for expired verified policies and suppress claim actions after freshness expires. Mock screenshots and positive mock lifecycle labels
are UI evidence only, not proof of onchain binding. Functional tests use system fallback fonts;
Google Fonts is blocked in the harness after a third-party load stalled a reload. Harness fixes
also await the stale lifecycle response before changing its next fixture. No application safety
assertion was waived to obtain a passing run.

## Conditions and remaining blockers

1. **Private hosting acceptance is pending.** A later authorized deployment must retain the
   acceptance gate, exact-origin/TLS boundary, production cookie flags, distinct server-only
   credentials, single replica, existing pinned chain/pool, and volume identity. Take an offline
   backup before startup migration. Validate a copy of the actual target SQLite database before
   accepting its upgrade; this run tested fresh/seeded historical fixtures, not Railway data.
   Repeat ready/smoke/browser checks on the private HTTPS host. No platform settings were changed
   or revalidated against a newly deployed combined application in this task.
2. **Canonical history and ongoing indexing are required before procurement claim availability.**
   No scheduler was installed. An operator must scan the intended history in contiguous confirmed
   batches and run overlapping confirmed scans preferably every minute, always within 300 seconds.
   Follow [the backend handoff](../development/policy-reconciliation-handoff.md). Missing, failed,
   stale, orphaned or incomplete checkpoints intentionally leave procurement claims disabled.
   Historic policies without original authenticated terms/acceptance/exposure remain nonclaimable.
   Measure full-history revalidation RPC cost before increasing beta volume.
3. **The funded extension-wallet bind → indexed confirmation → claim-intake journey is still
   pending separate explicit transaction approval.** No new live bind or payout was attempted.
   A full real-chain journey cannot be inferred from mocked receipt/UI acceptance or an empty
   reconciliation scan. Existing operational capital/window limits remain applicable.
4. **Public release is not approved.** Keep private acceptance access and synthetic-demo labeling.
   Do not enable synthetic payout preparation, remove the gate, change contracts or issue mainnet coverage.

These conditions permit controlled private deployment/host testing while unavailable features fail
closed. They prevent an unconditional GO for live procurement claims or public rollout. A missing
acceptance gate, invalid runtime config, unsafe target-volume migration, failed host readiness,
or unexpected claim/payout authorization is a NO-GO until resolved.

## Evidence and reproduction

Sanitized logs, live readiness/reconciliation JSON, real-backend assertions and the final browser
matrix are in [the evidence directory](../working-notes/nov20-combined-acceptance/evidence/).
The scripts are [combined mocked acceptance](../working-notes/nov20-combined-acceptance/run-combined-acceptance.mjs)
and [real-backend acceptance](../working-notes/nov20-combined-acceptance/run-real-backend-acceptance.mjs).
Set `BASE_URL`, `PLAYWRIGHT_MODULE` (absolute installed `playwright/index.mjs`),
`PLAYWRIGHT_CHROME_PATH`, `OUT_DIR` for the mock run and `OUT_FILE` for the real run.
Provision test-only credentials and isolated SQLite using the existing
[local production instructions](../deployments/railway-public-beta.md); never reuse a deployed database.
Run the real-backend suite before launch smoke because smoke intentionally exhausts the auth limiter.

Deployment must select the exact tested candidate SHA above. Report-only descendants are acceptable
only after confirming no executable/configuration diff. Rollback must preserve the volume and
migration history; use the existing backup/restore procedure and recovery hold, never delete the database.
