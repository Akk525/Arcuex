#!/usr/bin/env bash
# Deploy InsurancePool to Arc Testnet. Never uses mainnet.
# Does not print private keys. Requires explicit funded deployer env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/contracts"

export PATH="${HOME}/.foundry/bin:${PATH}"

# Prefer QuickNode public Arc Testnet RPC when Circle hostname is unreachable.
RPC_URL="${ARC_TESTNET_RPC_URL:-https://rpc.quicknode.testnet.arc.io}"
: "${DEPLOYER_PRIVATE_KEY:?Set DEPLOYER_PRIVATE_KEY (funded Arc Testnet deployer)}"
: "${CLAIMS_AUTHORITY:?Set CLAIMS_AUTHORITY address}"
: "${FEE_RECIPIENT:?Set FEE_RECIPIENT address}"

CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL")"
if [[ "$CHAIN_ID" != "5042002" ]]; then
  echo "Refusing deploy: RPC chain id is $CHAIN_ID, expected 5042002 (Arc Testnet)" >&2
  exit 1
fi

echo "Arc Testnet chain id verified: $CHAIN_ID"
echo "RPC: $RPC_URL"
echo "CLAIMS_AUTHORITY and FEE_RECIPIENT are set (values not printed)"
echo "Deployer key is set (value not printed)"

if [[ ! -d lib/forge-std ]]; then
  forge install --no-commit
fi

# 20 gwei floor required by Arc mempool
OUT="$(
  forge script script/DeployInsurancePool.s.sol:DeployInsurancePool \
    --rpc-url "$RPC_URL" \
    --broadcast \
    --slow \
    --with-gas-price 20000000000 \
    -vv
)"

echo "$OUT"

POOL="$(echo "$OUT" | sed -n 's/.*InsurancePool[[:space:]]*\(0x[a-fA-F0-9]\{40\}\).*/\1/p' | tail -1)"
if [[ -z "$POOL" ]]; then
  echo "Deploy finished but could not parse InsurancePool address from forge output" >&2
  exit 1
fi

RECORD_DIR="$ROOT/docs/deployments"
mkdir -p "$RECORD_DIR"
RECORD="$RECORD_DIR/arc-testnet-insurance-pool.json"
python3 - "$RECORD" "$POOL" "$RPC_URL" <<'PY'
import json, sys, time
from pathlib import Path
path, pool, rpc = sys.argv[1], sys.argv[2], sys.argv[3]
Path(path).write_text(json.dumps({
  "network": "arc-testnet",
  "chainId": 5042002,
  "usdc": "0x3600000000000000000000000000000000000000",
  "insurancePool": pool,
  "claimsAuthoritySet": True,
  "feeRecipientSet": True,
  "rpc": rpc,
  "verifiedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
  "notes": "Recorded by scripts/deploy-insurance-pool.sh. Confirm tx on explorer.testnet.arc.io."
}, indent=2) + "\n")
print("Wrote", path)
PY

echo "Set ARCUE_X_POOL_ADDRESS=$POOL in .env.local (do not commit secrets)"
echo "Explorer: https://explorer.testnet.arc.io/address/$POOL"
