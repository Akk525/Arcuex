# Disposable Plan B hosted candidate prerequisites

Prepared November 18, 2026 (America/Indiana/Indianapolis). **Preparation only.** No Railway
account read, service/environment creation, variable update, volume operation or deployment was
performed. IDs below are requirements, not provisioned resources. Deployment remains gated on
review of the Sprint 3 working branch and separate explicit authorization.

## Isolation and preserved Plan A

Create an **empty, separately named candidate environment** or a separately authorized project,
then a new web service and a new persistent volume. Do not duplicate/sync Plan A's environment:
duplication copies configuration and ordinary variables and stages deployments. Railway documents
these behaviors in [Environments](https://docs.railway.com/environments) (checked November 18, 2026).
The candidate must have its own public hostname, database, volume ID/marker, session epoch,
operator credentials, gate secret and rate-limit secret. Do not import production data or secrets.

Preserve the running Plan A at `f8365a85f0c4a6298f713be7e799cb7538ca1fc7` and its
`fallback/nov20-plan-a-f8365a8` tag. The preserved Plan A service/environment/volume/deployment
IDs are in [the recovery boundary](main-and-plan-a.md). None may be used as a candidate target.
No current remote Plan A state was re-inspected during Sprint 3; no remote changes were made.

Before any future publish, explicitly record the new candidate project/environment/service/
volume/domain IDs and compare them against Plan A. Disable Git autodeployment and PR-triggered
creation for this candidate until separately approved. Do not connect or push the working branch
as an implicit deploy step. Pin the reviewed commit and exact built source; a successful merge,
push, build or CI run is not deployment approval.

## Runtime requirements

Use the existing reviewed Dockerfile/entrypoint with Node 22 and pnpm 11.20.0. Do not assume a
Railpack default matches the Docker build. Use one replica and zero deployment overlap for SQLite.
Mount the **new** volume at `/data`. Start the application only after the volume is mounted;
Railway states volumes are unavailable during pre-deploy commands in
[Using Volumes](https://docs.railway.com/volumes) (checked November 18, 2026). The current entrypoint
creates/verifies the identity marker and backs up only this candidate database before startup.
Do not restore a Plan A backup to seed the candidate.

| Variable / setting                              | Candidate requirement                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                                      | `production`                                                                                                                               |
| `ARCUEX_DEPLOYMENT_MODE`                        | `public-beta`; never use development mode to relax hosted controls                                                                         |
| `ARCUEX_PUBLIC_ORIGIN`                          | Candidate's exact unique HTTPS origin                                                                                                      |
| `ARCUEX_PUBLIC_HOST` / `ARCUEX_TLS_SERVER_NAME` | Exact corresponding host / hostname                                                                                                        |
| `ARCUEX_CHAIN_ID`                               | `5042002`                                                                                                                                  |
| `ARCUE_X_POOL_ADDRESS`                          | Existing manifest's pinned pool `0x6657974EEdF488380251bDD95A7FFfb0D456E49E`; no new contract deployment in this scope                     |
| `ARCUEX_DATA_DIR`                               | `/data` on candidate volume only                                                                                                           |
| `ARCUE_X_SQLITE_PATH`                           | `/data/arcuex.sqlite` on candidate volume only                                                                                             |
| `ARCUEX_STORAGE_ID`                             | Unique candidate ID matching `/data/.arcuex-volume-id`                                                                                     |
| `ARCUEX_SESSION_EPOCH`                          | New candidate-only epoch; no copied sessions/nonces                                                                                        |
| `ARCUEX_RATE_LIMIT_SECRET`                      | Fresh candidate-only 64 hex characters                                                                                                     |
| `CLAIMS_REVIEWER_API_TOKEN`                     | Separate fresh 64-hex reviewer credential                                                                                                  |
| `CLAIMS_AUTHORITY_API_TOKEN`                    | Separate fresh 64-hex authority credential                                                                                                 |
| `CLAIMS_SYSTEM_API_TOKEN`                       | Omit unless needed; if set use a distinct fresh 64-hex credential                                                                          |
| `ARCUEX_ACCEPTANCE_GATE_TOKEN`                  | Distinct fresh 64-hex gate secret; enabled before exposure                                                                                 |
| `CLAIMS_COOKIE_SECURE`                          | `1`; HttpOnly/SameSite session behavior retained                                                                                           |
| `CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP`        | `0`; production runtime must continue rejecting `1`                                                                                        |
| `ARC_TESTNET_RPC_URL` / `QUICKNODE_RPC_URL`     | Separately scoped approved HTTPS read sources; no production API-key reuse                                                                 |
| `PORT` / domain target                          | Match candidate service port; do not alter Plan A's port/domain                                                                            |
| Signing credentials                             | No private keys, mnemonic, funded signer, wallet seed or shared financial signing credential in app, environment, image or fixture service |

All operator/gate/rate credentials must be distinct and server-only. Do not put them in
`NEXT_PUBLIC_*`, source, reports, shell arguments or Docker context. Environment variables are
scoped to their environment, but public domains still require authentication; seal candidate
credentials as appropriate. See Railway's [Variables](https://docs.railway.com/variables) and
[isolation guide](https://railway.com/guides/isolate-staging-production), checked November 18, 2026.

## Exact schema and verification configuration

The default startup migration sequence is:

```text
001_init.sql
002_onchain.sql
003_streams_inbox.sql
004_procurement.sql
005_procurement_immutability.sql
004_claims_cases.sql
005_claims_case_binding.sql
006_claims_auth_sessions.sql
007_procurement_claims_integration.sql
008_shared_wallet_session_scope.sql
009_launch_security.sql
010_policy_reconciliation.sql
011_claim_verifications.sql
```

There are thirteen migration records despite duplicated historical numeric prefixes. Run through
the existing migrator, not a numeric filename sort. Preserve migrations through 010 and use exact
011 from Sprint 1/2. Run twice on a disposable database, confirm SQLite integrity/foreign keys,
claim identity immutability and append-only verification records. The competing preserved
`011_policy_indexer.sql` remains excluded. Product publication registry remains opt-in.

There is no provider credential or environment switch needed for synthetic fixture verification.
Use the code-owned catalog `synthetic-oracle-ratio-v1:wrongful-liquidation:v2`, exact raw bytes and
digest served by claim detail, verifier `integration-v2`, and the original synthetic procurement
terms/exposure. The fixture explicitly declares zero recoveries/compensation; it authenticates no
real event. The new form selects that fixture explicitly; custom/missing/contradictory evidence must
remain under review. A reviewer must independently confirm contractual applicability/exclusions
and rationale. An API role credential is not a financial signing key or a natural-person identity.

## Chain/checkpoint source: unresolved hosting gate

The local acceptance runner seeds a confirmed synthetic policy and reconciliation row in a new
SQLite database, then supplies matching **read-only localhost RPC fixture responses**. It does not
bind a policy or produce a real receipt. Browser application HTTP responses are real and unmocked.
This local process is not a deployable hosted fixture service and is not an Arc indexer.

A future candidate must select and separately approve one coherent source model:

- A clearly labeled, isolated HTTPS read-only fixture service plus disposable seed/checkpoint
  procedure. The fixture must reject transaction/signing methods, expose no private keys and never
  be presented as independent Arc evidence. The existing reconciliation worker cannot run against
  the minimal local fixture: it needs canonical logs, blocks, cursor persistence, restart/reorg and
  freshness acceptance. Do not merely refresh timestamps and call them live reconciliation.
- Real read-only Arc reconciliation for an actually bound policy controlled by the acceptance
  policyholder. Any new policy binding/funding or transaction needed to establish that state needs
  separate financial authorization. Seeded fake receipts cannot substitute for genuine chain reads.

No hosted fixture service or new worker mode was implemented. For a genuine Arc candidate,
`ARCUEX_RECONCILIATION_ENABLED=1` needs a verified start block for that pinned pool, candidate-only
`/data/reconciliation` state and a successful bounded backfill/fresh checkpoint before claims.
Use the existing supervisor/worker, not the excluded competing indexer. Test restart, reorg,
checkpoint age/unhealthy suspension and cursor continuity on candidate data. A readiness response
alone does not prove freshness. Never copy Plan A's mutable cursor/health files to the candidate.

Thus infrastructure requirements are documented, but hosted full-journey readiness remains
**conditional on this unresolved source/checkpoint choice and deployment approval**. No copied
production identity, fake financial proof or synthetic settlement override is an acceptable shortcut.

## Future acceptance and financial stop

After a separately approved deployment, check candidate ID/source hash, gated HTTPS/edge trust,
origin/CSRF checks, secure cookies, volume identity, thirteen migrations, persistence after restart,
health and actual checkpoint freshness. Repeat policyholder/reviewer ownership boundaries, full
synthetic journey, missing/contradictory evidence, unresolved recoveries and stale/expired sessions.
Verify APPROVED is pending authority, no synthetic settlement preparation succeeds, no paid receipt
is manufactured and no financial method is broadcast. Delete candidate-only resources only after
separate teardown authorization and preservation of review evidence.

Full Plan B reimbursement still requires separate scope/authorization for a compatible isolated
financial rehearsal, an unexpired funded policy with remaining reservation, current pool/USDC and
claimsAuthority checks, exact transaction bindings, an authorized wallet confirmation and independent
receipt reconciliation. Production synthetic restrictions remain unchanged; this candidate plan
cannot authorize a payout. Real-world loss authentication and individually attributable reviewer
identity remain additional gates for any non-fixture insurance claim.
