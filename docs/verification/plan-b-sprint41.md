# Sprint 4.1: explicit fixture isolation and reproducible restarts

Verified November 18, 2026 (America/Indiana/Indianapolis; artifact timestamps use UTC).
Branch: `release/plan-b-sprint4.1-candidate`, from requested Sprint 4 `4b695cc`.
Implementation: `0deea07385df2eac923080a69c1d85ab2b7792d0`.

**Recommendation: NO-GO for hosted deployment until actual platform/image isolation is attested.**
The three application blockers are implemented and locally validated. There is no hosted candidate,
candidate URL or hosted acceptance claim. No resource was provisioned or deployed. The current user
instruction additionally requires separate deployment authorization after the isolation gate passes.

## Implementation and source boundary

The smallest source implementation uses an **embedded pinned snapshot**, not a hosted fake RPC
service. Production requires explicit `ARCUEX_CHAIN_SOURCE=fixture` or `arc-testnet`. Fixture mode
has no policy RPC endpoint; server RPC accessors and browser transport reject live reads. No fallback
exists. The live reconciliation worker and fixture source cannot run together. Existing live-mode
behavior remains separate and is covered by the original regressions; no new live Arc functionality
is claimed from these offline tests.

An explicit initializer creates one synthetic procurement fixture on an empty disposable volume.
Its immutable snapshot includes policy, source identity and checkpoint; configuration independently
pins its SHA-256 digest. A source identity also binds the database. Starting fixture mode with a live
database or starting live mode with fixture storage is rejected. Existing files are inspected
read-only before migrations. Missing/mismatched/corrupt/expired sources and changed eligibility
evidence deny readiness and claims; they are neither silently repaired nor replaced with live reads.

The snapshot's fixed sequence-1 checkpoint has a **300-second lease** matching existing eligibility
freshness. Startup does not seed, renew or alter it. Restart or backup recovery preserves the same
identity, policy, digest, timestamps and deadline. Expiry requires a new explicitly initialized
candidate dataset; restarting or refreshing the browser cannot make it fresh. Initial entity UUIDs
are generated once and preserved, rather than regenerated deterministically at every boot.

This bounded design is suitable for automated acceptance, not an indefinitely available hosted demo.
The actual hosted startup/acceptance timing must be demonstrated within the lease. The
[operating runbook](../deployments/plan-b-fixture-source.md) describes image-first preparation,
explicit initialization, recovery and retirement. It supersedes the unresolved hosted fixture-RPC
choice in Sprint 3. The old Sprint 3 runner now delegates to the explicit fixture runner; dated
historical evidence remains intact and can be reproduced from its original commit.

## Honest policy and claim labels

The fixture lifecycle returns `state: fixture_ready`, source ID/digest/checkpoint and
`confirmation: null`. Fixture policy pages have no fake explorer receipt links or live-contract
label. A global synthetic banner, policy source details and claim source panel distinguish this
data from live Arc Testnet observations. Raw procurement compatibility records also carry fixture
source metadata. Their internal `confirmed` and `VERIFIED_LINKED` flags are existing synthetic
eligibility storage conventions, not financial-event proofs; the runbook documents this boundary.

Fixture procurement preparation/approvals/bind confirmation, claims settlement preparation and
reimbursement confirmation are explicitly rejected. Module guards also reject financial operations
with a caller-supplied client. Production synthetic settlement configuration and insurance service
restrictions remain unchanged. No AI verdict, successful verification or reviewer approval becomes
payout authority. Wallet transaction UI is disabled in fixture mode.

Selected **local-only** screenshots:

- [Fixture policy, source and deadline](plan-b-sprint41/local-browser/02-policy-eligible.png)
- [Persisted verification](plan-b-sprint41/local-browser/04-fixture-verified-investigating.png)
- [Approved, not reimbursed](plan-b-sprint41/local-browser/06-approved-not-reimbursed.png)
- [Human denial](plan-b-sprint41/local-browser/13-human-denial.png)
- [Contradictory evidence under REVIEW](plan-b-sprint41/local-browser/08-review-contradictory-evidence.png)
- [Unavailable/inconsistent source](plan-b-sprint41/local-browser/12-stale-policy-eligibility.png)

## Isolation proof and its limits

