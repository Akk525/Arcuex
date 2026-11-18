# Repository reconciliation — November 18, 2026

**Result: local main consolidated and validated; stop before deployment.** Plan A remains
unchanged on Railway. No production data access/mutation, financial broadcast, contract change,
synthetic settlement bypass, remote push, force push or shared-history rewrite occurred.

## Source identities and preserved recovery points

- Original main/origin/main: `d9d47a505f6438c6c40a72502f28a32228151705`.
- Original main backup: `backup/main-before-consolidation-2026-11-18`.
- Deployed Plan A: `f8365a85f0c4a6298f713be7e799cb7538ca1fc7`, tree
  `582b367e95406ee33a68a8792965ae886f18c751`, tag `fallback/nov20-plan-a-f8365a8`.
- Tested consolidated implementation checkpoint: `f697cdc` (full hash in inventory).
  Later consolidation changes are documentation, ignore rules and CI dependency/test wiring only.
- Final main is identified by the immutable local tag `consolidated/nov20-main-2026-11-18`.
  Resolve with `git rev-parse main consolidated/nov20-main-2026-11-18`; the final handoff supplies
  the exact commit. A report cannot embed its own containing commit hash without changing it.
- Every original local branch has an `archive/2026-11-18/<branch>` tag. Platform history is
  preserved at `archive/2026-11-18/feat/platform-foundation` (`5523b01`) and in main ancestry.
- A verified `all-refs.bundle`, original tracked/index patches, private local-file archives and
  exact original HEAD/tree/status/file hashes are under `.recovery/2026-11-18-consolidation/`.
  Archive content was read back and SHA-256 checked before main moved. These are local backups;
  no remote backup or publication is implied. A retained stash also preserves the original
  `.gitignore` edit, whose `.worktrees/` rule is incorporated in main.

Full before hashes/status/upstreams: [inventory-before.json](../working-notes/repository-consolidation-2026-11-18/inventory-before.json).
Branch ancestry and unmerged commits: [branch-reconciliation.json](../working-notes/repository-consolidation-2026-11-18/branch-reconciliation.json).
Recovery refs: [recovery-refs.json](../working-notes/repository-consolidation-2026-11-18/recovery-refs.json).

## Branch/worktree reconciliation matrix

There were 14 local branches, three remote-tracking branches plus origin/HEAD, and 11 worktree
registrations (ten existing directories and one missing/prunable registration). `git fetch origin`
completed; remote tips were unchanged. No branch had an upstream ahead of the fetched remote.
All local branches except main/research had no configured upstream.

| Original branch / worktree suffix | Original tip | Assessment / unique work | Final disposition |
| --- | --- | --- | --- |
| main / repository root | d9d47a5 | 73 commits behind deployed integration; local gitignore and acceptance artifacts | Canonical main; local evidence reviewed/preserved |
| feat/onchain-lifecycle / no worktree | c30a29c | Entire feature history already in f8365a8 | Obsolete local branch removed; tagged/bundled |
| feat/claims-workflow / claims-workflow | d627a7e | Already integrated; local ignored SQLite remains | Branch/worktree retained as historical recovery, no new development |
| integration/procurement-claims / onchain-lifecycle | 9f8d473 | Already integrated; local data and cached contract libraries | Branch/worktree retained |
| feat/launch-infrastructure / no worktree | 334472c | Already integrated | Obsolete local branch removed; tagged/bundled |
| release/nov20-arc-testnet-beta / no worktree | fb6fe5d | Superseded by reconciliation/UI/supervision; unsafe old claims fallback | Obsolete local branch removed; historical tag retained |
| backend/nov20-policy-reconciliation / policy-reconciliation | f579aef | Already integrated; local ignored database | Branch/worktree retained |
| integration/nov20-private-acceptance / nov20-integration | ebbdeca | Committed tree exactly equals f579aef; one redundant merge commit; 16 dirty paths add alternate indexer/migration 011 | Excluded; entire branch, dirty worktree, patch and files preserved |
| ui/nov20-product-experience / launch-infrastructure | 9e36062 | Already integrated; seven untracked acceptance artifacts | Branch/worktree retained; artifacts archived |
| integration/nov20-combined-acceptance / nov20-final-integration | 8d5fdaa | Already integrated; ignored local database/libraries | Branch/worktree retained |
| docs/platform-architecture-roadmap / no worktree | f8365a8 | Same commit as deployed source despite branch name | Obsolete local branch removed; exact fallback tag retained |
| detached / nov20-railway-release | f8365a8 | Exact deployed fallback, clean | Kept intact |
| deploy/nov20-combined-private / nov20-railway-ops | b7243bf | One documentation/evidence commit above deployed source; 11 untracked preflight artifacts | Committed history merged; dirty worktree retained |
| feat/platform-foundation / platform-architecture | 5523b01 | Five additive implementation/documentation commits above deployed source; local synthetic dossier artifacts | Merged after compatibility check; branch/worktree retained for specimen/history |
| research/coverage-wedges / missing /private/tmp worktree | 99ba72a | Seven isolated research/evaluator/evidence commits above original main | Merged; branch and missing registration retained because lost-directory local state cannot be established |

