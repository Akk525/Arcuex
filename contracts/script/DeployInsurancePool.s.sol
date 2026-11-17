// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {InsurancePool} from "../src/InsurancePool.sol";

/**
 * @dev Deploy InsurancePool to Arc Testnet only.
 *
 * Required env (never commit):
 *   ARC_TESTNET_RPC_URL
 *   DEPLOYER_PRIVATE_KEY
 *   CLAIMS_AUTHORITY
 *   FEE_RECIPIENT
 *
 * Optional:
 *   ARC_USDC_ADDRESS (defaults to official Arc USDC ERC-20)
 *
 * Example:
 *   forge script script/DeployInsurancePool.s.sol:DeployInsurancePool \
 *     --rpc-url "$ARC_TESTNET_RPC_URL" \
 *     --broadcast \
 *     --with-gas-price 20000000000
 *
 * Arc mempool drops txs with maxFeePerGas < 20 gwei.
 * Prefer arc-forge when available for Arc runtime fidelity.
 */
contract DeployInsurancePool is Script {
    address constant ARC_USDC_DEFAULT = 0x3600000000000000000000000000000000000000;

    function run() external returns (address poolAddress) {
        address usdc = vm.envOr("ARC_USDC_ADDRESS", ARC_USDC_DEFAULT);
        address claimsAuthority = vm.envAddress("CLAIMS_AUTHORITY");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        require(claimsAuthority != address(0), "CLAIMS_AUTHORITY required");
        require(feeRecipient != address(0), "FEE_RECIPIENT required");
        require(usdc == ARC_USDC_DEFAULT, "Refuse non-official USDC on Arc Testnet deploy");

        vm.startBroadcast(deployerKey);
        InsurancePool pool = new InsurancePool(usdc, claimsAuthority, feeRecipient);
        vm.stopBroadcast();

        poolAddress = address(pool);
        console2.log("chainId", block.chainid);
        console2.log("InsurancePool", poolAddress);
        console2.log("USDC", usdc);
        console2.log("claimsAuthority", claimsAuthority);
        console2.log("feeRecipient", feeRecipient);
        // Chain ID is enforced by scripts/deploy-insurance-pool.sh against live RPC
        // before broadcast (Arc Testnet = 5042002). Do not hard-require here so
        // local forge simulation can still compile the broadcast path.
    }
}