| Boundary | Implemented and tested | Remaining hosted proof |
| --- | --- | --- |
| Database/volume | Candidate-specific filename and matching volume marker; wrong markers, escaping symlinks and hard links rejected. Fixture startup refuses an uninitialized volume. Wrong-volume entrypoint tests show no marker, directory, backup or data mutation. | Actual new volume ID/attachment, filesystem mount inventory and absence of Plan A data/mounts. |
| Platform scope | Fixture public-beta requires project/environment/service/volume UUIDs and rejects all four known Plan A IDs. The Plan A project itself is excluded, requiring a separate project. | Read-back of truthful platform IDs, separate project/network scope, account access and no production references/shared variables. Environment strings alone cannot attest to Railway permissions. |
| Credentials/sessions | Fresh local role/gate/rate credentials generated in memory; distinct values required. Candidate epoch binds sessions. Foreign gate and session rejected. Unknown credential variables, Railway tokens, external DB credentials and signer variables rejected. Three exact Next-generated encryption/preview variables are recognized. | Fresh generation/provisioning records and sealed-variable inventory. A production credential deliberately placed under an allowed app variable name is not detectable by name validation. No production secret values were read for comparison. |
| Image/files | Docker ignore rules additionally exclude local cloud/SSH/agent directories and PEM/key files; runtime rejects financial signer variables. | Clean upload context, exact built image/digest, build-variable and filesystem secret scan, no unintended mounts, no external signer or production egress access. No Docker image was built/inspected here. |
| Source | Pinned embedded source, dedicated fixture scope, immutable snapshot, fixed deadline, no RPC fallback, no live worker. | Candidate runtime source/digest, expiry behavior and startup timing on the actual platform. |
| Settlement | Fixture API/module/UI guards plus unchanged production synthetic preparation prohibition; no settlement-pending/paid cases. | Hosted read-back of configuration, absence of signer access and inability to reach production financial authorities. |

These tests prove application rejection rules and a disposable local process's configuration. They
do **not** prove OS/network isolation for a future host, nor do they infer credential independence
from a different variable name. The fresh local process received only a small environment allowlist,
used a new database and never loaded Plan A credentials or financial signing keys. Its ephemeral
unfunded wallet identity existed in harness memory solely for nonce authentication.

The source, checkpoint and label blockers are resolved in code. The table's platform/image evidence
must be collected before a hosted isolation gate can pass. Do not turn a software test pass into
permission to provision/deploy or a claim that production resources are inaccessible.

## Validation

| Scope | Result / evidence |
| --- | --- |
| `pnpm test` | **333 passed**, including 133 web/API tests and 19 persistence tests; [log](plan-b-sprint41/workspace-tests.txt) |
| New source/API tests | **34 tests** within that total: source pinning, expiry, inconsistent state, source-switch refusal, hosted config, forbidden credentials, Plan A IDs, storage escapes, foreign authentication and financial/API client guards |
| `pnpm test:contracts` | **46 passed**, 0 failed/skipped; [log](plan-b-sprint41/contracts.txt) |
| Entrypoint/supervisor state | **7 passed**, including 3 new candidate isolation cases; [log](plan-b-sprint41/reconciliation-state.txt) |
| Actual initializer CLI | **6 passed**: fresh initialization, reseed refusal, live-RPC rejection, Plan A volume exclusion, signer rejection and foreign-volume protection; [log](plan-b-sprint41/initializer.txt) |
| `pnpm lint`, `pnpm typecheck` | Passed; [lint](plan-b-sprint41/lint.txt), [types](plan-b-sprint41/typecheck.txt) |
| Optimized production web build | Passed, with workspace typecheck above; [build](plan-b-sprint41/build.txt) |
| Real local browser/application acceptance | **42 passed**, 3 real Next process restarts; [results](plan-b-sprint41/local-browser/results.json) |
| Existing mocked UI regression | **33 passed**, 0 failed/waived; [log](plan-b-sprint41/mocked-regression.txt) |
| Existing mocked adjudication | **6 passed**; [results](plan-b-sprint41/mocked-adjudication.json) |
| `git diff --check` | Passed |

