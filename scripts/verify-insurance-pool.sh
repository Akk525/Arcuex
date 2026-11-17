#!/usr/bin/env bash
# Verify InsurancePool source on Arc Testnet Blockscout explorer.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/contracts"
export PATH="${HOME}/.foundry/bin:${PATH}"

: "${ARCUE_X_POOL_ADDRESS:?Set ARCUE_X_POOL_ADDRESS}"
: "${CLAIMS_AUTHORITY:?Set CLAIMS_AUTHORITY}"
: "${FEE_RECIPIENT:?Set FEE_RECIPIENT}"

USDC="${ARC_USDC_ADDRESS:-0x3600000000000000000000000000000000000000}"
ARGS="$(cast abi-encode "constructor(address,address,address)" "$USDC" "$CLAIMS_AUTHORITY" "$FEE_RECIPIENT")"

forge verify-contract "$ARCUE_X_POOL_ADDRESS" src/InsurancePool.sol:InsurancePool \
  --chain-id 5042002 \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.arc.io/api/ \
  --constructor-args "$ARGS" \
  --watch
