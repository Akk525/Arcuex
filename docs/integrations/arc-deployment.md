# Arc Testnet InsurancePool deployment

Verified network parameters (2026-11-17):

| Item | Value |
| --- | --- |
| Chain ID | `5042002` |
| USDC ERC-20 | `0x3600000000000000000000000000000000000000` (6 decimals) |
| Fee floor | 20 gwei `maxFeePerGas` |
| Public RPC (working here) | `https://rpc.quicknode.testnet.arc.io` |
| Circle public RPC | `https://rpc.testnet.arc.io` (DNS failed from this agent host) |
| Explorer | `https://explorer.testnet.arc.io` |
| Faucet | `https://faucet.circle.com` |

## Deploy (requires funded operator key)

```bash
export ARC_TESTNET_RPC_URL=https://rpc.quicknode.testnet.arc.io
export DEPLOYER_PRIVATE_KEY=0x...   # funded testnet only — never commit
export CLAIMS_AUTHORITY=0x...
export FEE_RECIPIENT=0x...
./scripts/deploy-insurance-pool.sh
./scripts/verify-insurance-pool.sh  # after ARCUE_X_POOL_ADDRESS set
```

Record address in `.env.local`:

```
ARCUE_X_POOL_ADDRESS=0x...
NEXT_PUBLIC_ARCUE_X_POOL_ADDRESS=0x...
```

Deployment metadata is written to `docs/deployments/arc-testnet-insurance-pool.json` by the script after a successful broadcast.

## Lifecycle helpers

TypeScript: `@arcuex/onchain` `executeLpDeposit` / `executeBindPolicy` / `executeSettleClaim`
— each waits for receipt success and re-reads contract state. Wrong chain, insufficient
USDC, underfunded pool, and duplicate claims throw typed `OnchainError`s.

## Current blocker

No `DEPLOYER_PRIVATE_KEY` / claims authority was present in this environment, so **no
live InsurancePool address has been verified yet**. Do not invent one.
