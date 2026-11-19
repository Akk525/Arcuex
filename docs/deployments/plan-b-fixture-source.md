# Disposable fixture source: Sprint 4.1 operating boundary

Prepared November 18, 2026 (America/Indiana/Indianapolis).
This runbook describes the candidate implementation. It does not authorize deployment, provision
resources, or attest to an existing hosted environment. Deployment requires a passed isolation
gate **and separate explicit authorization** under the Sprint 4.1 instruction.

## Two explicit source modes

`ARCUEX_CHAIN_SOURCE=arc-testnet` selects the existing live read/indexer implementation.
`ARCUEX_CHAIN_SOURCE=fixture` selects a local, persisted, SHA-256-pinned synthetic snapshot.
Production must name one; there is no fallback between them. Development/tests retain the live
default for compatibility. A fixture has **no JSON-RPC endpoint**, fake RPC server, signing method
or chain freshness worker. Server RPC accessors and browser transport refuse live reads in fixture
mode. The live worker/supervisor combination is rejected for fixtures.

The snapshot contains the original synthetic procurement policy, source ID and fixed checkpoint.
Its supporting eligibility rows use a dedicated `fixture:<candidate-id>` scope and carry explicit
synthetic provenance. Internal `confirmed`/`VERIFIED_LINKED` storage flags are compatibility markers
for the original synthetic claim service, **not on-chain attestations**. Public lifecycle state is
`fixture_ready`, confirmation is null, no fake explorer links are rendered, and policy/claim UI
identifies the source, digest and checkpoint. Raw procurement records carry fixture provenance;
their legacy storage flags must never be interpreted as live confirmations.

`candidate_fixture_source` is opt-in, immutable and not a new default migration. The thirteen default
migrations through exact `011_claim_verifications.sql` remain unchanged. `chain_source_identity` in
the existing runtime-state table binds a database to its source. A fixture database cannot be opened
as live; a live-bound database cannot be reseeded. Existing fixture files are inspected read-only
before migrations. Missing, mismatched, unhealthy, corrupted, expired or inconsistent fixture state
denies readiness/claims rather than consulting RPC or refreshing a timestamp.

## Checkpoint and restart contract

The explicit initial seed establishes sequence `1`, `createdAt`, and `validUntil = createdAt + 300`
seconds. This bounded lease preserves the original claim eligibility freshness limit. No timer,
startup handler or request renews it. Restarts retain policy identity, digest, checkpoint, sessions,
claims and evidence; an expired source stays expired after restart or restore. Initial entity UUIDs
are generated once and pinned in the snapshot; initialization is not replayed on boot.

This is a **five-minute automated acceptance window**, not a continuously available demo. Build
and inspect the exact image before seeding. Initialization, startup and acceptance must fit inside
the lease. If startup takes too long, fail closed and preserve that dataset; a new rehearsal needs
a new candidate identity and empty database. Do not extend a deadline, change checked timestamps,
refresh a fixture health row in production, or call fixture checkpoint age live reconciliation.

## Required isolated resource/configuration proof

Use a **separate empty Railway project**, service and persistent volume, with no Plan A duplication,
shared variables, mounts, private sibling access, source auto-deploy or production domain. Record
the actual platform IDs and mount ownership through read-back before exposure. Runtime rejects
the known Plan A project, environment, service and volume IDs and its hostname. Local tests simulate
these exclusions; they do not attest to platform network/filesystem permissions.

