# Plan B Sprint 4: release candidate and closed hosting gate

Verified November 18, 2026, America/Indiana/Indianapolis (artifacts use UTC).
**Hosted decision: NO-GO. No candidate was provisioned or deployed.** The user authorized a
disposable candidate conditional on proven isolation; that condition remains unsatisfied. This
is a technical hosting/source blocker, not a request for another deployment approval.

## Source integration and review

Branch: `release/plan-b-sprint4-candidate`. Integration commit:
`6a600a50890c3d3aac4455addef5594212e488ed`.

`git fetch origin main` succeeded. Current local canonical main was
`543b8e5bc11e8d3098c2c3a05a7a3114ceb76ac2`; remote main remained `42e2c22`.
Created the candidate from local main and merged Sprint 3 `202fa54` with a merge commit.
Neither main nor remote branches were advanced. Nothing was pushed.

Reviewed both Sprint 3 commits: `bf717bf` changes intake and claim-detail UX; `202fa54` adds
the real-route local runner, screenshots, validation and hosting prerequisites. The form obtains
the catalog bytes from the authenticated detail route and retains a link to a partially created
case after failure. Reviewer controls require persisted verification and explicit human rationale;
authority preparation is separately gated and disabled for synthetic cases. The backend remains
authoritative. No contract, ABI, settlement executor or Railway deployment configuration changed.
The subsequent Sprint 4 changes add a read-only preflight script, stronger migration assertions
and this evidence; they do not add a hosted fixture adapter or relax runtime controls.

## Isolation proof and deployment decision

| Requirement | Evidence / disposition |
| --- | --- |
| Own hosted database and persistent storage | **Unproven / not provisioned.** No candidate project/environment/service/volume/domain IDs exist. Plan A IDs were identified and excluded. Local regression used a new temporary SQLite directory, never Plan A data. |
| Distinct credentials, sessions and gate | **Hosted unproven.** Runtime validation requires distinct server credentials, secure cookies, session epoch and public-beta acceptance gate. Local runner uses fresh tokens/session storage but `local-test`, without the hosted acceptance gate. This is not hosted credential-isolation proof. |
| No shared production signer or authority token | No production credentials were read, copied or used. Public RPC preflight loads no keys. Local runner creates new role tokens and an unfunded nonce-signing identity in memory. Hosted absence cannot be attested without a candidate variable/image inventory. |
| Explicit fixture versus live RPC | **FAIL.** The only complete journey fixture is an embedded localhost HTTP server, not a deployable isolated HTTPS source. `public-beta` rejects its HTTP configuration. There is no reviewed hosted seed/reset or fixture-source mode. |
| Clear synthetic evidence labeling | Claim fixtures and proposed amounts are labeled synthetic, but **hosted fixture labeling fails** at policy/reconciliation surfaces: `/policies/[id]` says “Confirmed means bind receipt verified” and the list describes “confirmed on-chain binds.” The local harness seeds fake bind/block references into those states. Report-level caveats do not fix hosted UI provenance. |
| Cannot initiate production synthetic settlements | Source/regression **PASS**: production validation rejects synthetic preparation override; the authenticated authority attempt remains blocked; final local database has zero SETTLEMENT_PENDING/PAID cases. No hosted network/credential isolation is claimed. |
| Safe migrations, recovery and cleanup | Source upgrade/constraints **PASS** on disposable databases. Existing entrypoint checks volume marker and backs up before opening DB; Docker includes SQLite backup tooling. Hosted mount, restart/persistence, restore and cleanup are **unproven**. |

The fixture runner directly seeds reconciliation health and can change its timestamp for tests.
The real supervisor's reconciliation worker needs actual canonical logs/blocks and durable cursors;
the minimal fixture cannot supply that lifecycle. Refreshing seeded timestamps would misrepresent
freshness. Turning on the real worker against this fixture or pointing live RPC at a fake policy
does not resolve the problem. No such workaround was used.

To unblock the already authorized disposable hosting scope, implement and review a bounded,
read-only hosted fixture source and candidate-only seed/reset path, carry fixture provenance into
policy/reconciliation UI and API results, and test checkpoint expiry, restart and persistence without
manufacturing live confirmation. Reject transaction/signing RPC methods. Keep fixture credentials,
session epoch and data distinct; prevent public fixture mode from targeting a production store.
Then create an empty candidate environment (never clone Plan A), new service and volume, record
and compare all IDs, generate fresh gate/operator/rate secrets, inventory the exact image and
variables for signer absence, disable automatic deployment and retain production settlement blocks.
The [candidate runbook](../deployments/plan-b-disposable-candidate.md) remains the configuration baseline.

