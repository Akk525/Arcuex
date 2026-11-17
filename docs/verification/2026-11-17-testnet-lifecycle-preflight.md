# Arc Testnet lifecycle preflight — 2026-11-17

**No financial transactions broadcast in this session.**

## Deployment

| Item | Value |
| --- | --- |
| Chain | Arc Testnet `5042002` (RPC verified) |
| Pool | `0x6657974EEdF488380251bDD95A7FFfb0D456E49E` |
| Manifest | `docs/deployments/arc-testnet-insurance-pool.json` |
| Bytecode | nonempty (verified via adapter / cast) |
| Pool accounting at preflight | `totalAssets=0`, `totalReserved=0`, `totalShares=0` |

## Planned transactions (not executed)

1. LP `approve` 5 USDC → pool  
2. LP `deposit` 5 USDC  
3. Policyholder `approve` 0.1 USDC premium  
4. `bindPolicy` limit=2 USDC, beneficiary set  
5. Off-chain **synthetic** claim evaluation (labeled; not real-world loss)  
6. Authority `settleClaim` 1 USDC with `lossKey` / `lossCap`  

## Preflight blockers observed

1. `CLAIMS_AUTHORITY_PRIVATE_KEY` unset — settle cannot be signed (authority ≠ deployer).  
2. On-chain `claimsAuthority` native balance **0** — cannot pay gas (do not auto-fund).  
3. Without explicit `LIFECYCLE_LP_USE_DEPLOYER=1` / `LIFECYCLE_POLICYHOLDER_USE_DEPLOYER=1` or dedicated keys, LP/policyholder signers are missing.

Redeploy **not** required for this flow once signers + authority gas are ready.

## First approved command

```bash
pnpm --filter @arcuex/onchain lifecycle:preflight -- --mode=live --confirm=lp_approve
```
