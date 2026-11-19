# Canonical main and Plan A recovery

Verified November 18, 2026. Repository consolidation is local source work, not deployment approval.
`main` is the canonical development and eventual deployment branch. Plan B Sprint 2 source
integration is now authorized; deployment and live financial operations remain separately gated.
See the [Sprint 2 validation and readiness report](../verification/plan-b-sprint2.md).

## Current hosted fallback

- Source: `f8365a85f0c4a6298f713be7e799cb7538ca1fc7`.
- Tree: `582b367e95406ee33a68a8792965ae886f18c751`.
- Tag: `fallback/nov20-plan-a-f8365a8`.
- Deployment: `88f62d34-0dd9-4d66-9630-1e3491b54b8d`, observed SUCCESS.
- Project/environment/service: `03848637-de2d-497f-8308-f8f3ccf06f07` /
  `6dca510e-fe00-4478-8d8d-ef65fd5bc4d7` / `1280c69e-abbc-4d06-8ecc-93bf4a6ed226`.
- Volume: `b92846ec-9a00-40b6-80a9-bc9dce1e69a2` at `/data`, one replica,
  us-west2; domain targets port 8080. Start command is
  `/entrypoint.sh node /app/deploy/railway/supervisor.cjs`.

The Railway service inspection during consolidation showed SUCCESS and no staged service changes.
The prior runtime read returned `ARCUEX_GIT_SHA=f8365a8`; the preserved hosted acceptance report
also contains 289 runtime source/config hash comparisons. Platform metadata alone is not binary
attestation. No Railway settings, production database or contract were changed by consolidation.

Keep the gate, TLS/origin checks, server-only distinct credentials, pinned chain/pool, secure cookies,
volume identity, session epoch and `CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP=0`. Do not copy these
credentials into Git, reports, shell arguments or Docker context.

## Future deployment workflow — requires separate approval

1. Review the exact `main` commit and its validation report. Use a clean checkout of that SHA.
   A push or successful CI run does not authorize deployment. Inspect service source/automatic
   deployment settings before any future push intended to publish a candidate.
2. Preserve the running deployment and source tag. Take a new consistent SQLite backup using
   the existing runbook; validate a separate copy, volume identity, integrity and foreign keys.
   Account for all writes since the historical acceptance snapshots, including the new bound policy.
3. Verify the candidate migration list against the deployed twelve migrations through 010.
   Consolidation retains them byte-for-byte. Sprint 2 adds default migration
   `011_claim_verifications.sql` (append-only verification records); it has only been applied to
   isolated local/test databases. The competing preserved `011_policy_indexer.sql` is excluded.
   Validate the actual deployed backup against this additive migration before any authorized upgrade.
   Product registry tables are opt-in and must not be
   initialized in production as a side effect of deploying this source.
4. After explicit approval, use the documented Docker upload path in
   [the operational runbook](nov20-readonly-reconciliation.md). The service reports a Railpack
   default despite the successful Docker upload; do not assume platform redeploy uses the same
   builder. Preserve the existing volume, supervisor command, port 8080 and single-replica settings.
5. Observe SUCCESS for the specific deployment, verify source hashes, gated readiness, actual
   checkpoint health/freshness, cursor continuity, policy/claims regression and browser acceptance.
   `/api/health/ready` alone does not establish indexer freshness. Do not broadcast as a smoke test.

## Exact source recovery, without rewriting shared history

Recover Plan A into a new worktree without touching `main` or Railway:

```sh
git worktree add --detach .worktrees/plan-a-recovery fallback/nov20-plan-a-f8365a8
git -C .worktrees/plan-a-recovery rev-parse HEAD 'HEAD^{tree}'
```

Expected commit/tree are listed above. Use a new unused path if that worktree already exists.
The existing `nov20-railway-release` worktree is also retained intact at the same commit.

Recover original pre-consolidation source:

```sh
git worktree add -b recovery/original-main .worktrees/original-main backup/main-before-consolidation-2026-11-18
```

Original main is `d9d47a505f6438c6c40a72502f28a32228151705`. If the repository itself must
return to that tree, make a reviewed forward commit on a new rollback branch; never reset/force-push:

```sh
git worktree add -b rollback/main-consolidation .worktrees/main-rollback main
cd .worktrees/main-rollback
git restore --source=backup/main-before-consolidation-2026-11-18 --staged --worktree -- .
git diff --cached --stat
git commit -m "revert: restore pre-consolidation main source"
```

Review and normally merge that rollback branch if desired. This old tree predates the deployed
claims controls and is **not a Railway deployment fallback**.

## Recover local work and refs

Private recovery directory: `.recovery/2026-11-18-consolidation/` (directory 0700, archives 0600).
It is ignored by Git and Docker; it can contain credentials/databases and must not be published.
`before.json` maps worktrees to archives, content hashes, original HEAD/tree/status and patches.
All archive members were read back and hash-verified. Dependency/build caches were excluded;
local Foundry libraries, environment files, databases and synthetic artifacts were preserved.

```sh
git bundle verify .recovery/2026-11-18-consolidation/all-refs.bundle
git bundle list-heads .recovery/2026-11-18-consolidation/all-refs.bundle
```

Restore a deleted branch from its `archive/2026-11-18/<original-branch>` tag with
`git branch <original-branch> archive/2026-11-18/<original-branch>`.
To recover dirty files, create a separate worktree at the matching recorded HEAD, inspect the
matching tar/patch, then extract/apply there. Never overwrite a currently dirty worktree. Recovery
archives are local; archival tags/bundle are not a remote backup unless explicitly copied/pushed.

## Railway rollback boundary

No hosted rollback is needed now: Plan A is still running. After a future approved main deployment,
return to exact Plan A source using the same reviewed Docker upload procedure and preserved runtime
configuration, then repeat source/data/auth/indexer checks. Do not run it during consolidation.
Consolidation itself added no startup migrations. Sprint 2 subsequently adds verification storage;
review that migration separately before any deployment or rollback.

Do not restore an old SQLite backup just to roll back code. Historical preupgrade snapshots predate
later wallet/policy writes. Any database restore requires separate authorization, stopped writers,
a preserved current snapshot, isolated validation and reconciliation of post-backup transactions.
The older `fb6fe5d` release is not an acceptable code-only fallback for current claims eligibility.
The `8d5fdaa` degraded-mode fallback and its different startup command are documented separately
in the operational runbook; prefer the complete `f8365a8` Plan A.

Historical evidence: [hosted acceptance](../verification/2026-11-18-combined-railway-hosted.md),
[platform compatibility](../architecture/platform-foundation-compatibility.md), and
[consolidation inventory/results](../verification/2026-11-18-repository-consolidation.md).
