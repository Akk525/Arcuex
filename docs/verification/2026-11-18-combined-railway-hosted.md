# Combined release — private Railway deployment acceptance

**Decision: CONDITIONAL GO for continued gated private operation.** Verified 2026-11-18.
The combined application is deployed successfully, with data and authentication preserved,
fresh read-only indexing, and passing hosted acceptance. Public launch and funded-wallet
procurement are not authorized by this report.

## Exact source and deployment identity

| Identity                                    | Value                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Tested application                          | `ef3d0d1041e5cdc6fa9dea4e2906c3094e45bf00`                                         |
| Prior report tip                            | `8d5fdaaeaa04d45955416dfbed2ca9f423d6b0d3`                                         |
| **Actually deployed operational successor** | **`f8365a85f0c4a6298f713be7e799cb7538ca1fc7`**                                     |
| Deployment                                  | `88f62d34-0dd9-4d66-9630-1e3491b54b8d` — observed SUCCESS                          |
| Branch                                      | `deploy/nov20-combined-private` (later documentation descendants are not deployed) |
| Project                                     | `arcuex-nov20-beta` / `03848637-de2d-497f-8308-f8f3ccf06f07`                       |
| Environment                                 | production / `6dca510e-fe00-4478-8d8d-ef65fd5bc4d7`                                |
| Service                                     | `1280c69e-abbc-4d06-8ecc-93bf4a6ed226`                                             |
| Persistent volume                           | unchanged `b92846ec-9a00-40b6-80a9-bc9dce1e69a2`, `/data`, one replica, us-west2   |
| Host                                        | `https://arcuex-nov20-beta-production.up.railway.app`                              |

The two supplied SHAs were inspected before selection: `8d5fdaa` adds only README, reports and
evidence to `ef3d0d1`. It was deployed first as `cfa86526-…`; all 285 selected application/config
hashes matched, and schema 010/data preservation were verified before the operational follow-up.

`f8365a8` is an explicit successor, not assumed equivalent: it adds four deployment CJS files
(supervision, worker, cursor helpers/tests) and changes startup in `railway.toml`. The complete
`apps/`, `packages/`, `contracts/` and `Dockerfile` trees remain byte-identical to `ef3d0d1`.
All **289 selected runtime source/config files** in the final image matched the clean deployment
commit, including after restart. Runtime `ARCUEX_GIT_SHA` alone was not used as proof.

## Backup, migration and preservation

Before migration, the running application was verified as `fb6fe5dc8b80107b4860ce3ef2926bf343c493cb`
on deployment `32f25f20-…`. It had 11 migrations through 009; the volume identity matched,
SQLite integrity was `ok`, foreign-key checks were empty, readiness was 200 with the gate,
and ungated access was denied.

A consistent SQLite `.backup` was created without copying a live WAL file:

- Snapshot: `/data/backups/combined-preupgrade-20261118T052329373Z.sqlite` (421,888 bytes).
- SHA-256: `06cf8a259e0ce1d94b983426d403422525b5cd32409f874c7c65fc2fca15a077`.
- Separate on-volume recoverability copy: same prefix plus `-recoverability-copy.sqlite`.
- Restricted off-volume copy: `/Users/aditya/Projects/Arcuex/.data/private-backups/combined-20261118/combined-preupgrade-20261118T052329373Z.sqlite`.
- Integrity, foreign keys, reopening a separate copy and matching checksums verified.
  Both on-volume recovery files and the off-volume copy remained unchanged at final verification.
  Backup files are mode 0600; the local backup directory is mode 0700. No raw database is committed.

Candidate migrations ran twice on a separate off-volume validation copy. All **30 existing
application tables** retained exact row-content hashes; the new tables were empty and the unique
canonical-bind and local-policy indexes existed. Live migration added only
`010_policy_reconciliation.sql` (12 total migration files). All **29 stable pre-existing tables**
checked against the original backup were unchanged before acceptance writes; schema migrations
and changing rate counters were excluded as expected. No destructive restoration was run.

Hosted acceptance created one synthetic registration/quote/prepared policy and authentication
records. The original prepared policy remained; there are **two prepared policies, zero fabricated
active policies**, no claims cases or settlements, and no capital changes. Historical indexing
imported actual chain evidence without inventing its owner, terms or local policy link.

## Hosted acceptance results

| Check                                                       | Result                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Railway deployment                                          | SUCCESS; same persistent volume; one replica; zero overlap                                                                                  |
| Source-file provenance                                      | 289/289 hashes match `f8365a8`; checked after restart                                                                                       |
| Hosted real-backend/browser acceptance                      | **40/40 PASS**                                                                                                                              |
| Hosted launch smoke                                         | PASS: Secure/HttpOnly auth, policy/claims reads, forged/unauthorized writes, auth limiter                                                   |
| Post-restart HTTP checks                                    | **7/7 PASS**                                                                                                                                |
| Liveness / gated readiness                                  | 200 / 200; SQLite, chain, deployment and solvency checks true                                                                               |
| Ungated root, coverage, claims and procurement API          | 401; invalid gate also denied                                                                                                               |
| Session/capabilities                                        | Real signed-wallet login/logout and provisioned reviewer/authority sessions pass                                                            |
| Role restrictions                                           | Claimant cannot adjudicate/prepare settlement/mark paid via forged role; reviewer cannot prepare settlement; ops cannot open claimant cases |
| Receipt boundary                                            | Fabricated bind hash rejected by the real receipt verifier; policy remains prepared/nonclaimable                                            |
| Historic eligibility                                        | One actual ONCHAIN_UNLINKED record, `policyId:null`, `claimsEligible:false`; authenticated claim options empty                              |
| Migration / integrity                                       | 12 migrations through 010, integrity `ok`, zero FK violations                                                                               |
| Restart persistence                                         | Exact counts/content hashes unchanged across 10 tables including 11 session rows; cursor resumes and advances                               |
| Operational cursor tests                                    | **4/4 PASS**: bounded contiguous scan/retry, overlap/depth, identity/head rejection, durable reopening                                      |
| Financial sends / contract deployment / destructive restore | **None**                                                                                                                                    |

