// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Errors} from "./lib/Errors.sol";
import {InterestMath} from "./lib/InterestMath.sol";
import {FixedPointMath} from "./lib/FixedPointMath.sol";

contract LoanVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct DebtTerms {
        address borrower;
        bytes32 assetId;
        address assetToken;
        uint256 originalPrincipal;
        uint32 rateNumerator;
        uint64 rateDenominator;
        uint64 startTime;
        uint64 settlementDeadline;
        uint256 snapshotCollateral;
        uint128 snapshotMultiplierNumerator;
        uint128 snapshotMultiplierDenominator;
    }

    struct DebtRecord {
        DebtTerms terms;
        uint256 cumulativeDebtReduction;
        bool closed;
    }

    struct Claim {
        address owner;
        uint256 receiptId;
        uint256 snapshotShares;
        uint128 reportMultiplierNumerator;
        uint128 reportMultiplierDenominator;
        uint64 maturesAt;
        bool withdrawn;
    }

    address public immutable owner;
    address public coverManager;
    mapping(uint256 receiptId => DebtRecord record) private _debts;
    mapping(uint256 receiptId => uint256 tokenUnits) public backingOf;
    mapping(address token => uint256 tokenUnits) public accountedBacking;
    mapping(uint256 receiptId => uint256 shares) public remainingSnapshotShares;
    mapping(uint256 claimId => Claim claim) private _claims;
    uint256 public nextClaimId = 1;

    error InsufficientBacking();
    error ZeroDelivery();
    error InvalidClaim();
    error ClaimNotMature();

    modifier onlyManager() {
        if (coverManager == address(0)) revert Errors.NotInitialized();
        if (msg.sender != coverManager) revert Errors.UnauthorizedManager(msg.sender);
        _;
    }

    constructor(address owner_) {
        if (owner_ == address(0)) revert Errors.ZeroAddress();
        owner = owner_;
    }

    function initialize(address manager) external {
        if (msg.sender != owner) revert Errors.Unauthorized(msg.sender);
        if (coverManager != address(0)) revert Errors.AlreadyInitialized();
        if (manager == address(0)) revert Errors.ZeroAddress();
        coverManager = manager;
    }

    function createDebt(uint256 receiptId, DebtTerms calldata terms) external nonReentrant onlyManager {
        if (receiptId == 0 || _debts[receiptId].terms.borrower != address(0)) revert Errors.InvalidReceiptId();
        if (terms.borrower == address(0) || terms.assetToken == address(0)) revert Errors.ZeroAddress();
        if (terms.assetId == bytes32(0)) revert Errors.ZeroAssetId();
        if (terms.originalPrincipal == 0) revert Errors.UnsupportedCashAmount();
        if (terms.snapshotCollateral == 0 || terms.snapshotCollateral > type(uint128).max) {
            revert Errors.UnsupportedShareAmount();
        }
        if (terms.snapshotMultiplierNumerator == 0 || terms.snapshotMultiplierDenominator == 0) {
            revert Errors.InvalidMultiplier();
        }
        // forge-lint: disable-next-line(block-timestamp)
        if (terms.startTime != block.timestamp || terms.settlementDeadline <= terms.startTime) {
            revert Errors.InvalidTimeRange();
        }
        // Reject loans whose maximum funded debt cannot be represented by InterestMath.
        InterestMath.debt(
            terms.originalPrincipal,
            terms.rateNumerator,
            terms.startTime,
            terms.settlementDeadline,
            terms.settlementDeadline,
            terms.rateDenominator,
            0
        );
        _debts[receiptId].terms = terms;
        remainingSnapshotShares[receiptId] = terms.snapshotCollateral;
        backingOf[receiptId] = terms.snapshotCollateral;
        accountedBacking[terms.assetToken] += terms.snapshotCollateral;
        _pullExact(IERC20(terms.assetToken), terms.borrower, terms.snapshotCollateral);
    }

    function debtOf(uint256 receiptId) public view returns (uint256) {
        DebtRecord storage record = _requireDebt(receiptId);
        if (record.closed) return 0;
        // Safe: past the uint64 deadline, the capped timestamp is the deadline itself.
        // forge-lint: disable-next-line(block-timestamp)
        uint64 timestamp = block.timestamp >= record.terms.settlementDeadline
            ? record.terms.settlementDeadline
            : uint64(block.timestamp);
        DebtTerms storage t = record.terms;
        return InterestMath.debt(
            t.originalPrincipal,
            t.rateNumerator,
            t.startTime,
            t.settlementDeadline,
            timestamp,
            t.rateDenominator,
            record.cumulativeDebtReduction
        );
    }

    function getDebt(uint256 receiptId) external view returns (DebtRecord memory) {
        return _requireDebt(receiptId);
    }

    function reduceDebt(uint256 receiptId, uint256 newCumulativeReduction)
        external
        onlyManager
        returns (uint256 applied)
    {
        DebtRecord storage record = _requireDebt(receiptId);
        if (record.closed || newCumulativeReduction <= record.cumulativeDebtReduction) {
            revert Errors.InvalidDebtApplied();
        }
        applied = newCumulativeReduction - record.cumulativeDebtReduction;
        uint256 debt = debtOf(receiptId);
        if (applied > debt) revert Errors.InvalidDebtApplied();
        record.cumulativeDebtReduction = newCumulativeReduction;
        if (applied == debt) record.closed = true;
    }

    function topUpBacking(uint256 receiptId, address from, uint256 amount) external nonReentrant onlyManager {
        address token = _requireDebt(receiptId).terms.assetToken;
        if (from == address(0)) revert Errors.ZeroAddress();
        if (amount == 0) revert ZeroDelivery();
        backingOf[receiptId] += amount;
        accountedBacking[token] += amount;
        _pullExact(IERC20(token), from, amount);
    }

    /// @notice Assign separately minted/donated tokens; already-accounted balances cannot be reused.
    function creditBackingFromSurplus(uint256 receiptId, uint256 amount) external nonReentrant onlyManager {
        address token = _requireDebt(receiptId).terms.assetToken;
        if (amount == 0) revert ZeroDelivery();
        uint256 actual = IERC20(token).balanceOf(address(this));
        uint256 accounted = accountedBacking[token];
        if (actual < accounted || amount > actual - accounted) revert InsufficientBacking();
        backingOf[receiptId] += amount;
        accountedBacking[token] = accounted + amount;
    }

    function addCollateral(uint256 receiptId, address from, uint256 shares, uint128 reportN, uint128 reportD)
        external
        nonReentrant
        onlyManager
    {
        DebtRecord storage record = _requireDebt(receiptId);
        if (record.closed) revert Errors.InvalidDebtApplied();
        if (from == address(0)) revert Errors.ZeroAddress();
        uint256 remaining = remainingSnapshotShares[receiptId] + shares;
        if (remaining > type(uint128).max) revert Errors.UnsupportedShareAmount();
        uint256 units = _convertedUnits(record.terms, shares, reportN, reportD);
        remainingSnapshotShares[receiptId] = remaining;
        backingOf[receiptId] += units;
        accountedBacking[record.terms.assetToken] += units;
        _pullExact(IERC20(record.terms.assetToken), from, units);
    }

    function releaseCollateral(uint256 receiptId, address to, uint256 shares, uint128 reportN, uint128 reportD)
        external
        nonReentrant
        onlyManager
    {
        DebtRecord storage record = _requireDebt(receiptId);
        if (shares > remainingSnapshotShares[receiptId]) revert Errors.InvalidExerciseShares();
        uint256 units = _convertedUnits(record.terms, shares, reportN, reportD);
        remainingSnapshotShares[receiptId] -= shares;
        _debitBacking(receiptId, record.terms.assetToken, units);
        _pushExact(IERC20(record.terms.assetToken), to, units);
    }

    /// @dev The bound manager authenticates report multipliers. No token call is made during exercise.
    function recordClaim(
        uint256 receiptId,
        address buyer,
        uint256 shares,
        uint128 reportN,
        uint128 reportD,
        uint64 maturesAt
    ) external onlyManager returns (uint256 claimId) {
        _requireDebt(receiptId);
        if (buyer == address(0)) revert Errors.ZeroAddress();
        if (shares == 0 || shares > remainingSnapshotShares[receiptId]) revert Errors.InvalidExerciseShares();
        if (reportN == 0 || reportD == 0) revert Errors.InvalidMultiplier();
        remainingSnapshotShares[receiptId] -= shares;
        claimId = nextClaimId++;
        _claims[claimId] = Claim(buyer, receiptId, shares, reportN, reportD, maturesAt, false);
    }

    function getClaim(uint256 claimId) external view returns (Claim memory) {
        if (_claims[claimId].owner == address(0)) revert InvalidClaim();
        return _claims[claimId];
    }

    function withdrawClaim(uint256 claimId, address to) external nonReentrant returns (uint256 units) {
        Claim storage claim = _claims[claimId];
        if (claim.owner != msg.sender || claim.withdrawn) revert InvalidClaim();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < claim.maturesAt) revert ClaimNotMature();
        DebtTerms storage terms = _debts[claim.receiptId].terms;
        units = _convertedUnits(
            terms, claim.snapshotShares, claim.reportMultiplierNumerator, claim.reportMultiplierDenominator
        );
        claim.withdrawn = true;
        _debitBacking(claim.receiptId, terms.assetToken, units);
        _pushExact(IERC20(terms.assetToken), to, units);
    }

    function _convertedUnits(DebtTerms storage terms, uint256 shares, uint128 reportN, uint128 reportD)
        private
        view
        returns (uint256 units)
    {
        if (shares == 0 || shares > type(uint128).max) revert Errors.UnsupportedShareAmount();
        if (reportN == 0 || reportD == 0) revert Errors.InvalidMultiplier();
        // Each multiplier product fits 256 bits. mulDiv handles the full 384-bit numerator
        // with a single final floor; no intermediate truncation or overflow.
        units = FixedPointMath.mulDivDown(
            shares,
            uint256(reportN) * terms.snapshotMultiplierDenominator,
            uint256(reportD) * terms.snapshotMultiplierNumerator
        );
        if (units == 0) revert ZeroDelivery();
    }

    function _debitBacking(uint256 receiptId, address token, uint256 units) private {
        if (units > backingOf[receiptId] || units > IERC20(token).balanceOf(address(this))) {
            revert InsufficientBacking();
        }
        backingOf[receiptId] -= units;
        accountedBacking[token] -= units;
    }

    function _pushExact(IERC20 token, address to, uint256 amount) private {
        if (to == address(0)) revert Errors.ZeroAddress();
        if (to == address(this)) revert Errors.InvalidTokenBalanceDelta(amount, 0);
        uint256 senderBefore = token.balanceOf(address(this));
        uint256 recipientBefore = token.balanceOf(to);
        token.safeTransfer(to, amount);
        uint256 senderAfter = token.balanceOf(address(this));
        uint256 recipientAfter = token.balanceOf(to);
        uint256 spent = senderBefore >= senderAfter ? senderBefore - senderAfter : 0;
        uint256 received = recipientAfter >= recipientBefore ? recipientAfter - recipientBefore : 0;
        if (spent != amount) revert Errors.InvalidTokenBalanceDelta(amount, spent);
        if (received != amount) revert Errors.InvalidTokenBalanceDelta(amount, received);
    }

    function _requireDebt(uint256 receiptId) private view returns (DebtRecord storage record) {
        record = _debts[receiptId];
        if (record.terms.borrower == address(0)) revert Errors.InvalidReceiptId();
    }

    function _pullExact(IERC20 token, address from, uint256 amount) private {
        if (from == address(this)) revert Errors.InvalidTokenBalanceDelta(amount, 0);
        uint256 senderBefore = token.balanceOf(from);
        uint256 recipientBefore = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        uint256 senderAfter = token.balanceOf(from);
        uint256 recipientAfter = token.balanceOf(address(this));
        uint256 spent = senderBefore >= senderAfter ? senderBefore - senderAfter : 0;
        uint256 received = recipientAfter >= recipientBefore ? recipientAfter - recipientBefore : 0;
        if (spent != amount) revert Errors.InvalidTokenBalanceDelta(amount, spent);
        if (received != amount) revert Errors.InvalidTokenBalanceDelta(amount, received);
    }
}
