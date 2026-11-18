# Settlement branch validation — 2026-11-18

Baseline: `42e2c225b32b6b3d41abf8e0c2a6e9ba5f878f62`.
Node 24.16.0, pnpm 11.20.0, solc 0.8.24 (local Foundry cache).

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm test` | 254 tests passed | [test log](settlement-tests.txt) |
| `pnpm typecheck` | passed | [typecheck](settlement-typecheck.txt) |
| `pnpm lint` | passed | [lint](settlement-lint.txt) |
| `pnpm build` | passed | [build](settlement-build.txt) |
| `forge test --offline` in contracts | 46 passed; 256 fuzz runs | [contract tests](settlement-forge.txt) |

Initial full pnpm run hit a 5-second baseline product-publication test timeout while both worktrees
were building/testing concurrently. The unchanged test passed on the complete rerun preserved here.
No timeouts or safety checks were relaxed. Build emits the existing Next.js ESLint plugin notice;
standalone lint and build complete successfully.

Dependencies were installed from the locked file; existing local ignored Foundry libraries were
copied into the isolated worktree. No dependency, compiler or contract source versions were changed.
No RPC, fork, chain broadcast or production DB operation was used. New EVM tests use MockUSDC and
pranked addresses in a local VM. They are not claims of live Arc wallet or payout acceptance.

Changed files: `contracts/test/PlanBSprint1.t.sol`, README, the settlement feasibility report and
these six validation artifacts. Contract implementation/ABI and application code remain unchanged.
Review source/tests and green exact-commit CI before merging. No merge/deploy/push was performed.