The prior 228 TypeScript tests, 22 contract tests, typecheck/lint/build and 33 combined mocked UI
scenarios apply to the unchanged application tree. The operational additions have separate cursor
tests and were exercised in the production image on Node 22.23.5. Hosted acceptance uses real
APIs/SQLite and only an injected-wallet connection scaffold; its send/sign transaction methods
are unavailable. It never funded a wallet, approved USDC, bound a policy or authorized a payout.

Remote smoke intentionally skips its local SQLite-path assertion; actual hosted SQLite durability
was verified separately by SSH row hashes, volume identity and restart checks. The gate token,
ops credentials, signing keys and cookie values are absent from saved logs and source.

## Indexer and monitoring

Initial history is complete from verified pool deployment block **72644660**. Historical code reads
proved no pool code at 72644659 and code at 72644660. The captured final poll indexed through
**72802006**, with head 72802008 and `nextBlock:72802007`; it was healthy with zero failures.
These are evidence timestamps, not a fixed future cursor. Later polls continue every minute.

- Existing canonical backend, fixed two-block confirmation depth; batches ≤2,001 inclusive blocks.
- Persistent fsynced cursor/health JSON under `/data/reconciliation`; advance only after backend success.
- Failure suspends backend freshness, retains cursor and retries the same range.
- After catch-up, 32-block overlap on each 60-second poll; prior canonical block revalidation retained.
- Supervisor runs web and worker together. A 15-second watchdog restarts on success age >300 seconds,
  with startup grace; backend eligibility independently fails closed on unhealthy/stale checkpoints.
- One real bind was imported as **ONCHAIN_UNLINKED**. It remains nonclaimable. No forged active
  records, synthetic ownership links, ClaimsCase rows, financial proof or settlements were seeded.
- Restart preserved the cursor; a later checkpoint advanced from 72801886 to 72802007, demonstrating
  recurring work after restart rather than a one-off SSH process.

Configuration, monitoring, retry/recovery and rollback are documented in
[the reconciliation runbook](../deployments/nov20-readonly-reconciliation.md).

## Deployment corrections and remaining risks

1. The first operational image used the image's original web command; no indexer started. Explicit
   service startup/lifecycle settings were applied and the running PID 1 is now the supervisor.
   A platform redeploy failed during Railpack setup, before runtime. The previous gated app stayed
   healthy; a clean CLI Docker upload of the same SHA succeeded. The service's configuration read
   still reports a Railpack builder default although successful uploads built with Docker. Future
   deployments must use the documented Docker upload path and verify builder/logs/source; do not
   assume platform redeploy is interchangeable. No schema rollback was attempted.
2. The supervisor correctly used Railway's `PORT=8080`; the old domain still targeted 3000, causing
   a temporary 502 during acceptance. Only that existing domain's target port was updated to **8080**.
   The hostname, canonical origin/TLS boundary, gate and volume were preserved. Hosted tests pass
   after correction; retain this target port for the documented rollback command too.
3. `/api/health/ready` does not include indexer freshness. Use the separate durable health file,
   structured logs and watchdog. No external paging/alert routing was configured. Production
   monitoring ownership and longer-term RPC/scan-load observation remain operational follow-ups.
4. RPC completeness/correctness and two descendant blocks are trust/confirmation assumptions.
   Reorgs, stale checkpoints and missing immutable links continue to fail closed. Full prior-block
   revalidation cost grows with historical volume.
5. The funded extension-wallet bind → indexed confirmation → eligible claim journey remains pending
   separate approval. Synthetic terms and the current pool's operational capital/window limits
   remain in force. No public launch or funded procurement is approved here.

## Safe rollback boundary

Do **not** use `fb6fe5d` as a code-only database rollback: its claim eligibility predates this index.
The validated operational fallback is exact **8d5fdaa**, whose application code is identical and
which applied/read schema 010 before the worker rollout. It requires changing the start command
back to a command present in that image (port 8080), preserving all safety configuration and the
migrated database. Claims will fail closed when automatic indexing stops and freshness expires.
Use this only as a reviewed degraded-mode operational rollback, then rerun acceptance.

A real database restore requires stopping writers, preserving current data, verifying a selected
snapshot/checksum on an isolated copy, accounting for post-backup writes, and explicit offline
restoration authorization. Keep recovery hold until review. No restore was run as a test and no
schema downgrade/data deletion occurred. The full procedure is in the runbook.

Sanitized source hashes, platform state, backups/migration checks, hosted assertions/screenshots,
restart comparisons and indexer checkpoints are in
[the hosted evidence directory](../working-notes/nov20-hosted-deployment/evidence/).
