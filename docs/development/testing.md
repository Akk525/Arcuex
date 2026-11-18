# Testing

```bash
pnpm test          # vitest in all packages/apps
pnpm typecheck
pnpm lint
pnpm build
pnpm test:contracts # Foundry; install pinned libraries from contracts/README.md
node --test deploy/railway/reconciliation-state.test.cjs
```

Package unit tests mock transports/public clients. Live RPC checks belong in README verification commands or `docs/working-notes/`.

Before deployment, use a separately configured `local-test` production server and fresh temporary
SQLite, secure cookies and ephemeral ops credentials. `pnpm smoke:launch http://localhost:PORT`
checks sessions, unauthorized writes, rate limiting and optional local SQLite durability. Never
point write-capable smoke/browser harnesses at production without separate authorization.
The [consolidation report](../verification/2026-11-18-repository-consolidation.md) records the local
browser/API run and its limits. Mocked success, PAID screenshots and synthetic attestations do not
establish a funded policy, independently verified loss or reimbursement.

Optional research regression commands require Node 24+ (the deployed app remains on Node 22):

```sh
node --test docs/research/coverage-wedges/fixtures/evaluator.test.ts docs/research/coverage-wedges/experiments/causal-v2/verifier.test.ts
python3 docs/research/coverage-wedges/experiments/causal-v2/check-integrity.py
```

Install the isolated EVM replay dependencies with `pnpm install --frozen-lockfile` in its
`evm-runtime/` directory; run `node --test regression.test.mjs` and `node replay.mjs --check` there.
These commands use captured bytes offline; they do not authenticate historical loss or authorize payment.

Manual wallet checks (only with separate transaction authorization):

1. Connect injected wallet
2. Switch to Arc Testnet if prompted
3. Confirm USDC balance loads
4. Send test transfer and inspect receipt / explorer link
