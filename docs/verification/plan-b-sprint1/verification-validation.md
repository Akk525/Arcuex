# Verification branch validation — 2026-11-18

Baseline: `42e2c225b32b6b3d41abf8e0c2a6e9ba5f878f62`.
Node 24.16.0; pnpm 11.20.0. Locked dependencies installed in the isolated worktree.

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm test` | 273 passed | [tests](verification-tests.txt) |
| `pnpm typecheck` | passed | [typecheck](verification-typecheck.txt) |
| `pnpm lint` | passed | [lint](verification-lint.txt) |
| `pnpm build` | passed (final source) | [build](verification-build.txt) |
| in-memory example via `node --import tsx` | completed, fixture evidence sufficient | [record](example-verification.json) |

The insurance suite contains 18 new verification cases. The web suite adds one authenticated API
journey using a canonical procurement policy and mocked reconciliation evidence. Tests cover duplicate
reuse and foreign duplicate access, raw evidence/digest manipulation, missing evidence, policy/incident
mismatch, invalid/future/out-of-window timestamps, rejected unsupported stale attestations, SQL
immutability, verifier exceptions/negative outcomes and concurrent/replayed provenance changes.

Earlier runs caught a BigInt serialization error in the context fingerprint and two migration-count
assertions requiring 13 instead of 12. These were corrected before the green full run. The tsx CLI
cannot create its IPC pipe in this sandbox; using `node --import tsx` runs the same in-memory example
without that unnecessary pipe. No network or wallet operations are involved. Build emits the existing
Next.js ESLint plugin configuration notice; standalone lint passes.

Contract code is unchanged; the separate settlement branch tests the same baseline contract source
offline (46 test executions, including the fresh policy/deadline/conservation simulations). This branch
does not claim a live Arc/QuickNode/wallet check or full authorized browser reimbursement.

Before merge: exact-commit CI, review the fixture-only trust semantics, auth isolation, additive
migration preservation and read-only API fields. No merge/push/deploy/migration/broadcast authorization
is implied. Original worktree stays on `main`; Plan A source/deployment evidence is untouched.
