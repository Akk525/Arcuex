// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title InsurancePool
 * @notice Policy-agnostic, fully collateralized USDC insurance vault.
 * @dev Accounting uses 6-decimal ERC-20 USDC only. Do not mix Arc native
 *      18-decimal msg.value into pool math (docs.arc.io evm-differences).
 *
 * Trust boundary: only `claimsAuthority` may settle or release. No on-chain
 * AI/majority-vote role. Coverage evidence stays off-chain.
 */
contract InsurancePool is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAmount();
    error ZeroAddress();
    error InsufficientAvailableCapital();
    error InsufficientShares();
    error PolicyAlreadyBound();
    error PolicyNotBound();
    error PolicyCancelled();
    error InvalidCoverageWindow();
    error CoverageNotStarted();
    error CoverageExpired();
    error UnderfundedReservation();
    error UnauthorizedClaimsAuthority();
    error ClaimAlreadySettled();
    error InvalidBeneficiary();
    error PayoutExceedsRemainingLimit();
    error PayoutExceedsReservation();
    error NothingToRelease();

    struct Policy {
        bytes32 termsHash;
        address beneficiary;
        address premiumPayer;
        uint256 limit;
        uint256 premium;
        uint64 coverageStart;
        uint64 coverageEnd;
        uint256 reserved;
        uint256 paidOut;
        bool bound;
        bool cancelled;
    }

    IERC20 public immutable usdc;

    /// @notice Ops/rule key that may settle claims and release reservations. Never an LLM.
    address public claimsAuthority;

    /// @notice Receives LP-equivalent shares minted from collected premiums.
    address public feeRecipient;

    /// @dev Tracked USDC assets under pool control (must match balance under honest operation).
    uint256 public totalAssets;

    /// @dev Sum of active policy reservations (full-collateralization liabilities).
    uint256 public totalReserved;

    /// @dev Outstanding LP shares (1 share = 1 micro initially; NAV drops after losses).
    uint256 public totalShares;

    mapping(address => uint256) public sharesOf;
    mapping(bytes32 => Policy) public policies;
    mapping(bytes32 => bool) public settledClaims;

    event ClaimsAuthorityUpdated(address indexed previous, address indexed next);
    event FeeRecipientUpdated(address indexed previous, address indexed next);
    event Deposited(address indexed lp, uint256 assets, uint256 shares);
    event Withdrawn(address indexed lp, uint256 assets, uint256 shares);
    event PolicyBound(
        bytes32 indexed policyId,
        bytes32 termsHash,
        address indexed beneficiary,
        address indexed premiumPayer,
        uint256 premium,
        uint256 limit,
        uint64 coverageStart,
        uint64 coverageEnd
    );
    event ClaimSettled(
        bytes32 indexed policyId,
        bytes32 indexed claimId,
        address indexed beneficiary,
        uint256 amount
    );
    event ReservationReleased(bytes32 indexed policyId, uint256 amount);

    constructor(address usdc_, address claimsAuthority_, address feeRecipient_) Ownable(msg.sender) {
        if (usdc_ == address(0) || claimsAuthority_ == address(0) || feeRecipient_ == address(0)) {
            revert ZeroAddress();
        }
        usdc = IERC20(usdc_);
        claimsAuthority = claimsAuthority_;
        feeRecipient = feeRecipient_;
    }

    modifier onlyClaimsAuthority() {
        if (msg.sender != claimsAuthority) revert UnauthorizedClaimsAuthority();
        _;
    }

    function setClaimsAuthority(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        address previous = claimsAuthority;
        claimsAuthority = next;
        emit ClaimsAuthorityUpdated(previous, next);
    }

    function setFeeRecipient(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        address previous = feeRecipient;
        feeRecipient = next;
        emit FeeRecipientUpdated(previous, next);
    }

    /// @notice Free capital that can back new policies or LP withdrawals.
    function availableCapital() public view returns (uint256) {
        if (totalAssets < totalReserved) revert UnderfundedReservation();
        return totalAssets - totalReserved;
    }

    function deposit(uint256 amount) external nonReentrant returns (uint256 shares) {
        if (amount == 0) revert ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        // 1:1 when empty; afterward mint at current NAV (assets/shares).
        shares = totalShares == 0 ? amount : (amount * totalShares) / totalAssets;
        if (shares == 0) revert ZeroAmount();
        totalAssets += amount;
        totalShares += shares;
        sharesOf[msg.sender] += shares;
        emit Deposited(msg.sender, amount, shares);
    }

    function withdraw(uint256 shares) external nonReentrant returns (uint256 amount) {
        if (shares == 0) revert ZeroAmount();
        if (shares > sharesOf[msg.sender]) revert InsufficientShares();
        // Pro-rata of total assets; still capped by unreserved capital.
        amount = (shares * totalAssets) / totalShares;
        if (amount > availableCapital()) revert InsufficientAvailableCapital();
        sharesOf[msg.sender] -= shares;
        totalShares -= shares;
        totalAssets -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount, shares);
    }

    /**
     * @notice Collect premium and reserve full policy limit. Terms are immutable after bind.
     * @param policyId Canonical policy id (off-chain hashed commitment).
     * @param termsHash Hash of immutable coverage terms snapshot.
     */
    function bindPolicy(
        bytes32 policyId,
        bytes32 termsHash,
        address beneficiary,
        uint256 premium,
        uint256 limit,
        uint64 coverageStart,
        uint64 coverageEnd
    ) external nonReentrant {
        if (beneficiary == address(0)) revert ZeroAddress();
        if (premium == 0 || limit == 0) revert ZeroAmount();
        if (coverageEnd <= coverageStart) revert InvalidCoverageWindow();
        if (policies[policyId].bound) revert PolicyAlreadyBound();
        if (limit > availableCapital()) revert InsufficientAvailableCapital();

        usdc.safeTransferFrom(msg.sender, address(this), premium);

        // Premium increases pool assets; fee shares minted at current NAV (same as deposit).
        uint256 feeShares = totalShares == 0 ? premium : (premium * totalShares) / totalAssets;
        if (feeShares == 0) revert ZeroAmount();
        totalAssets += premium;
        totalShares += feeShares;
        sharesOf[feeRecipient] += feeShares;

        totalReserved += limit;

        policies[policyId] = Policy({
            termsHash: termsHash,
            beneficiary: beneficiary,
            premiumPayer: msg.sender,
            limit: limit,
            premium: premium,
            coverageStart: coverageStart,
            coverageEnd: coverageEnd,
            reserved: limit,
            paidOut: 0,
            bound: true,
            cancelled: false
        });

        emit PolicyBound(
            policyId, termsHash, beneficiary, msg.sender, premium, limit, coverageStart, coverageEnd
        );
    }

    /**
     * @notice Authorized claim payout. Anti-replay via claimId. Caps + beneficiary enforced.
     */
    function settleClaim(bytes32 policyId, bytes32 claimId, uint256 amount, address payoutTo)
        external
        nonReentrant
        onlyClaimsAuthority
    {
        if (amount == 0) revert ZeroAmount();
        if (settledClaims[claimId]) revert ClaimAlreadySettled();

        Policy storage policy = policies[policyId];
        if (!policy.bound) revert PolicyNotBound();
        if (policy.cancelled) revert PolicyCancelled();
        if (payoutTo != policy.beneficiary) revert InvalidBeneficiary();
        if (block.timestamp < policy.coverageStart) revert CoverageNotStarted();
        if (block.timestamp > policy.coverageEnd) revert CoverageExpired();

        uint256 remaining = policy.limit - policy.paidOut;
        if (amount > remaining) revert PayoutExceedsRemainingLimit();
        if (amount > policy.reserved) revert PayoutExceedsReservation();

        settledClaims[claimId] = true;
        policy.paidOut += amount;
        policy.reserved -= amount;
        totalReserved -= amount;
        totalAssets -= amount;

        usdc.safeTransfer(payoutTo, amount);
        emit ClaimSettled(policyId, claimId, payoutTo, amount);
    }

    /// @notice Release unused reservation after cancel or post-expiry cleanup.
    function releaseReservation(bytes32 policyId) external nonReentrant onlyClaimsAuthority {
        Policy storage policy = policies[policyId];
        if (!policy.bound) revert PolicyNotBound();
        uint256 amount = policy.reserved;
        if (amount == 0) revert NothingToRelease();
        policy.reserved = 0;
        policy.cancelled = true;
        totalReserved -= amount;
        emit ReservationReleased(policyId, amount);
    }

    /// @dev Solvency check for off-chain / invariant tests.
    function assertSolvent() external view {
        if (totalAssets < totalReserved) revert UnderfundedReservation();
        uint256 bal = usdc.balanceOf(address(this));
        if (bal < totalAssets) revert UnderfundedReservation();
    }
}
