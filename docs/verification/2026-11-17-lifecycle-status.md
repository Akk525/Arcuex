# Lifecycle verification status — 2026-11-17 (updated)

Branch: `feat/onchain-lifecycle`

## Matrix

| Criterion | Status | Evidence |
| --- | --- | --- |
| Same-loss uniqueness on-chain (`lossKey`) | **Yes (local)** | `LossKey.sol`, `losses` mapping, Foundry adversarial tests |
| Local Foundry lifecycle E2E | **Yes** | `LifecycleE2E.t.sol` + `forge test` 20/20 |
| Local TypeScript tests / lint / typecheck / build | **Run in session** | `pnpm` filters + root scripts |
| Event ABI decode + durable dedupe + RPC backfill reconcile | **Yes (local)** | `@arcuex/onchain` events/reconcile-events tests; SQLite inbox dedupe |
| Deploy preflight hardened | **Yes (no broadcast)** | `./scripts/preflight-deploy.sh` |
| Demo runbook | **Yes** | `docs/development/local-lifecycle-runbook.md` |
| Testnet deployed | **No** | No deploy JSON; keys unset — **not claimed** |
| Testnet transaction verified | **No** | No hashes captured |
| QuickNode Streams live | **No** | Secret + public host missing (RPC backfill ≠ Streams) |
| Draft PR open | **No** | `gh` auth Forbidden |
| Still blocked | **Yes** | Deployer key, Streams host, gh auth |

## Preflight (no credentials)

- QuickNode Arc RPC `eth_chainid` → `5042002`
- USDC `0x3600…0000` → decimals `6`, symbol `USDC`
- Env blockers: `DEPLOYER_PRIVATE_KEY`, `CLAIMS_AUTHORITY`, `FEE_RECIPIENT`
- Expected `./scripts/preflight-deploy.sh` exit **2** until keys provided
- Script never prints private keys

## Safe deploy checklist (when authorized)

1. Fund Arc Testnet deployer via https://faucet.circle.com  
2. Export `ARC_TESTNET_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `CLAIMS_AUTHORITY`, `FEE_RECIPIENT`  
3. `./scripts/preflight-deploy.sh` → exit 0  
4. Explicit operator authorization to broadcast  
5. `./scripts/deploy-insurance-pool.sh`  
6. Confirm address + create tx on explorer.testnet.arc.io  
7. Set `ARCUE_X_POOL_ADDRESS` / `NEXT_PUBLIC_ARCUE_X_POOL_ADDRESS`  
8. Small LP deposit → bind → synthetic incident (labeled) → authority settle with `lossKey`/`lossCap` → reconcile  
9. Negatives: duplicate claimId, same lossKey over cap, stranger settle, wrong beneficiary, expired, withdraw while reserved  

## PR URL (manual)

https://github.com/Akk525/Arcuex/pull/new/feat/onchain-lifecycle

```bash
gh auth login -h github.com
gh pr create --draft --base main --head feat/onchain-lifecycle
```