Node `v24.16.0`, pnpm `11.20.0`, installed Foundry and Chrome were used locally. The production
Dockerfile remains Node 22; no claim of tested Railway/Node-22 image execution is made.

The real browser run exercised signed nonce authentication, secure HttpOnly sessions, policy source
labels, intake, server verification, evidence/provenance, human approval and denial, REVIEW paths,
ownership/role rejection, expired reviewer sessions, inconsistent source and blocked settlement.
The first restart preserved the same authenticated session, policy and checkpoint. A second restart
retained the approved claim, verification and audit history through the real HTTP API. A third
retained recovery hold: mutations were rejected and readiness remained 503. Separate tests reopened
an exact consistent SQLite backup, confirmed the same pin/checkpoint and rejected an expired restore.

Final database: **1 APPROVED, 1 DENIED, 4 REVIEW**, six verification records, zero
SETTLEMENT_PENDING/PAID, thirteen migration records, integrity `ok`, no foreign-key violations.
APPROVED remains proposed 1 USDC with pending authority, never reimbursement. The runner closed
browsers/processes and removed only its temporary database after exporting non-secret evidence.

The mocked suites ran in a **different process/database**, explicitly live-mode UI with unavailable
localhost RPC endpoints and mocked HTTP responses. They are compatibility checks, not source or
blockchain evidence. The fixture run had neither a fixture RPC server nor a live RPC source.

Earlier browser diagnostics are preserved in
[`docs/working-notes/plan-b-sprint41/diagnostics`](../working-notes/plan-b-sprint41/diagnostics).
They exposed Next framework-key false positives and an earlier financial guard returning a different
blocked response; the final runtime recognizes the exact framework variables and explicitly rejects
fixture finance at the authenticated API boundary. A mocked-suite attempt overlapping a build exited
before checks and was rerun successfully after the build. These earlier runs are not counted as passes.

## Migration 011 and recovery compatibility

[Source comparison](plan-b-sprint41/migration-compatibility.json) confirms all thirteen default
migration files unchanged: twelve through 010 match exact Plan A; 011 matches Sprint 4/Sprint 3
and retains SHA-256 `806951cc73865afcfd6d128866021f79f3bec1369568796c8acbb850068fb5f9`.
The populated twelve-migration upgrade test migrates twice, preserves existing records, rejects
verification mutation/deletion/duplication/orphans, preserves frozen claim identity and checks
integrity/foreign keys. Product registry and fixture storage remain opt-in; no competing indexer
migration was introduced. No Plan A database or backup was opened or migrated.

Reproduce the new real browser run after building:

```sh
PLAYWRIGHT_MODULE=<absolute-path-to-playwright/index.mjs> \
  pnpm --filter @arcuex/onchain exec tsx ../../apps/web/scripts/sprint41-local-acceptance.mts
```

The [fixture runbook](../deployments/plan-b-fixture-source.md) covers explicit initialization,
read-only backup validation, marker/digest preservation, recovery hold, fixed expiry and authorized
candidate-only cleanup. No production restore, fixture deadline renewal or synthetic settlement
override is part of recovery.

The [initializer validation harness](../working-notes/plan-b-sprint41/validate-initializer.mjs)
executes the real CLI with memory-only test credentials. Rejected invocations preserve the original
database fingerprint, and a simulated foreign volume marker remains untouched. These are local
sentinels, not probes against production data.

## Plan A preservation

[Initial](plan-b-sprint41/plan-a-before.json) and [final](plan-b-sprint41/plan-a-after.json)
Railway reads match: deployment `88f62d34-0dd9-4d66-9630-1e3491b54b8d` remains SUCCESS; no
new deployment or staged changes. The known service, environment, volume, mount, domain, start
command, one replica and zero overlap remain unchanged. Only variable names were inspected.
Exact preserved Plan A source remains `f8365a85f0c4a6298f713be7e799cb7538ca1fc7` and its fallback
tag; this is unchanged platform metadata tied to the prior source attestation, not a fresh binary
or production-data attestation.

Sprint 4 `4b695cc` was pushed to `release/plan-b-sprint4-candidate` as requested. Sprint 4.1 is on
its own candidate branch. Canonical main and the Plan A fallback were not advanced. There were
**zero Railway mutations, production-data operations, live policy binds, payments or broadcasts**.