Recovery must stop candidate writers, preserve a consistent candidate-only backup, and validate
integrity, foreign keys and volume identity on a separate copy before any restore. A code rollback
must not restore historical Plan A data. Teardown must target only recorded candidate resource IDs,
preserve dated evidence first, and follow the runbook's separate teardown authorization. No hosted
cleanup was needed because no resources were created. Local runner stopped its processes and
deleted its temporary database after exporting non-secret evidence.

## Migration 011 compatibility

All twelve migration files through 010 match exact Plan A byte-for-byte. Migration
`011_claim_verifications.sql` matches Sprint 1 and Sprint 3, SHA-256
`806951cc73865afcfd6d128866021f79f3bec1369568796c8acbb850068fb5f9`.
See [source comparison](plan-b-sprint4/migration-source-compatibility.json).

The existing upgrade test applies the real migrator twice to populated twelve-migration history,
preserves policy/incident/case/audit/capital/settlement/reconciliation rows, and expects thirteen
records. Sprint 4 strengthens it with duplicate-request rejection, orphan-verification rejection,
update/delete rejection for verification records, frozen claim identity and integrity checks.
All 19 persistence tests passed after this change. The competing `011_policy_indexer.sql` remains
excluded and product publication tables remain opt-in. No production database or backup was opened;
this is schema compatibility evidence, not validation of a current production data snapshot.

## Regression and browser evidence

| Command / scope | Result |
| --- | --- |
| `pnpm test` | **299 passed**, 8 packages/apps; [log](plan-b-sprint4/workspace-tests.txt) |
| `pnpm test:contracts` | **46 passed**, 0 failed/skipped; [log](plan-b-sprint4/contracts.txt) |
| `pnpm lint` | Passed; [log](plan-b-sprint4/lint.txt) |
| `pnpm typecheck` | Passed; [log](plan-b-sprint4/typecheck.txt) |
| `pnpm build` | Passed; [log](plan-b-sprint4/build.txt) |
| Persistence tests after stronger migration assertions | **19 passed**; [log](plan-b-sprint4/migration-constraints-tests.txt) |
| Persistence lint/typecheck after those assertions | Passed; [lint](plan-b-sprint4/migration-lint.txt), [types](plan-b-sprint4/migration-typecheck.txt) |
| Real-route local browser acceptance | **32 passed**, completed; [results](plan-b-sprint4/local-browser/results.json) |
| Mocked browser regression | **33 passed**, 0 failed/waived; [log](plan-b-sprint4/local-browser/mocked-regression.txt) |
| Mocked adjudication checks | **6 passed**; [results](plan-b-sprint4/local-browser/mocked-adjudication.json) |
| `git diff --check` | Passed |

Local validation used Node `v24.16.0`, pnpm `11.20.0`, Foundry and installed Chrome. The production
Dockerfile pins Node 22; an image build/runtime on Railway was not performed.

The local runner used the optimized production Next app, real wallet nonce/signature/session routes,
separate reviewer/authority contexts, real server verification and persisted evidence/audit events.
Only chain reads and seeded chain/checkpoint state were synthetic. It tested ownership/role rejection,
missing and contradictory evidence, unresolved recoveries, stale context/checkpoint, expired sessions,
repeated-decision rejection and forbidden synthetic settlement preparation. Final state: one APPROVED,
four REVIEW, five verification records, zero settlement-pending/paid; SQLite integrity `ok`, foreign
keys empty, thirteen migration records. APPROVED remains proposed 1 USDC/pending authority.

Selected **local-only** screenshots:

- [Seeded policy and eligibility](plan-b-sprint4/local-browser/02-policy-eligible.png)
- [Intake](plan-b-sprint4/local-browser/03-incident-intake.png)
- [Persisted fixture verification](plan-b-sprint4/local-browser/04-fixture-verified-investigating.png)
- [Approval without reimbursement](plan-b-sprint4/local-browser/06-approved-not-reimbursed.png)
- [Contradictory evidence under review](plan-b-sprint4/local-browser/08-review-contradictory-evidence.png)
- [Expired reviewer session](plan-b-sprint4/local-browser/11-expired-reviewer-session.png)

