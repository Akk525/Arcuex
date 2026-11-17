#!/usr/bin/env bash
# Deployment preflight — validates Arc Testnet config WITHOUT broadcasting.
# Never prints private key material or secret values. Exits non-zero if unsafe.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${HOME}/.foundry/bin:${PATH}"

RPC_URL="${ARC_TESTNET_RPC_URL:-https://rpc.quicknode.testnet.arc.io}"
EXPECTED_USDC="0x3600000000000000000000000000000000000000"
EXPECTED_CHAIN="5042002"
EXPECTED_SYMBOL="USDC"
MIN_DEPLOYER_WEI="${MIN_DEPLOYER_WEI:-100000000000000}" # 0.0001 ARC — override if needed
CONFIRMATIONS="${CONFIRMATIONS:-1}"

redact_addr() {
  local a="${1:-}"
  if [[ ${#a} -lt 12 ]]; then
    echo "(unset-or-short)"
    return
  fi
  echo "${a:0:6}…${a: -4}"
}

is_address() {
  [[ "${1:-}" =~ ^0x[a-fA-F0-9]{40}$ ]]
}

echo "=== Arcuex InsurancePool deploy preflight ==="
echo "RPC endpoint configured: yes"
echo "RPC host: $(python3 - <<PY
from urllib.parse import urlparse
print(urlparse("""$RPC_URL""").netloc or "(invalid)")
PY
)"
echo "Confirmation/finality policy: waitForTransactionReceipt confirmations=$CONFIRMATIONS (Arc Testnet; no separate finality gadget)"

# --- Network ---
if ! CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null)"; then
  echo "FAIL: RPC unreachable or cast missing — cannot verify chain" >&2
  exit 1
fi
echo "chainId: $CHAIN_ID"
if [[ "$CHAIN_ID" != "$EXPECTED_CHAIN" ]]; then
  echo "FAIL: expected Arc Testnet chain $EXPECTED_CHAIN, got $CHAIN_ID" >&2
  exit 1
fi
echo "OK: network is Arc Testnet ($EXPECTED_CHAIN)"

# --- USDC metadata ---
DECIMALS="$(cast call "$EXPECTED_USDC" "decimals()(uint8)" --rpc-url "$RPC_URL")"
SYMBOL="$(cast call "$EXPECTED_USDC" "symbol()(string)" --rpc-url "$RPC_URL" | tr -d '\r')"
# cast may quote the string
SYMBOL="${SYMBOL%\"}"
SYMBOL="${SYMBOL#\"}"
echo "USDC address=$(redact_addr "$EXPECTED_USDC") decimals=$DECIMALS symbol=$SYMBOL"
if [[ "$DECIMALS" != "6" ]]; then
  echo "FAIL: USDC decimals must be 6 (got $DECIMALS)" >&2
  exit 1
fi
if [[ "$SYMBOL" != "$EXPECTED_SYMBOL" ]]; then
  echo "FAIL: USDC symbol must be $EXPECTED_SYMBOL (got $SYMBOL)" >&2
  exit 1
fi
echo "OK: USDC metadata"

# --- Env presence (never print secret values) ---
BLOCKERS=0
for v in DEPLOYER_PRIVATE_KEY CLAIMS_AUTHORITY FEE_RECIPIENT; do
  if [[ -z "${!v:-}" ]]; then
    echo "BLOCKED: $v unset"
    BLOCKERS=$((BLOCKERS + 1))
  else
    echo "OK: $v is set (value not printed)"
  fi
done

# --- Address shape / zero checks (print redacted only) ---
if [[ -n "${CLAIMS_AUTHORITY:-}" ]]; then
  if ! is_address "$CLAIMS_AUTHORITY"; then
    echo "FAIL: CLAIMS_AUTHORITY is not a 20-byte hex address" >&2
    exit 1
  fi
  if [[ "$(printf "%s" "$CLAIMS_AUTHORITY" | tr "[:upper:]" "[:lower:]")" == "0x0000000000000000000000000000000000000000" ]]; then
    echo "FAIL: CLAIMS_AUTHORITY is zero address" >&2
    exit 1
  fi
  echo "CLAIMS_AUTHORITY=$(redact_addr "$CLAIMS_AUTHORITY")"
fi

if [[ -n "${FEE_RECIPIENT:-}" ]]; then
  if ! is_address "$FEE_RECIPIENT"; then
    echo "FAIL: FEE_RECIPIENT is not a 20-byte hex address" >&2
    exit 1
  fi
  if [[ "$(printf "%s" "$FEE_RECIPIENT" | tr "[:upper:]" "[:lower:]")" == "0x0000000000000000000000000000000000000000" ]]; then
    echo "FAIL: FEE_RECIPIENT is zero address" >&2
    exit 1
  fi
  echo "FEE_RECIPIENT=$(redact_addr "$FEE_RECIPIENT")"
fi

if [[ -n "${CLAIMS_AUTHORITY:-}" && -n "${FEE_RECIPIENT:-}" && \
      "$(printf "%s" "$CLAIMS_AUTHORITY" | tr "[:upper:]" "[:lower:]")" == "$(printf "%s" "$FEE_RECIPIENT" | tr "[:upper:]" "[:lower:]")" ]]; then
  echo "WARN: CLAIMS_AUTHORITY == FEE_RECIPIENT (allowed but concentrated trust)"
fi

# --- Deployer funds (derive address; never echo key) ---
if [[ -n "${DEPLOYER_PRIVATE_KEY:-}" ]]; then
  if ! DEPLOYER_ADDR="$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY" 2>/dev/null)"; then
    echo "FAIL: DEPLOYER_PRIVATE_KEY is not a usable key (value not printed)" >&2
    exit 1
  fi
  echo "Deployer=$(redact_addr "$DEPLOYER_ADDR")"
  BAL_WEI="$(cast balance "$DEPLOYER_ADDR" --rpc-url "$RPC_URL")"
  echo "Deployer native balance (wei): $BAL_WEI"
  if [[ "$BAL_WEI" -lt "$MIN_DEPLOYER_WEI" ]]; then
    echo "FAIL: deployer underfunded (need >= $MIN_DEPLOYER_WEI wei for gas)" >&2
    exit 1
  fi
  echo "OK: deployer native funds"

  # Test USDC optional for bare deploy; required for post-deploy lifecycle.
  USDC_BAL="$(cast call "$EXPECTED_USDC" "balanceOf(address)(uint256)" "$DEPLOYER_ADDR" --rpc-url "$RPC_URL")"
  echo "Deployer test USDC (raw micros): $USDC_BAL"
  if [[ "${REQUIRE_DEPLOYER_USDC:-0}" == "1" && "$USDC_BAL" == "0" ]]; then
    echo "FAIL: REQUIRE_DEPLOYER_USDC=1 but deployer USDC balance is 0" >&2
    exit 1
  fi
  if [[ "$USDC_BAL" == "0" ]]; then
    echo "NOTE: deployer has 0 test USDC — pool deploy still possible; LP/bind demo needs faucet USDC"
  else
    echo "OK: deployer holds test USDC"
  fi
