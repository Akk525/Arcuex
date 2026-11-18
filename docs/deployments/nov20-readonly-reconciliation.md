# Private Railway read-only reconciliation operations

Verified 2026-11-18. Scope: existing `arcuex-nov20-beta` private acceptance host.
This worker reads chain data and writes the local reconciliation index. It cannot sign,
broadcast, settle claims or invent authenticated links. Do not add a wallet/private key.

## Release identities and startup

- Tested application: `ef3d0d1041e5cdc6fa9dea4e2906c3094e45bf00`.
- Reports/evidence successor: `8d5fdaaeaa04d45955416dfbed2ca9f423d6b0d3` (no executable changes).
- Operational deployment: `f8365a85f0c4a6298f713be7e799cb7538ca1fc7`.
  It adds only four deployment CJS files and a `railway.toml` startup change.
  `apps/`, `packages/`, `contracts/` and `Dockerfile` remain identical to the tested application.

The actual service settings must specify:

- Start: `/entrypoint.sh node /app/deploy/railway/supervisor.cjs`.
- Liveness probe: `/api/health/live`; timeout 300 seconds.
- One replica in `us-west2`, overlap 0, draining 20 seconds, same `/data` volume.
- Existing hostname targets port **8080**, matching Railway's runtime `PORT`.
- `ARCUEX_RECONCILIATION_ENABLED=1`.
- `ARCUEX_RECONCILIATION_START_BLOCK=72644660`.
- Existing acceptance gate, origin, session epoch, storage ID, RPC and ops credentials unchanged.

Do not rely on the uploaded `railway.toml` to apply settings to this service. Explicit service
settings and the runtime PID 1 were verified. During this rollout a platform redeploy attempted
Railpack setup and failed before runtime, leaving the previous application live. Uploading the
exact clean commit with the CLI used the verified Docker build path. For later releases, inspect
the selected builder and resulting build logs; do not assume an MCP redeploy uses the same path.

The entrypoint captures a prestart snapshot before the supervisor opens SQLite. The supervisor
launches Next and the worker together, terminates process groups on shutdown, and fails the whole
service if a child exits. The original acceptance gate and backend runtime validation remain in force.

## Initial history and durable cursor

Start block `72644660` was derived by read-only historical `eth_getCode` binary search:
block `72644659` has no pool code; block `72644660` has code. It is not a guessed bind block.
Chain ID and the existing pinned pool are checked; no chain parameters or contracts were changed.

The worker scans contiguous inclusive batches of at most 2,001 blocks, ending at least two blocks
behind the head. Each batch calls the existing backend reconciliation CLI. The backend verifies
logs, pool state, original immutable records, reorgs and confirmation depth, and transactionally
commits evidence plus its healthy checkpoint.

Only a successful batch advances `/data/reconciliation/cursor.json`. The worker writes the cursor
with file fsync, atomic rename and directory fsync. A crash after the backend transaction but before
cursor advancement repeats that range safely. A failed scan leaves the cursor unchanged, marks the
backend scope unhealthy, writes sanitized health and retries in 60 seconds. Invalid cursor identity,
wrong chain or regressed head fails closed. A missing cursor starts full history again; never replace
it with the current head to skip backfill.

After catching up, the worker rescans with 32-block overlap every 60 seconds. It resumes from the
persisted cursor after restart. Confirmation depth is fixed at two descendant blocks; this is a
confirmation policy, not a guarantee against deeper reorgs. The existing backend revalidates prior
canonical event blocks and deduplicates redeliveries.

## Monitoring and recovery

- Inspect `/data/reconciliation/health.json` and `cursor.json` over authenticated Railway SSH.
  Check `healthy`, `backfillComplete`, `lastSuccessfulAt`, `consecutiveFailures`, `nextBlock` and
  the backend `policy_reconciliation_scopes` checkpoint.
- `policy-reconciliation` structured Railway logs report each batch/poll and sanitized failures.
- The supervisor checks every 15 seconds and restarts the service if no successful scan is recorded
  for 300 seconds (with a five-minute startup grace). Claims independently fail closed on unhealthy
  or stale backend checkpoints. One replica and zero overlap prevent concurrent volume writers.
- `/api/health/ready` checks app/SQLite/chain/solvency; it does **not** include indexer freshness.
  Monitor the worker health separately. No external paging integration was configured.
- For RPC outages, inspect provider/network and retry unchanged ranges. Do not fabricate evidence,
  manually set `healthy=1`, change an unlinked row to verified, or grant claims from payer identity.
- If the cursor is corrupt, stop the worker/service, preserve the file and review it against the
  backend checkpoint. Recovery may rescan from the verified deployment boundary; do not fast-forward
  past unscanned history. Preserve the database and evidence; reset only reviewed operational cursor
  state. Recheck duplicate/reorg behavior, freshness and claim eligibility before resuming access.
- Full prior-canonical-block revalidation grows with indexed history. Measure latency/RPC volume as
  beta usage grows. Current initial backfill found one canonical `ONCHAIN_UNLINKED` observation,
  intentionally nonclaimable. No original terms or owner link were fabricated.

## Backups and compatible rollback

The pre-upgrade snapshot is retained as `/data/backups/combined-preupgrade-20261118T052329373Z.sqlite`
with checksum sidecar. SHA-256:
`06cf8a259e0ce1d94b983426d403422525b5cd32409f874c7c65fc2fca15a077`.
A separate on-volume recoverability copy and a restricted off-volume copy exist; paths and checks
are recorded in the deployment report. Migration was tested twice on an off-volume copy and preserved
all 30 pre-existing application tables. Actual migration retained the 29 stable historical tables
checked before hosted tests (rate counters excluded). The live database now has 12 migrations through
`010_policy_reconciliation.sql`.

**Do not redeploy `fb6fe5d` as a database rollback.** Its claim eligibility semantics predate canonical
reconciliation. Platform `canRollback` metadata is not proof of schema or safety compatibility.

For an operational rollback, the known `8d5fdaa` image/application is compatible with schema 010:
it applied that migration and passed gated readiness/data preservation before the worker rollout,
and its application tree equals the deployed application. Disable automatic indexing/startup only
as an intentional degraded mode; procurement claims become unavailable when freshness expires.
Before uploading exact `8d5fdaa`, change the start command to an existing command in that image,
for example `/entrypoint.sh pnpm --filter @arcuex/web exec next start -H 0.0.0.0 -p 8080`.
Preserve the gate, origin, volume, storage ID, session epoch, one replica and overlap 0. Verify the
actual build source/config and repeat hosted safety checks. Do not point an older image at a missing
supervisor file or downgrade/delete schema/data.

If data restoration becomes necessary, stop all writers and take a current preservation backup.
Validate the selected snapshot/checksum and restore first to an isolated file, checking integrity,
foreign keys, expected migrations and contents. Only an explicitly authorized offline restoration
may replace the service database; hold mutations with `recovery_hold=1` until reconciliation and
session/security review. Account for all post-snapshot writes before re-opening access. The existing
restore script is not an online verification tool. **No destructive restoration was run in this task.**

The funded extension-wallet bind → index → claim journey and public launch require separate approval.