Remote `origin/main=d9d47a5`, `origin/feat/onchain-lifecycle=c5cd550` and
`origin/research/coverage-wedges=99ba72a` were retained unchanged. Remote feature/research commits
are ancestors of consolidated main. Local consolidation is ready for source review; **origin/main
has not been updated**. No remote branch deletion, deployment-source connection or automatic
deployment setting was changed. Before publishing source, review repository automation and the
Railway source configuration; source publication is not an instruction to deploy.

After cleanup: ten local branches, the same remote refs, and the same 11 worktree registrations.
The four removed branch names have no worktree and were ancestry-verified and backed up first.
No worktree was removed: existing nonfallback worktrees contain private databases, local artifacts,
dirty files or unresolved local state. They are retained recovery material, not competing canonical
development branches. [After inventory](../working-notes/repository-consolidation-2026-11-18/inventory-after.json).

## Integration decisions

Main fast-forwarded through the tested integration history to f8365a8; overlapping claims,
procurement, UI and reconciliation branches were not blindly replayed. Then:

1. `160751c` merges b7243bf's hosted acceptance/recovery documentation.
2. `16be3cf` merges platform tip 5523b01, preserving A1 `5e1fd06`, A3 `316d060`,
   A2 `f653ee9`, A4 `9e981f2` and the compatibility report. The only conflict was README;
   both hosted acceptance and additive platform documentation were retained.
3. `f697cdc` merges research tip 99ba72a. All additions are under docs/research; its nested EVM
   dependency/lockfile remains isolated from the application workspace. Research does not become
   an oracle or financial authorization path.
4. The final documentation/hygiene commit identifies canonical main, preserves dated acceptance
   evidence, adds this inventory/recovery runbook, excludes private recovery/browser material from
   Git/Docker, pins CI Solidity dependencies to existing lockfile revisions and runs supervisor tests.

### Compatibility boundaries verified

- Existing synthetic Policy and Arc ProcurementPolicy remain distinct; no third issued-policy table.
- Historical 1 USDC policy UUID, onchain ID, terms digest and bind calldata have golden regressions.
- App runtime, contracts/source/ABI, claims math/services, sessions/delegations, reconciliation,
  deployment supervisor, Dockerfile, railway.toml and all twelve startup migrations remain
  byte-identical to f8365a8. Scoped agent instructions and contract README changed, not their runtime.
- New product SHA-256 envelopes do not replace existing keccak terms digests. Product publication
  persistence is explicit opt-in, not default startup migration. Temporary acceptance DB confirms
  registry tables were not created.
- Product authors/approvers/publishers gain no policy, claims or financial authority. The synthetic
  bank examiner remains read-only; no reserve, binding, denial, rescission, settlement or payment.
- Existing REVIEW/unknown recoveries, owner eligibility, frozen settlement binding, canonical loss
  identity, claimsAuthority, synthetic-preparation restriction and verified-receipt boundaries remain.

### Intentionally excluded

The dirty alternate indexer introduces `011_policy_indexer.sql`, a worker lease/cursor model,
changed eligibility/read projections and a competing entrypoint supervisor. It is not safely
interchangeable with the deployed JSON cursor/watchdog without a separate migration, handoff and
restart/reorg acceptance plan. No such production migration was authorized. Its original worktree,
all 16 dirty paths and private hash-verified archive remain intact. No unique implementation is lost.
The redundant ebbdeca merge commit has no unique committed tree content; it remains archived.
No Plan B implementation, new runtime platform feature or financial bypass was added.

## Validation and comparison

Node 24.16.0, pnpm 11.20.0, Foundry 1.9.0; local Chrome/Playwright. Existing deployed image remains
Node 22.23.5. Optional research TypeScript execution requires Node 24; it is outside app runtime.
Prior baseline: 228 workspace tests + 22 contracts, 33 mocked UI scenarios and 40 gated hosted
assertions. Platform baseline: 254 workspace tests + 22 contracts. Preserved old reports were not
rewritten to imply fresh hosted acceptance.

