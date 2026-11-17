#!/usr/bin/env bash
# Deployment preflight — validates Arc Testnet config WITHOUT broadcasting.
# Never prints private key material. Exits non-zero if unsafe to deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${HOME}/.foundry/bin:${PATH}"

RPC_URL="${ARC_TESTNET_RPC_URL:-https://rpc.quicknode.testnet.arc.io}"
EXPECTED_USDC="0x3600000000000000000000000000000000000000"
EXPECTED_CHAIN="5042002"

echo "=== Arcuex InsurancePool deploy preflight ==="
echo "RPC: $RPC_URL"

CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL")"
echo "chainId: $CHAIN_ID"
if [[ "$CHAIN_ID" != "$EXPECTED_CHAIN" ]]; then
  echo "FAIL: expected chain $EXPECTED_CHAIN" >&2
  exit 1
fi

DECIMALS="$(cast call "$EXPECTED_USDC" "decimals()(uint8)" --rpc-url "$RPC_URL")"
SYMBOL="$(cast call "$EXPECTED_USDC" "symbol()(string)" --rpc-url "$RPC_URL")"
echo "USDC decimals=$DECIMALS symbol=$SYMBOL"
if [[ "$DECIMALS" != "6" ]]; then
  echo "FAIL: USDC decimals must be 6" >&2
  exit 1
fi

BLOCKERS=0
for v in DEPLOYER_PRIVATE_KEY CLAIMS_AUTHORITY FEE_RECIPIENT; do
  if [[ -z "${!v:-}" ]]; then
    echo "BLOCKED: $v unset"
    BLOCKERS=$((BLOCKERS + 1))
  else
    echo "OK: $v is set (value not printed)"
  fi
done

if [[ -n "${CLAIMS_AUTHORITY:-}" && "${CLAIMS_AUTHORITY}" == "0x0000000000000000000000000000000000000000" ]]; then
  echo "FAIL: CLAIMS_AUTHORITY is zero address" >&2
  exit 1
fi
if [[ -n "${FEE_RECIPIENT:-}" && "${FEE_RECIPIENT}" == "0x0000000000000000000000000000000000000000" ]]; then
  echo "FAIL: FEE_RECIPIENT is zero address" >&2
  exit 1
fi

if [[ -f "$ROOT/docs/deployments/arc-testnet-insurance-pool.json" ]]; then
  echo "NOTE: prior deployment record exists at docs/deployments/arc-testnet-insurance-pool.json"
else
  echo "NOTE: no deployment record on disk (expected until first successful broadcast)"
fi

echo "Constructor args (planned):"
echo "  usdc=$EXPECTED_USDC"
echo "  claimsAuthority=<from env>"
echo "  feeRecipient=<from env>"
echo "Gas: use --with-gas-price 20000000000 (20 gwei Arc floor)"
echo "Auth: settle/release require claimsAuthority; owner can rotate"

if [[ "$BLOCKERS" -gt 0 ]]; then
  echo "=== PREFLIGHT INCOMPLETE: $BLOCKERS blocker(s) — do not claim deployment ==="
  exit 2
fi

echo "=== PREFLIGHT READY — run ./scripts/deploy-insurance-pool.sh only with explicit authorization ==="
