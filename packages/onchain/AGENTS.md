# @arcuex/onchain

## Scope

Typed ABIs, canonical policy/terms hashing, lossKey helpers, viem read/write
helpers, event decode/dedupe, receipt waiting, and reconciliation against
`InsurancePool` (contract authoritative).

## Rules

- Use Arc Testnet by default; 6-decimal ERC-20 USDC accounting only.
- Never collect private keys; callers supply a wallet client / account.
- Contract state is authoritative over SQLite on mismatch.
- `claimsAuthority` settlements only — no AI payout path.
- `claimId` is settlement anti-replay; `lossKey` is economic-loss identity
  (partials ≤ immutable `lossCap`). Do not conflate the two.

## Testnet lifecycle

```bash
pnpm --filter @arcuex/onchain lifecycle:preflight
# Live broadcasts require --mode=live and per-step --confirm=...
```

Pool address comes from `docs/deployments/arc-testnet-insurance-pool.json`.
Do not broadcast without explicit operator approval. Do not print private keys.

## Tests

```bash
pnpm --filter @arcuex/onchain test
```
