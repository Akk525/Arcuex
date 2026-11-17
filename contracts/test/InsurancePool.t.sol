// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {InsurancePool} from "../src/InsurancePool.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {LossKey} from "../src/LossKey.sol";

contract InsurancePoolTest is Test {
    MockUSDC internal usdc;
    InsurancePool internal pool;

    address internal authority = makeAddr("authority");
    address internal feeRecipient = makeAddr("fee");
    address internal lp = makeAddr("lp");
    address internal agent = makeAddr("agent");
    address internal beneficiary = makeAddr("beneficiary");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant ONE_USDC = 1e6;
    bytes32 internal constant POLICY_ID = keccak256("policy-1");
    bytes32 internal constant TERMS_HASH = keccak256("terms-v1");
    bytes32 internal constant CLAIM_ID = keccak256("claim-1");
    bytes32 internal constant LOSS_KEY = keccak256("loss-lot-1");

    function setUp() public {
        usdc = new MockUSDC();
        pool = new InsurancePool(address(usdc), authority, feeRecipient);

        usdc.mint(lp, 1_000_000 * ONE_USDC);
        usdc.mint(agent, 100_000 * ONE_USDC);

        vm.prank(lp);
        usdc.approve(address(pool), type(uint256).max);
        vm.prank(agent);
        usdc.approve(address(pool), type(uint256).max);
    }

    function _bindHappyPath(uint256 limit, uint256 premium) internal {
        vm.prank(lp);
        pool.deposit(limit + 10_000 * ONE_USDC);

        uint64 start = uint64(block.timestamp);
        uint64 end = uint64(block.timestamp + 7 days);

        vm.prank(agent);
        pool.bindPolicy(POLICY_ID, TERMS_HASH, beneficiary, premium, limit, start, end);
    }

    function _settle(bytes32 claimId, bytes32 lossKey, uint256 amount, uint256 lossCap) internal {
        vm.prank(authority);
        pool.settleClaim(POLICY_ID, claimId, lossKey, amount, lossCap, beneficiary);
    }

    function test_depositMintsOneToOneShares() public {
        vm.prank(lp);
        uint256 shares = pool.deposit(5_000 * ONE_USDC);
        assertEq(shares, 5_000 * ONE_USDC);
        assertEq(pool.sharesOf(lp), shares);
        assertEq(pool.totalAssets(), shares);
        assertEq(pool.availableCapital(), shares);
        pool.assertSolvent();
    }

    function test_bindReservesFullLimitAndCollectsPremium() public {
        uint256 limit = 10_000 * ONE_USDC;
        uint256 premium = 100 * ONE_USDC;
        _bindHappyPath(limit, premium);

        (
            bytes32 termsHash,
            address bene,
            address payer,
            uint256 polLimit,
            uint256 polPremium,
            ,
            ,
            uint256 reserved,
            uint256 paidOut,
            bool bound,
            bool cancelled
        ) = pool.policies(POLICY_ID);

        assertTrue(bound);
        assertFalse(cancelled);
        assertEq(termsHash, TERMS_HASH);
        assertEq(bene, beneficiary);
        assertEq(payer, agent);
        assertEq(polLimit, limit);
        assertEq(polPremium, premium);
        assertEq(reserved, limit);
        assertEq(paidOut, 0);
        assertEq(pool.totalReserved(), limit);
        assertEq(pool.sharesOf(feeRecipient), premium);
        pool.assertSolvent();
    }

    function test_bindRevertsWhenUnderfunded() public {
        vm.prank(lp);
        pool.deposit(1_000 * ONE_USDC);

        vm.prank(agent);
        vm.expectRevert(InsurancePool.InsufficientAvailableCapital.selector);
        pool.bindPolicy(
            POLICY_ID,
            TERMS_HASH,
            beneficiary,
            10 * ONE_USDC,
            5_000 * ONE_USDC,
            uint64(block.timestamp),
            uint64(block.timestamp + 1 days)
        );
    }

    function test_withdrawRestrictedWhileReserved() public {
        uint256 limit = 10_000 * ONE_USDC;
        _bindHappyPath(limit, 50 * ONE_USDC);

        uint256 lpShares = pool.sharesOf(lp);
        vm.prank(lp);
        vm.expectRevert(InsurancePool.InsufficientAvailableCapital.selector);
        pool.withdraw(lpShares);
    }

    function test_settleClaimPaysBeneficiary() public {
        uint256 limit = 10_000 * ONE_USDC;
        _bindHappyPath(limit, 100 * ONE_USDC);

        uint256 payout = 2_500 * ONE_USDC;
        uint256 beforeBal = usdc.balanceOf(beneficiary);

        _settle(CLAIM_ID, LOSS_KEY, payout, payout);

        assertEq(usdc.balanceOf(beneficiary), beforeBal + payout);
        assertTrue(pool.settledClaims(CLAIM_ID));
        (,,,,,,, uint256 reserved, uint256 paidOut,,) = pool.policies(POLICY_ID);
        assertEq(paidOut, payout);
        assertEq(reserved, limit - payout);
        assertEq(pool.totalReserved(), limit - payout);
        (,, uint256 lossPaid, bool exists) = pool.losses(LOSS_KEY);
        assertTrue(exists);
        assertEq(lossPaid, payout);
        pool.assertSolvent();
    }

    function test_duplicateClaimReverts() public {
        _bindHappyPath(5_000 * ONE_USDC, 50 * ONE_USDC);

        _settle(CLAIM_ID, LOSS_KEY, 100 * ONE_USDC, 500 * ONE_USDC);
        vm.prank(authority);
        vm.expectRevert(InsurancePool.ClaimAlreadySettled.selector);
        pool.settleClaim(POLICY_ID, CLAIM_ID, LOSS_KEY, 100 * ONE_USDC, 500 * ONE_USDC, beneficiary);
    }

    function test_sameLossDifferentClaimIdsPartialThenCap() public {
        _bindHappyPath(10_000 * ONE_USDC, 50 * ONE_USDC);
        uint256 lossCap = 1_000 * ONE_USDC;

        _settle(keccak256("claim-a"), LOSS_KEY, 400 * ONE_USDC, lossCap);
        _settle(keccak256("claim-b"), LOSS_KEY, 600 * ONE_USDC, lossCap);

        (,, uint256 paid,) = pool.losses(LOSS_KEY);
        assertEq(paid, lossCap);

        vm.prank(authority);
        vm.expectRevert(InsurancePool.PayoutExceedsLossCap.selector);
        pool.settleClaim(
            POLICY_ID, keccak256("claim-c"), LOSS_KEY, 1, lossCap, beneficiary
        );
    }

    function test_sameLossRejectsInflatedCap() public {
        _bindHappyPath(5_000 * ONE_USDC, 50 * ONE_USDC);
        _settle(keccak256("c1"), LOSS_KEY, 100 * ONE_USDC, 500 * ONE_USDC);

        vm.prank(authority);
        vm.expectRevert(InsurancePool.LossCapMismatch.selector);
        pool.settleClaim(
            POLICY_ID, keccak256("c2"), LOSS_KEY, 100 * ONE_USDC, 9_000 * ONE_USDC, beneficiary
        );
    }

    function test_lossKeyBoundToPolicy() public {
        _bindHappyPath(5_000 * ONE_USDC, 50 * ONE_USDC);
        _settle(keccak256("c1"), LOSS_KEY, 100 * ONE_USDC, 500 * ONE_USDC);

        bytes32 policy2 = keccak256("policy-2");
        vm.prank(agent);
        pool.bindPolicy(
            policy2,
            keccak256("terms-2"),
            beneficiary,
            10 * ONE_USDC,
            1_000 * ONE_USDC,
            uint64(block.timestamp),
            uint64(block.timestamp + 7 days)
        );

        vm.prank(authority);
        vm.expectRevert(InsurancePool.LossPolicyMismatch.selector);
        pool.settleClaim(
            policy2, keccak256("c2"), LOSS_KEY, 100 * ONE_USDC, 500 * ONE_USDC, beneficiary
        );
    }

    function test_lossKeyComputationStable() public {
        bytes32 a = LossKey.compute(5042002, POLICY_ID, keccak256("exp"), keccak256("inc"), keccak256("lot"));
        bytes32 b = LossKey.compute(5042002, POLICY_ID, keccak256("exp"), keccak256("inc"), keccak256("lot"));
        assertEq(a, b);
        assertTrue(
            a
                != LossKey.compute(
                    5042002, POLICY_ID, keccak256("exp"), keccak256("inc"), keccak256("other-lot")
                )
        );
    }

    function test_wrongBeneficiaryReverts() public {
        _bindHappyPath(5_000 * ONE_USDC, 50 * ONE_USDC);

        vm.prank(authority);
        vm.expectRevert(InsurancePool.InvalidBeneficiary.selector);
        pool.settleClaim(POLICY_ID, CLAIM_ID, LOSS_KEY, 100 * ONE_USDC, 100 * ONE_USDC, stranger);
    }

    function test_payoutCapReverts() public {
        uint256 limit = 1_000 * ONE_USDC;
        _bindHappyPath(limit, 10 * ONE_USDC);

        vm.prank(authority);
        vm.expectRevert(InsurancePool.PayoutExceedsRemainingLimit.selector);
        pool.settleClaim(POLICY_ID, CLAIM_ID, LOSS_KEY, limit + 1, limit + 1, beneficiary);
    }

    function test_unauthorizedSettleReverts() public {
        _bindHappyPath(1_000 * ONE_USDC, 10 * ONE_USDC);

        vm.prank(stranger);
        vm.expectRevert(InsurancePool.UnauthorizedClaimsAuthority.selector);
        pool.settleClaim(POLICY_ID, CLAIM_ID, LOSS_KEY, 10 * ONE_USDC, 10 * ONE_USDC, beneficiary);
    }

    function test_expiredCoverageReverts() public {
        _bindHappyPath(1_000 * ONE_USDC, 10 * ONE_USDC);
        vm.warp(block.timestamp + 8 days);

        vm.prank(authority);
        vm.expectRevert(InsurancePool.CoverageExpired.selector);
        pool.settleClaim(POLICY_ID, CLAIM_ID, LOSS_KEY, 10 * ONE_USDC, 10 * ONE_USDC, beneficiary);
    }

    function test_releaseReservationThenWithdraw() public {
        uint256 limit = 10_000 * ONE_USDC;
        _bindHappyPath(limit, 50 * ONE_USDC);

        vm.prank(authority);
        pool.releaseReservation(POLICY_ID);

        assertEq(pool.totalReserved(), 0);
        uint256 free = pool.availableCapital();
        assertGt(free, 0);

        uint256 lpShares = pool.sharesOf(lp);
        uint256 before = usdc.balanceOf(lp);
        vm.prank(lp);
        uint256 out = pool.withdraw(lpShares);
        assertEq(usdc.balanceOf(lp), before + out);
        pool.assertSolvent();
    }

    function test_bindIsImmutableCommitment() public {
        _bindHappyPath(1_000 * ONE_USDC, 10 * ONE_USDC);

        vm.prank(agent);
        vm.expectRevert(InsurancePool.PolicyAlreadyBound.selector);
        pool.bindPolicy(
            POLICY_ID,
            keccak256("other-terms"),
            beneficiary,
            10 * ONE_USDC,
            1_000 * ONE_USDC,
            uint64(block.timestamp),
            uint64(block.timestamp + 1 days)
        );
    }

    function test_coverageNotStartedReverts() public {
        uint256 limit = 1_000 * ONE_USDC;
        vm.prank(lp);
        pool.deposit(limit + 1_000 * ONE_USDC);

        uint64 start = uint64(block.timestamp + 1 days);
        uint64 end = uint64(block.timestamp + 7 days);
        vm.prank(agent);
        pool.bindPolicy(POLICY_ID, TERMS_HASH, beneficiary, 10 * ONE_USDC, limit, start, end);

        vm.prank(authority);
        vm.expectRevert(InsurancePool.CoverageNotStarted.selector);
        pool.settleClaim(POLICY_ID, CLAIM_ID, LOSS_KEY, 10 * ONE_USDC, 10 * ONE_USDC, beneficiary);
    }

    function test_premiumSharesUseNavAfterLoss() public {
        uint256 limit = 5_000 * ONE_USDC;
        _bindHappyPath(limit, 50 * ONE_USDC);

        _settle(CLAIM_ID, LOSS_KEY, 2_000 * ONE_USDC, 2_000 * ONE_USDC);

        uint256 assetsBefore = pool.totalAssets();
        uint256 sharesBefore = pool.totalShares();
        uint256 feeBefore = pool.sharesOf(feeRecipient);

        bytes32 policy2 = keccak256("policy-2");
        uint256 premium2 = 100 * ONE_USDC;
        vm.prank(agent);
        pool.bindPolicy(
            policy2,
            keccak256("terms-2"),
            beneficiary,
            premium2,
            500 * ONE_USDC,
            uint64(block.timestamp),
            uint64(block.timestamp + 7 days)
        );

        uint256 expectedFeeShares = (premium2 * sharesBefore) / assetsBefore;
        assertEq(pool.sharesOf(feeRecipient), feeBefore + expectedFeeShares);
        pool.assertSolvent();
    }

    function test_conservationAcrossLifecycle() public {
        uint256 limit = 8_000 * ONE_USDC;
        uint256 premium = 80 * ONE_USDC;
        uint256 depositAmt = 20_000 * ONE_USDC;

        uint256 startSupply = usdc.totalSupply();
        vm.prank(lp);
        pool.deposit(depositAmt);

        vm.prank(agent);
        pool.bindPolicy(
            POLICY_ID,
            TERMS_HASH,
            beneficiary,
            premium,
            limit,
            uint64(block.timestamp),
            uint64(block.timestamp + 30 days)
        );

        uint256 payout = 3_000 * ONE_USDC;
        _settle(CLAIM_ID, LOSS_KEY, payout, payout);

        uint256 accounted = usdc.balanceOf(address(pool)) + usdc.balanceOf(beneficiary)
            + usdc.balanceOf(lp) + usdc.balanceOf(agent);
        assertEq(accounted, startSupply);
        assertEq(usdc.balanceOf(address(pool)), pool.totalAssets());
        pool.assertSolvent();
    }
}
