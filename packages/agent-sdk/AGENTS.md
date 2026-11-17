# @arcuex/agent-sdk

## Scope

Narrow agent-facing API for synthetic quote → inspect terms → accept → prepare
premium/bind transactions → wait for active coverage → inspect policy/claim.

## Rules

- Never collect, store, or transmit private keys / seed phrases.
- Wallet signing is always external (`WalletClient` / user approval).
- Permissions allowlist: USDC `approve` + `InsurancePool.bindPolicy` (+ optional deposit).
- AI votes must not authorize payouts; settlement stays with `claimsAuthority`.
- Label synthetic coverage explicitly.

## Example

```bash
pnpm --filter @arcuex/agent-sdk example:quote-bind
```