**Hosted browser acceptance: NOT RUN. Hosted screenshots: NONE.** Local screenshots do not prove
hosted gate/TLS/storage behavior or live blockchain confirmation. The rerun does not add a dedicated
human DENIED journey; that action, persisted rejection rationale, full navigation and restart durability
must be explicitly exercised in eventual hosted acceptance along with the rest of the requested matrix.

## Read-only financial readiness

At `2026-11-19T01:46:24Z` (November 18 locally), public Arc RPC returned chain `5042002`,
block `72943977`, pool `0x6657974EEdF488380251bDD95A7FFfb0D456E49E`, nonempty bytecode,
USDC `0x3600000000000000000000000000000000000000`, six decimals. All pool/asset reads
were pinned to that block. [Complete snapshot](plan-b-sprint4/arc-readonly.json).

- Assets and actual pool USDC balance: **4.11 USDC**.
- Reserved: **2.00 USDC**; available capital: **2.11 USDC**.
- `assertSolvent` read succeeded; assets cover reservation and available capital matches accounting.
- Owner: `0x2E2Da4311Ea87Cfa31c372D59B4A0d567c15D760`.
- Claims authority: `0xA6876A60748c638f66b911aaEe03Bd712D85AF36`.
- Fee recipient: `0x69797270A2b8B355D55676787a29D2B1057411C7`.

The [read-only script](../../apps/web/scripts/sprint4-readonly-preflight.mts) hardcodes the public
repository RPC/manifest, creates only a public client, loads no signer or application database,
and performs no broadcast. Reproduce with:

```sh
pnpm --filter @arcuex/onchain exec tsx ../../apps/web/scripts/sprint4-readonly-preflight.mts
```

These are point-in-time reads, not reserved capacity for a rehearsal or evidence of signer access.
A separately authorized fresh-policy-to-payout rehearsal still needs:

1. An isolated approved financial rehearsal configuration. Current production synthetic preparation
   remains prohibited; this sprint changes no restriction and authorizes no payout.
2. Confirmed operator-controlled LP/policyholder/authority wallets and authority matching the latest
   pool read. An API authority token grants no financial signing capability. Signer availability and
   gas/USDC balances/allowances were not inspected; no private keys were loaded or requested.
3. A fresh quote/policy with exact immutable terms/beneficiary, premium funding/allowance and enough
   newly checked available capital for its limit. The 2.11 USDC snapshot does not guarantee later capacity.
4. Explicit per-transaction authorization for any necessary USDC approval, LP deposit, policy bind
   and eventual claim settlement. No live policies were created here.
5. Independently reconciled genuine bind receipt, healthy candidate checkpoint, original coverage
   start/end, remaining reservation and same-loss commitments. No fresh policy was selected; there
   is no approved deadline in this report. The contract requires settlement no later than the original
   `coverageEnd` (exact end permitted; one second late rejected).
6. Persisted verification plus human contractual decision and resolved recoveries, frozen claimId,
   policyId, beneficiary, amount, evidenceRoot, economic lossKey and immutable lossCap; fresh unsettled
   claim/loss/policy checks and capacity/window simulation before explicit wallet approval.
7. Independent matching receipt reconciliation before showing reimbursement; approval/calldata alone
   cannot justify PAID. Fixture economic evidence remains synthetic and cannot authenticate real loss.

## Explicit Plan A preservation check

[Before](plan-b-sprint4/plan-a-before.json) and [after](plan-b-sprint4/plan-a-after.json) platform
reads match exactly: deployment `88f62d34-0dd9-4d66-9630-1e3491b54b8d` is SUCCESS; no new
deployment and no staged change. Project/environment/service remain
`03848637-de2d-497f-8308-f8f3ccf06f07` / `6dca510e-fe00-4478-8d8d-ef65fd5bc4d7` /
`1280c69e-abbc-4d06-8ecc-93bf4a6ed226`; volume
`b92846ec-9a00-40b6-80a9-bc9dce1e69a2` remains mounted at `/data`, one replica, zero overlap,
same supervisor/start command and port 8080 domain. Variable names were read; secret values were not.

The preserved source remains exact `f8365a85f0c4a6298f713be7e799cb7538ca1fc7`, with fallback tag
`fallback/nov20-plan-a-f8365a8`. This is unchanged platform metadata tied to historical source
attestation; no fresh runtime binary attestation or production data inspection is claimed.
There were **zero Railway mutations, zero production data operations and zero financial broadcasts**.
No promotion, restore, settlement override or payout was attempted.
