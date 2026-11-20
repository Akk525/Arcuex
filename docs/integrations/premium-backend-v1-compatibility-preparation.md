# Premium compatibility preparation

Backend v1 remains pinned to `fa462049cd4d87afce6ac9a3df9ef8dd2f55a7fc` and `backend-integration/2026-11-19-v1`. The compatibility artifact is a [reviewable patch](patches/premium-backend-v1.patch) against Claude's Phase D commit `f5309019e4d6029c2934205d94577b3e3a67acbd`. Phase D published standalone acceptance evidence while the patch was in progress, so the patch was retargeted from the initial `a49ceb5` snapshot. The frontend commit includes standalone evidence in `docs/working-notes/ui-redesign/premium-phase-d.md`. Its browser run was not repeated here.

The integration-prep branch contains the patch, tests, and this handoff. The patch was applied only to disposable frontend exports during verification. It has no settlement signer, send, or paid/failed callback UI. Existing operator preparation is labeled **Intent prepared**. The changes preserve the Phase D claims context and layouts, except for status labels and a distinct Rehearsal portfolio filter.

## Six gate results

| Gate | Patched Phase D result |
| --- | --- |
| Dashboard import boundary | **Pass.** Uses async `projectSettlementFinality` from v1 and suppresses the paid status when current proof is absent. The import and status handling are checked as source; the combined route has not been built or run. |
| Claims list preserves finality | **Pass.** The parser keeps the discriminator. List and workbench consume it. |
| Claims detail preserves finality | **Pass.** The parser, detail status and dossier next step consume it. |
| Claim detail rejects unverified hash | **Pass.** A receipt requires explicit `confirmed`, `PAID`, a valid hash and a non-fixture claim. Missing or stale finality cannot prove payment. |
| Policy timeline rejects stale receipts | **Pass.** Reorged settlement stays in reconciliation, with no confirmed link. The policy record uses the same timeline projection for its references. |
| Rehearsal excluded from live In force | **Pass.** Rehearsal has its own category and count. The dashboard also labels fixture records as rehearsal. |

The focused patched-export run passed **65 tests** across seven suites, including the original 13 compatibility checks. Checkout coverage includes a wallet timeout, backend `UNCONFIRMED`, same-hash success, shallow and orphaned reverts, wrong chain, and receipt replacement. Wallet and RPC responses used test doubles. The checkout adapter type-checks against the installed viem `PublicClient`. No production build, integrated browser run, live wallet operation, or hosting action was performed.

### Checkout recovery contract

The adapter checks the recorded hash and uses three viem confirmations, which counts inclusion plus the two required descendants. It gives a successful receipt's **original hash** to the existing server endpoint for authoritative verification. A timeout, RPC error, `UNCONFIRMED`, replacement receipt, shallow revert or orphaned revert keeps the original attempt. To release it, a reverted receipt must still match the hash, Arc Testnet chain, canonical block and required depth. Checkout only clears storage if the stored attempt still matches. Any retry re-enters regular server payment preflight.

## Integration steps and conflict strategy

1. Confirm the accepted Phase D SHA. The patch applies directly to `f5309019`. For a later accepted SHA, dry-check the patch in a disposable export and re-port overlapping hunks while retaining Phase D context, freshness labels and layouts.
2. After approval to integrate, start a fresh combined worktree from the compatibility-preparation commit, whose application code is frozen backend v1. Merge the exact accepted frontend SHA there. Preserve the backend tag and Claude's branch.
3. Resolve the shared claim list and detail API routes first. Keep v1's async `projectSettlementFinality`, status masking, receipt and mutation gates, actor/role/session/scoped-access checks, and source guards. Add Phase D's `context` and workbench verification freshness after access checks. Keep existing backend mutation handlers and do not restore `confirmedClaimReceipt` as a shortcut.
4. Review and apply the compatibility patch to the combined candidate. The dashboard, claim components/parsers, and policy detail were all retargeted to the committed Phase D versions. Check any manual edits to those paths before applying hunks. The patch expects v1's async projector to be present in the combined tree.
5. Run the unpatched-mode focused runner against the resulting candidate commit. In this mode the changes must already be in the candidate application tree. The compatibility-preparation branch and its tests do not change either source branch.

To reproduce the pre-merge patched test, from the prep worktree:

```sh
ARCUEX_COMPAT_APPLY_PATCH=1 ARCUEX_COMPAT_INSTALLED_WORKSPACE=/Users/aditya/Projects/Arcuex bash docs/integrations/checks/run-premium-backend-v1.sh f5309019e4d6029c2934205d94577b3e3a67acbd
```

## Combined acceptance checklist

- [ ] Verify the accepted source SHAs, clean combined worktree and conflict resolution. Build, lint, typecheck, and run `pnpm test:all`, the focused compatibility suite, and isolated operations tests.
- [ ] Run Phase D browser acceptance and a staged checkout rehearsal with an emulated wallet on desktop and mobile. Check fixture mode blocks wallet payment, approved terms remain unpaid, wrong wallet/chain is rejected, and approval remains distinct from bind.
- [ ] In checkout, cover accepted quote expiry, low/unavailable capacity, pending receipt timeout, resumed same hash, wallet replacement, and shallow/orphaned then newly canonical revert. Confirm an attempt never clears or offers repeat payment while ambiguous.
- [ ] In the policy portfolio/detail, verify pending, orphaned, scheduled, effective, expired, and rehearsal cases. No rehearsal row increments live In force. Claim eligibility must follow the server and scope.
- [ ] In the claims list/detail, dashboard, policy timeline and reviewer workbench, exercise current/stale verification, human-approved unpaid claims, intent-only preparation, confirmed payment, missing finality, reorged payment and unverified stale hashes. Only a current verified receipt gets proof styling or a link. The historic receipt remains archival.
- [ ] Confirm no signer authorization, settlement wallet execution, or paid/failed callbacks are exposed by the premium UI. Keep live settlement and hosted deployment on separate acceptance gates.

The [original integration plan](premium-frontend-backend-v1-plan.md) retains the detailed API matrix and baseline results. Full combined acceptance and any later deployment are still pending.