fi

# --- Constructor args plan ---
echo "Constructor args (planned, redacted):"
echo "  usdc=$EXPECTED_USDC"
echo "  claimsAuthority=$(redact_addr "${CLAIMS_AUTHORITY:-}")"
echo "  feeRecipient=$(redact_addr "${FEE_RECIPIENT:-}")"
echo "Gas: forge --with-gas-price 20000000000 (20 gwei Arc floor)"
echo "Auth: settle/release require claimsAuthority; owner can rotate"
echo "Loss accounting: settleClaim(policyId, claimId, lossKey, amount, lossCap, payoutTo)"

if [[ -f "$ROOT/docs/deployments/arc-testnet-insurance-pool.json" ]]; then
  echo "NOTE: prior deployment record exists at docs/deployments/arc-testnet-insurance-pool.json"
else
  echo "NOTE: no deployment record on disk (expected until first successful broadcast)"
fi

# Sanity: ensure forge script exists
if [[ ! -f "$ROOT/contracts/script/DeployInsurancePool.s.sol" ]]; then
  echo "FAIL: missing contracts/script/DeployInsurancePool.s.sol" >&2
  exit 1
fi
echo "OK: deploy script present"

if [[ "$BLOCKERS" -gt 0 ]]; then
  echo "=== PREFLIGHT INCOMPLETE: $BLOCKERS blocker(s) — do not claim deployment ==="
  exit 2
fi

echo "=== PREFLIGHT READY — run ./scripts/deploy-insurance-pool.sh only with explicit authorization ==="