| Setting | Required fixture value |
| --- | --- |
| `NODE_ENV` / deployment profile | `production` / `public-beta` |
| `ARCUEX_CHAIN_SOURCE` | `fixture` |
| `ARCUEX_FIXTURE_ID` | New `candidate-<UUID>` |
| `ARCUEX_STORAGE_ID`, `ARCUEX_SESSION_EPOCH` | Exactly that candidate ID; no copied sessions/nonces |
| `ARCUEX_DATA_DIR` | `/data` on the new volume |
| `ARCUE_X_SQLITE_PATH` | `/data/<candidate-id>.sqlite`, never Plan A `/data/arcuex.sqlite` |
| `ARCUEX_FIXTURE_DIGEST` | Exact digest from explicit initialization; mandatory for runtime |
| `ARCUEX_FIXTURE_OWNER` | Acceptance wallet's public address; used only by initialization |
| `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_SERVICE_ID`, `RAILWAY_VOLUME_ID` | Verified distinct UUIDs; do not spoof platform identity |
| Public origin, host, TLS server name | Exact unique HTTPS candidate origin/hostname |
| Reviewer / authority / gate / rate secrets | Fresh separate 64-hex values; never Plan A credentials |
| Chain / pool | Existing pinned `5042002` and manifest pool; no deployment or binding |
| Secure cookies | `CLAIMS_COOKIE_SECURE=1` |
| Synthetic preparation | `CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP=0` |
| Reconciliation worker | `ARCUEX_RECONCILIATION_ENABLED=0` or absent |
| Server/browser RPC overrides | All absent in fixture mode |
| Replica / overlap | One / zero for SQLite |

Fixture mode allows its five known application credential variable names (rate, reviewer,
authority, optional system, gate) and the three exact Next-generated encryption/preview variable
names required by the edge runtime; other secret/token/password/key/seed/credential variables are
rejected. Railway account tokens, external database credentials and AWS credentials are also denied.
This name-based validator cannot identify a production secret deliberately placed under an allowed
application name. Provisioning must prove fresh generation and absence of copied shared variables.
No authority signing key is required or permitted. Role tokens are not financial signers.

The Docker context excludes `.env*`, SQLite, `.recovery`, worktrees, `.aws`, `.ssh`, `.codex`, `.agents`,
PEM/key files and working notes. Before a deployment gate can pass, inspect a clean build context and
the resulting image for actual secret-bearing files, embedded build variables and unintended mounts.
Ignore rules and local source tests alone cannot prove that an arbitrary image is secret-free.

## Explicit initialization, then runtime

Only after separately authorized candidate provisioning, use the reviewed image in a candidate-only
initialization job with the **new volume mounted** and all candidate configuration supplied. Generate
secrets inside the approved secret-management path; never put values in shell arguments or reports.
Do not set `ARCUEX_FIXTURE_DIGEST` for initialization; the CLI produces it. Supply the owner's public
address through `ARCUEX_FIXTURE_OWNER`.

```sh
pnpm --filter @arcuex/onchain exec tsx ../../apps/web/scripts/seed-candidate-fixture.mts
```

The command validates the fixture profile, requires an empty volume, creates a new file exclusively,
applies the original migrator, seeds the synthetic snapshot in a transaction and writes the volume
marker. It outputs only the digest, policy ID, checkpoint and synthetic boundary. Persist the digest
as candidate-only configuration; then run the original entrypoint/supervisor with the same image,
volume and configuration. Do not run the initializer in a pre-deploy phase without a mounted volume.
The fixture entrypoint refuses uninitialized storage and will not automatically seed it. A failed
partial initialization requires investigation/preservation, never blind overwrite/retry.

This turn does not exercise Railway initialization, TLS/gate ingress or image/mount attestation.
Perform those checks before recommending a hosted GO and before exposing any candidate hostname.

## Recovery and cleanup

Stop candidate writers and take a consistent SQLite backup of **that candidate only**. Preserve
the marker, source digest/ID, image/source hash and evidence. Check a separate backup copy read-only
for integrity, foreign keys, thirteen migration IDs, snapshot hash and source binding. Use the
existing recovery hold to prevent new mutations during a separately authorized recovery; restart
must not clear it. Only resume after operator review. Restoring an expired checkpoint never renews it.

Never import a Plan A backup, volume, session store, mutable reconciliation cursor or operator secret.
Never restore data to Plan A as part of candidate recovery. When retiring a candidate, export the
dated non-secret acceptance evidence, confirm candidate-only resource IDs and obtain the separately
required teardown authorization. No hosted resources were created in Sprint 4.1.
