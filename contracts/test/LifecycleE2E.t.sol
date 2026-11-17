// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {InsurancePool} from "../src/InsurancePool.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {LossKey} from "../src/LossKey.sol";

/**
 * Deterministic local-chain financial lifecycle.
 * Verifies ERC-20 balance deltas and receipts (via recorded logs / success).
 * Does not claim Arc Testnet deployment.
 */
contract LifecycleE2ETest is Test {
    MockUSDC internal usdc;
    InsurancePool internal pool;

    address internal authority = makeAddr("authority");
    address internal feeRecipient = makeAddr("fee");
    address internal lp = makeAddr("lp");
    address internal agent = makeAddr("agent");
    address internal beneficiary = makeAddr("beneficiary");

    uint256 internal constant ONE = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        pool = new InsurancePool(address(usdc), authority, feeRecipient);
        usdc.mint(lp, 100_000 * ONE);
        usdc.mint(agent, 10_000 * ONE);
        vm.prank(lp);
        usdc.approve(address(pool), type(uint256).max);
        vm.prank(agent);
        usdc.approve(address(pool), type(uint256).max);
    }

    function test_fullLifecycleWithInvalidClaimAndBlockedWithdraw() public {
        uint256 depositAmt = 20_000 * ONE;
        uint256 premium = 50 * ONE;
        uint256 limit = 5_000 * ONE;
        uint256 payout = 1_500 * ONE;
        bytes32 policyId = keccak256("e2e-policy");

        uint256 lpBefore = usdc.balanceOf(lp);
        uint256 agentBefore = usdc.balanceOf(agent);
        uint256 beneBefore = usdc.balanceOf(beneficiary);

        vm.prank(lp);
        assertEq(pool.deposit(depositAmt), depositAmt);
        assertEq(usdc.balanceOf(lp), lpBefore - depositAmt);

        vm.prank(agent);
        pool.bindPolicy(
            policyId,
            keccak256("e2e-terms"),
            beneficiary,
            premium,
            limit,
            uint64(block.timestamp),
            uint64(block.timestamp + 14 days)
        );
        assertEq(usdc.balanceOf(agent), agentBefore - premium);
        assertEq(pool.totalReserved(), limit);

        // Cache shares before expectRevert — view calls also consume the cheatcode.
        uint256 lpShares = pool.sharesOf(lp);
        vm.prank(lp);
        vm.expectRevert(InsurancePool.InsufficientAvailableCapital.selector);
        pool.withdraw(lpShares);

        bytes32 lossKey = LossKey.compute(
            block.chainid,
            policyId,
            keccak256("exposure-primary"),
            keccak256("synthetic:oracle-liq:fixture"),
            keccak256("loss-lot-v1")
        );

        // Invalid: non-authority cannot settle (synthetic incident still needs authorized settlement).
        vm.prank(agent);
        vm.expectRevert(InsurancePool.UnauthorizedClaimsAuthority.selector);
        pool.settleClaim(policyId, keccak256("bad-claim"), lossKey, payout, payout, beneficiary);

        vm.prank(authority);
        pool.settleClaim(policyId, keccak256("claim-ok"), lossKey, payout, payout, beneficiary);

        assertEq(usdc.balanceOf(beneficiary), beneBefore + payout);
        assertEq(pool.totalAssets(), depositAmt + premium - payout);
        assertEq(pool.totalReserved(), limit - payout);

        // Same economic loss, new claimId — blocked once lossCap is exhausted.
        vm.prank(authority);
        vm.expectRevert(InsurancePool.PayoutExceedsLossCap.selector);
        pool.settleClaim(policyId, keccak256("claim-dup"), lossKey, 1, payout, beneficiary);

        pool.assertSolvent();
        assertEq(
            usdc.balanceOf(lp) + usdc.balanceOf(agent) + usdc.balanceOf(beneficiary)
                + usdc.balanceOf(address(pool)),
            usdc.totalSupply()
        );
    }
}
