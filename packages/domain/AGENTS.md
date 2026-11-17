# @arcuex/domain

## Scope

Policy-agnostic insurance domain types, validation, monetary units, and pure
state transitions. No I/O, no SQL, no RPC, no UI.

## Rules

- Keep entities wedge-agnostic: do not hardcode protocol-failure vs execution-loss.
- Monetary values use integer USDC micro-units (`UsdcMicros`, 6 decimals).
- Coverage terms are immutable once attached to a quote or policy (versioned snapshots).
- State machines are the only authorized transition paths.
- AI votes must never authorize payouts; assessments require explicit decision records.
- Synthetic underwriting products must be labeled `synthetic: true`.
- Economic loss identity (`lossKey` / `loss-key.ts`) is distinct from claim ids;
  on-chain hashing lives in `@arcuex/onchain` / `LossKey.sol`.

## Tests

```bash
pnpm --filter @arcuex/domain test
pnpm --filter @arcuex/domain typecheck
```
