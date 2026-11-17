# Auth + deploy blockers (2026-11-17)

## GitHub

- Branch **pushed**: `origin/feat/onchain-lifecycle` @ `f5e69a5`
- `gh` CLI: invalid keyring token → cannot create draft PR via `gh` / GitHub MCP

Remediation:

```bash
gh auth refresh -h github.com
# or
gh auth login -h github.com

gh pr create --draft --base main --head feat/onchain-lifecycle \
  --title "feat: onchain insurance lifecycle (A1–A6)" \
  --body "See branch commits from d9d47a5..HEAD"
```

Manual: https://github.com/Akk525/Arcuex/pull/new/feat/onchain-lifecycle

## Live Arc Testnet deploy

No `DEPLOYER_PRIVATE_KEY` / `CLAIMS_AUTHORITY` / `FEE_RECIPIENT` in environment.
**No InsurancePool address or tx hash has been verified.**

```bash
export ARC_TESTNET_RPC_URL=https://rpc.quicknode.testnet.arc.io
export DEPLOYER_PRIVATE_KEY=0x...   # funded faucet wallet only
export CLAIMS_AUTHORITY=0x...
export FEE_RECIPIENT=0x...
./scripts/deploy-insurance-pool.sh
```

Note: `rpc.testnet.arc.io` DNS failed from the agent host; QuickNode public Arc RPC worked (`5042002`).

## Streams

Receiver implemented at `/api/webhooks/quicknode-streams`.
Still need `QUICKNODE_STREAMS_WEBHOOK_SECRET` + public HTTPS host.
