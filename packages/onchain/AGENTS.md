# @arcuex/onchain

## Scope

Typed ABIs, canonical policy/terms hashing, viem read/write helpers, receipt
waiting, and SQLite reconciliation against `InsurancePool` contract state.

## Rules

- Use Arc Testnet by default; 6-decimal ERC-20 USDC accounting only.
- Never collect private keys; callers supply a wallet client / account.
- Contract state is authoritative over SQLite on mismatch.
- `claimsAuthority` settlements only — no AI payout path.

## Tests

```bash
pnpm --filter @arcuex/onchain test
```
