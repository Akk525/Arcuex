# Backend integration release evidence

November 19, 2026, America/Chicago. Candidate ref `backend-integration/2026-11-19-v1` on `backend/live-insurance-readiness`. The input tree was clean at `543f48df1b5f371cef6c9ac30db533bd4ee9b092`. Its preceding procurement and settlement commits were `e9671da29a61bd2bb788bac7efc99d19cdb12b61` and `b8da83cfb847e7663d83b092e6c490d9debf699f`.

## Integrity and recovery

The full `contracts/` tree remains identical to the validated input tree at Git tree `5136274ee2e75003f135047119713f8ddc947a00`. The contract source tree is `073ea59004edb218d034ea5edcb36bb9ad5737eb`, the ABI tree is `012cffb90d0804db04f6de334c8e056575dc8912`, and the deployed pool manifest blob is `32ce1205403c4c20e8b60ab3c2e1eabdcd17fc6b`. The contract source, deployment script, Foundry config and lockfile, ABI, and pool manifest also match frozen Plan A.

Recover the candidate in a fresh detached worktree from the annotated local tag and verify the tag's commit and tree:

```sh
git rev-parse 'backend-integration/2026-11-19-v1^{commit}' 'backend-integration/2026-11-19-v1^{tree}'
git worktree add --detach .worktrees/backend-integration-v1 backend-integration/2026-11-19-v1
```

Frozen release refs `archive/2026-11-18/release/nov20-arc-testnet-beta` (`fb6fe5d`) and `fallback/nov20-plan-a-f8365a8` (`f8365a8`) were preserved. This ref is local.

## Acceptance

| Check | Evidence |
| --- | --- |
| Backend, SDK and contracts | `pnpm test:all` passed 410 workspace tests, including 175 web/API and 16 SDK tests, plus 46 Foundry tests. |
| Operations | `node --test deploy/railway/*.test.cjs deploy/backend/*.test.cjs` passed 12 tests. Two subprocesses contended for a disposable cursor lock. A replacement acquired it after the owner was killed. |
| Concurrent indexing | Two SQLite connections ran overlapping scans. A superseded scan could not overwrite the winning checkpoint. Duplicate events collapsed into one row. Temporary RPC failure suspended eligibility, and the reopened database recovered on retry. |
| Settlement | Offline API and RPC doubles exercised expired evidence and signing deadline, wrong signer and nonce, pending nonce ambiguity, concurrent authorization, duplicate and reverted callbacks, shallow and inconsistent receipts, orphaned prior revert, and payment reads before and after worker reorg reconciliation. |
| Procurement and reserves | The existing backend and Foundry suites covered capacity changes and insufficient capacity, duplicate binding, coverage deadlines, replay checks and solvency. |
| Build | `pnpm lint` and `pnpm build` passed with the production build's type checks. |

## Configuration and migration

Use the [isolated candidate runbook](../deployments/backend-isolated.md). The new authorization records use the existing case event journal, so the release inherits the same 14 migrations. Preserve the journal, policy history, and cursor state on a dedicated single-replica volume. The worker creates `/data/reconciliation/worker-lock.sqlite`. The lock file may persist after exit and is safe to reuse. SQLite owns the lock until the owning process exits. During recovery, preserve the settlement journal before accepting any signing request. An older snapshot may omit an issued nonce authorization. Compare it against the external authority's records and Arc before clearing the recovery hold. [Railway volume reference](https://docs.railway.com/volumes/reference)

Arc RPC access must include historical blocks, receipts, logs, contract reads and `pending` state for `eth_call` and `eth_getTransactionCount`. The operator must validate the selected provider's pending-state behavior with the isolated environment before live financial operations. [Ethereum JSON-RPC reference](https://ethereum.org/developers/docs/apis/json-rpc/#eth_gettransactioncount)

## Release decisions

- **Backend integration GO for offline use.** The [Markdown handoff](../integrations/backend-integration-v1.md) and [JSON response examples](../integrations/backend-integration-v1.json) are available to the frontend team.
- **Live financial operations NO-GO.** An independently verified emitter profile, replay and recovery evidence, authorized same-policy testnet lifecycle, and a dedicated external signer that enforces the application deadline are still required. A dropped authorization or unknown receipt requires manual investigation. There is no automatic nonce reset.
- **Hosted deployment NO-GO.** The local Docker daemon was unavailable. The candidate container runtime, dedicated volume, ingress/egress, provider behavior and hosted recovery remain unverified. No financial transaction or hosted operation was performed during this acceptance.