| Check | Result |
| --- | --- |
| Frozen workspace install / supply-chain policies | PASS; lockfile unchanged, 714 entries verified |
| Workspace tests | 254/254 PASS (domain 25, chain 5, persistence 18, QuickNode 9, onchain 47, insurance 48, SDK 12, web 90) |
| Default migrations / product publication tests | Included: persistence 18/18; prior preservation/rollback/upgrade and new opt-in registry invariants |
| Claims, policy, auth, authority/security regressions | Included in full 254; no test removed or weakened |
| Foundry | 22/22 PASS, including 256-run accounting fuzz; no deployed contract change |
| Fresh pinned Solidity dependency install | PASS in separate temporary directory; lockfile and representative source hashes match tested libraries |
| Typecheck / lint | PASS / PASS, zero lint warnings |
| Production build | PASS; existing Next ESLint plugin-detection advisory remains |
| Supervisor cursor state | 4/4 PASS |
| Research evaluator/verifier | 86/86 PASS |
| Research artifact integrity | 14/14 hashes match; integrity does not establish consensus authenticity |
| Offline EVM regression / replay | 5/5 PASS; read-only replay --check PASS, no captured witness overwritten |
| Platform synthetic bank example | PASS; 1,800 cases, 1,350 recorded human overrides, 450 AI denials pending checks; all financial capabilities false |
| Real local production browser/API | 35/35 PASS; fresh temporary SQLite, actual signed-wallet and ops sessions, read-only Arc preflight, no send-capable wallet |
| Mocked browser workflow | 33/33 PASS, zero failures/waivers; mock PAID/receipt labels are presentation tests only |
| Local launch API/security smoke | PASS, including durable SQLite assertion, unauthorized writes and rate limiting |
| Local DB integrity/default schema | integrity ok; zero FK violations; twelve migrations through 010; zero ClaimsCase rows; no platform registry |
| Secret/path scan | No tracked environment/database/private-key files or detected credential literals; raw private archives excluded |
| Original private/dirty-file preservation | Hash check PASS; no unexpected changes |
| Final Railway metadata read | Same SUCCESS deployment, volume/start/port, no staged service changes |

Initial sandbox verification attempts were blocked by pnpm selecting a different store and a
registry DNS restriction. The verified frozen install and checks succeeded outside the sandbox
against the installed store; no lockfile/security policy was relaxed. Local browser runs use
`local-test`, so production acceptance-gate enforcement is covered by unchanged boundary tests and
preserved hosted evidence, not claimed from localhost. The local harness adapts the hosted harness
only to replace seven public-beta gate assertions with two local health assertions (40 → 35).
The platform example's random synthetic signatures produce new hashes: its new summary is saved
as run evidence, while the original committed historical summary was restored unchanged.

Logs, assertions, screenshots, hashes and harness:
[consolidation evidence](../working-notes/repository-consolidation-2026-11-18/evidence/).

## Documentation and repository hygiene

Historical evidence stays at original paths, with this index distinguishing old and fresh runs.
Previously untracked sanitized bind/approval receipts, reconciliation notes and acceptance reports
are preserved in docs/working-notes. The reference DOCX was moved, without alteration, into ignored
`docs/private-reference/`; unsanitized .playwright-mcp captures remain local. Original raw logs and
all local private data remain in restricted archives and their retained worktrees. No secrets or
raw databases were added to commits. Git/Docker ignore recovery archives and private references;
Git also ignores SQLite WAL/SHM files and non-example environment variants.

README, root/scoped developer instructions, documentation index/testing/workflow and the new
deployment runbook now identify main and Plan A accurately. CI installs exact pre-existing Foundry
lock revisions without adding Git submodules and includes the four supervisor-state tests.

## Deployment readiness and exact rollback

**Ready for review of consolidated local main. No implementation regression was found by these
checks. No deployment has been performed or approved.** Current Railway SUCCESS is metadata and
previous hosted evidence, not a new full hosted smoke of main. Repeat approved candidate/volume/
migration/source/gated-browser/indexer acceptance before replacing Plan A.
Remote GitHub CI has not run for this local-only consolidation; it must pass after a reviewed push.

This consolidation does not unblock reimbursement of the November 18 policy: production synthetic
settlement preparation remains disabled, and onchain settlement requires the coverage window to
remain open. It adds no external loss verifier or new claim. Plan B remains unstarted.

Follow the [exact source recovery, forward-only main rollback, private archive recovery and
Railway recovery procedure](../deployments/main-and-plan-a.md). The running Plan A needs no rollback.
Do not restore historical SQLite snapshots that predate the confirmed policy; code rollback and
database restoration are separate decisions. All tags/cleanup are local and remote history is unchanged.
