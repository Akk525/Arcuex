# Causal verification experiments v2

All evidence was collected on 2026-11-17 UTC. Keep `historical/` and `synthetic/`
separate. Do not upload or treat a synthetic event as a real financial-event proof.

From the repository worktree root:

```sh
pnpm exec node --test docs/research/coverage-wedges/fixtures/evaluator.test.ts
pnpm exec node --test docs/research/coverage-wedges/experiments/causal-v2/verifier.test.ts
pnpm exec node docs/research/coverage-wedges/experiments/causal-v2/synthetic/run.ts
python3 docs/research/coverage-wedges/experiments/causal-v2/check-integrity.py
```

Offline deployed-code replay (root dependencies must also be installed for viem):

```sh
cd docs/research/coverage-wedges/experiments/causal-v2/evm-runtime
pnpm install --frozen-lockfile
pnpm exec node replay.mjs
pnpm exec node --test regression.test.mjs
```

Requires Node 24+ for optional TypeScript execution. The root Node 20+ production
requirement is unchanged. Nested runtime dependencies/lockfile are isolated. Offline
replay performs no RPC or wallet operations; `--check` skips writing the output file.

Online discovery scripts are explicitly **not** necessary to run regressions. They
make public read requests and overwrite their own discovery outputs; refreshing a
captured witness requires a new version/review and new integrity manifest, not a
silent update to accepted evidence. Code-source cache dependencies for online scripts
are under `/private/tmp/arcuex-public-source-cache`; that temporary cache is not needed
by the offline replay. Provenance and deployed ABI/layout/hash summaries are preserved.

Pipeline: `collect-public.py` → `inspect-sources.py` → `discover-chain.mjs` (may fail
on paid archive access) → `probe-archives.py` / `probe-state.mjs` → `locate-update.mjs`.
`scan-logs.py` preserves failed Cloudflare alternatives. `supplement-code.py` and
`supplement-sourcify.py` collect missing immutable library code only; no missing
storage is manufactured. `check-recovery.py` / `recovery-range.py` retain incomplete
recovery discovery and provider disagreements. Read the top-level evidence register
for exact limits before drawing any historical conclusion.

The supplied claim verifier's HISTORICAL mode always returns REVIEW. The EVM replay's
`REPLAY_COMPLETED` means deterministic consistency of supplied bytes, not consensus
authentication or a net payable claim. All three synthetic outcomes have
`authorizesPayment: false`. The context-creation helper is test scaffolding only.
