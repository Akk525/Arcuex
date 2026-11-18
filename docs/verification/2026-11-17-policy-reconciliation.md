# November 20 backend verification

Branch: `backend/nov20-policy-reconciliation` from release `fb6fe5d`.
Core commit: `52817a2`; subsequent API/hardening commit carries this report.
Run date: November 17, 2026 America/Indiana/Indianapolis (November 18 UTC).
Environment: pnpm 11.20.0, Node 24.16.0, isolated local worktree. Dependency install used the
existing offline pnpm store and frozen lockfile; no lockfile/package dependency changes.

## Results

| Check                                                                        | Result                                                                      |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm install --offline --frozen-lockfile`                                   | PASS; native SQLite module built successfully                               |
| `pnpm test`                                                                  | PASS, 224 tests across all 8 tested packages/apps                           |
| `pnpm --filter @arcuex/web test` after final lifecycle provenance adjustment | PASS, 87 tests                                                              |
| `pnpm typecheck`                                                             | PASS, exit 0                                                                |
| `pnpm lint`                                                                  | PASS, exit 0, zero warnings                                                 |
| `pnpm build`                                                                 | PASS, exit 0; new session/lifecycle/reconciliation API routes generated     |
| `git diff --check`                                                           | PASS                                                                        |
| Fresh and existing migration histories                                       | PASS, 8 migration tests within the 12 persistence tests                     |
| Read-only recent Arc RPC scan and repeated scan                              | PASS; no bind events in sampled recent range                                |
| Read-only historical policy discovery and repeated import                    | PASS; one real event, one durable in-memory observation, `ONCHAIN_UNLINKED` |

Suite totals: domain 15, chain 5, persistence 12, QuickNode 9, onchain 47, insurance 39,
agent SDK 10, web 87. Contract source/financial math/settlement authorization were not changed;
no new contract deployment or broadcast was attempted. Existing capital conservation/solvency,
canonical-loss identity, partial-payout and same-loss replay regressions all passed.

The fresh database gets additive migration `010_policy_reconciliation.sql`. Existing histories
(procurement-only, claims-only, combined, integrated release) preserve old migration IDs and
immutable policy/case/adjudication/event rows. Repeating migration is safe; foreign-key checks
pass. Migrating never invents canonical chain evidence or grants old bind references eligibility.

## Adversarial coverage

The 19 new reconciliation tests cover duplicate logs/repeated runs, actual event provenance,
missing historical policy/terms, quote-and-acceptance recovery, missing registration/quote/acceptance,
absent insured exposure, a different acceptance wallet, stale evidence, immutable terms,
wrong chain, unavailable RPC, pool storage mismatch, insufficient confirmations, wrong pool,
mid-scan/final-anchor disagreement, orphaned/missing events, transactional conflicting canonical
binds, superseded concurrent scans, and collision with an existing legacy policy ID.

New read API tests cover cookie-only identity, forged/expired/revoked sessions, privilege
separation, ignored workspace/wallet/bearer role assertions, secret-free ops capabilities,
prepared/confirmed/expired/pending lifecycle evidence, stale/orphaned provenance, malformed
and foreign IDs, unauthorized access, safe settlement receipt links, incomplete-policy visibility
and wallet isolation. A read-only local request does not change insurance state.

Claims tests additionally prove that an old `bind_tx` without indexed evidence cannot intake,
that system role does not bypass this requirement, and that incomplete/orphaned/stale/unhealthy
observations block intake and idempotent replay without deleting previously recorded cases or
incidents. Existing wrong-wallet, invented-exposure, coverage-window, economic-event dedupe,
same-loss replay, immutable payout binding and aggregate partial commitment tests remain green.

## Live evidence and limits

[Captured public RPC results](2026-11-17-policy-reconciliation-live.json) contain no secrets or
invented policy terms. Both scripts used the existing Arc chain, pool manifest, ABI and helpers,
with an in-memory database. No Railway storage or deployment configuration was accessed.

- Recent capture at `2026-11-18T03:03:12.924Z`: chain `5042002`, pool code present, head `72783023`,
  confirmed range `72781022..72783021`. Two successful scans, zero events/records.
- Historical capture at `2026-11-18T03:04:24.686Z`: located the first bound block for the policy
  already cited in repository settlement evidence, without assuming a deployment block. At block
  `72712560`, two successful scans each observed one event, leaving one `ONCHAIN_UNLINKED` record.
  Its original UUID, terms snapshot, acceptance, agent and exposure were unavailable in the empty
  database. No claimable policy was fabricated and no historic loss/settlement was rewritten.

Live smoke commands:

```sh
pnpm --filter @arcuex/onchain exec tsx ../../apps/web/scripts/reconciliation-read-smoke.mts
pnpm --filter @arcuex/onchain exec tsx ../../apps/web/scripts/reconciliation-read-smoke.mts 0x709b9ba707bc439385d46a013efde14b58160bf9d4583f60aa8b932d25ac4f74
```

These reads verify RPC connectivity and actual historical event import, not exhaustive chain
history completeness, real financial-loss proof, browser wallet approval or a newly broadcast
quote/bind/settle journey. No live synthetic data was inserted into a deployment database.
QuickNode Streams transport/bounty completion is not implied by RPC use.

## Merge decision

**CONDITIONAL GO** for integration into `ui/nov20-product-experience`.

The [handoff](../development/policy-reconciliation-handoff.md) defines file ownership, authoritative
sources and typed session/lifecycle contracts. At Cursor commit `887de65`, comparison with
`fb6fe5d` showed no changed-file overlap with this backend work. No Cursor-owned page, component,
layout, global style, hook, provider or navigation was edited. A combined branch/browser test
has not been run and Cursor has not acknowledged the new contracts.

Before beta claim availability: consume the server-authorized session contract and pending-policy
view in the UI; run combined tests/browser acceptance; establish contiguous historical backfill
and recurring confirmed-range polling with freshness under 300 seconds in the future integrated
environment. That scheduler was not installed, because the currently deployed Railway beta must
remain unchanged. Without polling, procurement claims intentionally become unavailable.

`submitted`/`failed` lifecycle states are reserved until durable authenticated evidence exists;
this sprint does not infer either from browser storage or API failure. Unknown historical terms
remain unknown. This is not deployment approval or a claim of production insurance readiness.
