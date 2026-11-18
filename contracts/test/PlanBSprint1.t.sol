// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {InsurancePoolTest} from "./InsurancePool.t.sol";
import {InsurancePool} from "../src/InsurancePool.sol";

/// Offline EVM only: no fork, RPC, scripts, signing keys or broadcasts.
contract PlanBSprint1Test is InsurancePoolTest {
    function _fresh() internal returns (uint64 start, uint64 end) {
        vm.warp(1_795_000_000);
        vm.prank(lp);
        pool.deposit(2_000_000);
        start = uint64(block.timestamp + 900);
        end = start + 1 days;
        vm.prank(agent);
        pool.bindPolicy(POLICY_ID, TERMS_HASH, beneficiary, 10_000, 1_000_000, start, end);
    }

    function test_planB_freshPolicyAuthorizedNetLossAndConservation() public {
        (uint64 start,) = _fresh();
        // Reviewed loss 1.00 - deductible .10 - prior .10 - recovery .20 = .60 USDC.
        uint256 payableAmount = 1_000_000 - 100_000 - 100_000 - 200_000;
        assertEq(pool.totalAssets(), 2_010_000);
        assertEq(pool.totalReserved(), 1_000_000);
        uint256 availableBefore = pool.availableCapital();
        uint256 recipientBefore = usdc.balanceOf(beneficiary);
        vm.warp(start + 60);
        _settle(CLAIM_ID, LOSS_KEY, payableAmount, 1_000_000);
        assertEq(usdc.balanceOf(beneficiary) - recipientBefore, 600_000);
        assertEq(pool.totalAssets(), 1_410_000);
        assertEq(pool.totalReserved(), 400_000);
        assertEq(pool.availableCapital(), availableBefore);
        assertEq(usdc.balanceOf(address(pool)), pool.totalAssets());
        assertTrue(pool.settledClaims(CLAIM_ID));
        (bytes32 policyId, uint256 cap, uint256 paid, bool exists) = pool.losses(LOSS_KEY);
        assertTrue(exists);
        assertEq(policyId, POLICY_ID);
        assertEq(cap, 1_000_000);
        assertEq(paid, 600_000);
        pool.assertSolvent();
        vm.expectRevert(InsurancePool.ClaimAlreadySettled.selector);
        _settle(CLAIM_ID, LOSS_KEY, payableAmount, 1_000_000);
    }

    function test_planB_exactDeadlineWorksButOneSecondLateFails() public {
        (, uint64 end) = _fresh();
        vm.warp(end);
        _settle(CLAIM_ID, LOSS_KEY, 600_000, 1_000_000);
        vm.warp(end + 1);
        vm.expectRevert(InsurancePool.CoverageExpired.selector);
        _settle(keccak256("late"), LOSS_KEY, 1, 1_000_000);
        assertEq(pool.totalReserved(), 400_000);
        assertEq(pool.totalAssets(), 1_410_000);
        pool.assertSolvent();
    }

    function testFuzz_planB_payoutPreservesFreeCapital(uint256 amount) public {
        (uint64 start,) = _fresh();
        amount = bound(amount, 1, 1_000_000);
        vm.warp(start);
        uint256 assetsBefore = pool.totalAssets();
        uint256 reservedBefore = pool.totalReserved();
        uint256 availableBefore = pool.availableCapital();
        _settle(CLAIM_ID, LOSS_KEY, amount, 1_000_000);
        assertEq(pool.totalAssets(), assetsBefore - amount);
        assertEq(pool.totalReserved(), reservedBefore - amount);
        assertEq(pool.availableCapital(), availableBefore);
        pool.assertSolvent();
    }
}
