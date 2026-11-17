# Lifecycle verification status — 2026-11-17

Branch: `feat/onchain-lifecycle` (starting point `fff3404` + follow-up commits)

## Matrix

| Criterion | Status | Evidence |
| --- | --- | --- |
| Code complete (pool, SDK, Streams receiver, UI, agent) | **Yes** | Repo on branch |
| Local Foundry tests | **Yes** | `forge test` (see CI/local run) |
| Local TypeScript tests / lint / typecheck / build | **Yes** | `pnpm` scripts |
| Testnet deployed | **No** | No deploy JSON; keys unset |
| Testnet transaction verified | **No** | No hashes captured |
| QuickNode Streams live | **No** | Secret + public host missing |
| Draft PR open | **No** | `gh` auth Forbidden |
| Still blocked | **Yes** | Deployer key, Streams host, gh auth |

## Preflight (executed)

- QuickNode Arc RPC `eth_chainid` → `5042002`
- USDC `0x3600…0000` → decimals `6`, symbol `USDC`
- Env: `DEPLOYER_PRIVATE_KEY`, `CLAIMS_AUTHORITY`, `FEE_RECIPIENT`, `ARCUE_X_POOL_ADDRESS`, `QUICKNODE_STREAMS_WEBHOOK_SECRET` all **unset**
- `./scripts/preflight-deploy.sh` expected exit 2 until keys provided

## Safe deploy checklist (when authorized)

1. Fund Arc Testnet deployer via https://faucet.circle.com  
2. Export `ARC_TESTNET_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `CLAIMS_AUTHORITY`, `FEE_RECIPIENT`  
3. `./scripts/preflight-deploy.sh` → exit 0  
4. Explicit operator authorization to broadcast  
5. `./scripts/deploy-insurance-pool.sh`  
6. Confirm address + create tx on explorer.testnet.arc.io  
7. Set `ARCUE_X_POOL_ADDRESS` / `NEXT_PUBLIC_ARCUE_X_POOL_ADDRESS`  
8. Small LP deposit → bind → synthetic incident (labeled) → authority settle → reconcile SQLite  
9. Negative: duplicate claimId, stranger settle, wrong beneficiary, expired, withdraw while reserved  

## PR URL (manual)

https://github.com/Akk525/Arcuex/pull/new/feat/onchain-lifecycle

```bash
gh auth login -h github.com
gh pr create --draft --base main --head feat/onchain-lifecycle
```
