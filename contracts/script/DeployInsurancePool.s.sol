// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {InsurancePool} from "../src/InsurancePool.sol";

/// @dev Deploy to Arc Testnet with official USDC ERC-20.
/// forge script script/DeployInsurancePool.s.sol:DeployInsurancePool --rpc-url $ARC_TESTNET_RPC_URL --broadcast
contract DeployInsurancePool is Script {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        address claimsAuthority = vm.envAddress("CLAIMS_AUTHORITY");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        InsurancePool pool = new InsurancePool(ARC_USDC, claimsAuthority, feeRecipient);
        vm.stopBroadcast();

        console2.log("InsurancePool", address(pool));
        console2.log("USDC", ARC_USDC);
        console2.log("claimsAuthority", claimsAuthority);
    }
}
