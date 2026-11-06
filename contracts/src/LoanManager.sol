// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AssetRegistry} from "./AssetRegistry.sol";
import {SessionOracle} from "./SessionOracle.sol";
import {ProtectedPool, IPoolDebtProvider} from "./ProtectedPool.sol";
import {LoanVault} from "./LoanVault.sol";
import {Errors} from "./lib/Errors.sol";
import {FixedPointMath} from "./lib/FixedPointMath.sol";
import {LiquidationMath} from "./lib/LiquidationMath.sol";
import {Types} from "./lib/Types.sol";

/// @dev The coordinator releases commitments without calling back into LoanManager.
interface ILoanCoverCoordinator {
    function loanManager() external view returns (address);
    function coverOpensBeforeClose() external view returns (uint64);
    function coverCutoffBeforeClose() external view returns (uint64);
    function reservedShares(uint256 receiptId) external view returns (uint256);
    function releaseForLoanClosure(uint256 receiptId) external;
    function releaseForLiquidation(uint256 receiptId) external;
}

/// @notice Durable debt and custody authority. Cover receipts never originate a second loan.
contract LoanManager is ReentrancyGuard, IPoolDebtProvider {
    using SafeERC20 for IERC20;
    enum LoanStatus {
        NONE,
        ACTIVE,
        HANDOFF_PENDING,
        CLOSED
    }
    enum Transition {
        NONE,
        ORDINARY,
        ACTIVATING,
        SETTLING
    }

    struct BorrowRequest {
        bytes32 assetId;
        uint64 configVersion;
        bytes32 configHash;
        uint256 principal;
        uint256 collateralShares;
        address recipient;
        bytes32 referenceReportHash;
        uint64 expiry;
    }

    struct Loan {
        address borrower;
        address recipient;
        bytes32 assetId;
        uint64 configVersion;
        bytes32 configHash;
        Types.AssetConfig config;
        LoanStatus status;
        uint256 activeCoverId;
        bytes32 lastCoveredSessionId;
    }

    struct CoverSnapshot {
        address borrower;
        address recipient;
        bytes32 assetId;
        uint256 originalPrincipal;
        uint64 startTime;
        uint32 rateNumerator;
        uint64 rateDenominator;
        uint256 debtNow;
        uint256 debtAtDeadline;
        uint256 remainingCollateralShares;
        uint128 loanSnapshotMultiplierNumerator;
        uint128 loanSnapshotMultiplierDenominator;
        uint256 activeCoverId;
    }

    AssetRegistry public immutable registry;
    SessionOracle public immutable oracle;
    ProtectedPool public immutable pool;
    LoanVault public immutable vault;
    address public immutable owner;
    address public coverManager;
    uint256 public nextLoanId = 1;
    mapping(uint256 => Loan) private _loans;
    mapping(uint256 => uint64) public coverWindowOpensAt;
    mapping(uint256 => uint64) public coverWindowCutoffAt;
    // A receipt identity cannot be rebound, including after its loan is closed.
    mapping(uint256 => uint256) public loanOfReceipt;
    Transition private _transition;
    uint256 private _transitionLoan;

    error CashDebtTransition();
    error ComponentMismatch();
    error ConfigNotEffective();
    error ReferenceFactsMismatch();
    error RequestExpired();
    error LoanNotActive();
    error LoanNotPending();
    error InvalidBorrower();
    error InvalidCover();
    error InvalidCoverWindow();
    error CoverDeadlineReached();
    error CoveredCollateralReserved();
    error HandoffIncomplete();
    error SlippageExceeded();

    event LoanOpened(
        uint256 indexed loanId,
        address indexed borrower,
        bytes32 indexed assetId,
        address recipient,
        uint256 principal,
        uint256 collateralShares,
        uint64 startTime
    );
    event Repaid(uint256 indexed loanId, address indexed payer, uint256 amount, uint256 debtAfter);
    event CollateralAdded(uint256 indexed loanId, address indexed payer, uint256 snapshotShares);
    event CollateralWithdrawn(uint256 indexed loanId, address indexed borrower, uint256 snapshotShares);
    event ClaimCreated(uint256 indexed loanId, uint256 indexed claimId, address indexed owner, uint256 snapshotShares);
    event FinanciallyClosed(uint256 indexed loanId, uint256 borrowerClaimId);
    event HandoffPending(uint256 indexed loanId);
    event LoanClosed(uint256 indexed loanId);
    event Liquidated(
        uint256 indexed loanId, address indexed liquidator, uint256 repaid, uint256 seizedShares, uint256 claimId
    );
    event BadDebt(uint256 indexed loanId, uint256 amount);
    event RoundingDustReleased(uint256 indexed loanId, uint256 snapshotShares);

    modifier stable() {
        if (_transition != Transition.NONE) revert CashDebtTransition();
        _;
    }
    modifier onlyCover() {
        if (coverManager == address(0) || msg.sender != coverManager) revert Errors.UnauthorizedManager(msg.sender);
        _;
    }

    constructor(address registry_, address oracle_, address pool_, address vault_, address owner_) {
        if (
            registry_ == address(0) || oracle_ == address(0) || pool_ == address(0) || vault_ == address(0)
                || owner_ == address(0)
        ) revert Errors.ZeroAddress();
        registry = AssetRegistry(registry_);
        oracle = SessionOracle(oracle_);
        pool = ProtectedPool(pool_);
        vault = LoanVault(vault_);
        owner = owner_;
    }

    function bindCoverManager(address manager) external stable nonReentrant {
        if (msg.sender != owner) revert Errors.Unauthorized(msg.sender);
        if (coverManager != address(0)) revert Errors.AlreadyInitialized();
        if (manager == address(0)) revert Errors.ZeroAddress();
        if (manager.code.length == 0 || ILoanCoverCoordinator(manager).loanManager() != address(this)) {
            revert ComponentMismatch();
        }
        uint64 opens = ILoanCoverCoordinator(manager).coverOpensBeforeClose();
        uint64 cutoff = ILoanCoverCoordinator(manager).coverCutoffBeforeClose();
        if (!((opens == 7200 && cutoff == 1800) || (opens == 600 && cutoff == 60))) revert InvalidCoverWindow();
        coverManager = manager;
    }

    function borrow(BorrowRequest calldata request) external stable nonReentrant returns (uint256 loanId) {
        if (pool.coverManager() != address(this) || vault.coverManager() != address(this)) revert ComponentMismatch();
        if (request.recipient == address(0)) revert Errors.ZeroAddress();
        if (block.timestamp > request.expiry) revert RequestExpired();
        (Types.AssetConfig memory config, uint64 effectiveAt, bytes32 identity) =
            registry.getConfig(request.assetId, request.configVersion);
        if (effectiveAt > block.timestamp) revert ConfigNotEffective();
        if (identity != request.configHash) revert ReferenceFactsMismatch();
        uint8 decimals = IERC20Metadata(config.assetToken).decimals();
        if (
            config.stockTokenDecimals != 18 || decimals != 18 || config.cashTokenDecimals != pool.cashToken().decimals()
        ) {
            revert Errors.InvalidDecimals(decimals, config.cashTokenDecimals);
        }
        Types.ReferencePriceFact memory fact = oracle.requireFreshReference(request.assetId);
        if (fact.configHash != identity || fact.reportHash != request.referenceReportHash) {
            revert ReferenceFactsMismatch();
        }
        if (request.principal == 0 || request.principal > type(uint128).max) revert Errors.UnsupportedCashAmount();
        if (request.collateralShares == 0 || request.collateralShares > type(uint128).max) {
            revert Errors.UnsupportedShareAmount();
        }
        if (
            request.principal
                > LiquidationMath.debtLimit(request.collateralShares, fact.price, config.originationLtvBps)
        ) {
            revert Errors.BorrowerLtvTooHigh();
        }
        if (request.principal > pool.cashToken().balanceOf(address(pool))) {
            revert ProtectedPool.InsufficientLiquidity();
        }
        uint64 startTime = _now();
        loanId = nextLoanId++;
        _loans[loanId] = Loan(
            msg.sender,
            request.recipient,
            request.assetId,
            request.configVersion,
            identity,
            config,
            LoanStatus.ACTIVE,
            0,
            bytes32(0)
        );
        // The guard covers collateral and cash callbacks as well as registration/disbursement.
        _transition = Transition.ORDINARY;
        vault.createDebt(
            loanId,
            LoanVault.DebtTerms(
                msg.sender,
                request.assetId,
                config.assetToken,
                request.principal,
                config.rateNumerator,
                config.rateDenominator,
                startTime,
                0,
                request.collateralShares,
                fact.multiplierNumerator,
                fact.multiplierDenominator
            )
        );
        pool.registerLoan(loanId);
        pool.disburse(request.recipient, request.principal);
        _transition = Transition.NONE;
        emit LoanOpened(
            loanId,
            msg.sender,
            request.assetId,
            request.recipient,
            request.principal,
            request.collateralShares,
            startTime
        );
    }

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return _loan(loanId);
    }

    function debtOf(uint256 loanId) external view stable returns (uint256) {
        return vault.debtOf(loanId);
    }

    function repay(uint256 loanId, uint256 amount) external stable nonReentrant {
        Loan storage loan = _active(loanId);
        uint256 debt = vault.debtOf(loanId);
        if (amount == 0 || amount > debt) revert Errors.InvalidDebtApplied();
        _transition = Transition.ORDINARY;
        _pullRepayment(msg.sender, amount);
        _reduceDebt(loanId, amount);
        if (amount == debt) _releaseCover(loanId, loan, false);
        _transition = Transition.NONE;
        emit Repaid(loanId, msg.sender, amount, debt - amount);
        if (amount == debt) {
            (uint128 n, uint128 d) = _multipliers(loan.assetId);
            _financialClose(loanId, loan, n, d);
        }
    }

    function addCollateral(uint256 loanId, uint256 snapshotShares) external stable nonReentrant {
        Loan storage loan = _active(loanId);
        (uint128 n, uint128 d) = _multipliers(loan.assetId);
        _transition = Transition.ORDINARY;
        vault.addCollateral(loanId, msg.sender, snapshotShares, n, d);
        _transition = Transition.NONE;
        emit CollateralAdded(loanId, msg.sender, snapshotShares);
    }

    function withdrawCollateral(uint256 loanId, uint256 snapshotShares) external stable nonReentrant {
        Loan storage loan = _active(loanId);
        if (msg.sender != loan.borrower) revert InvalidBorrower();
        if (
            loan.activeCoverId != 0
                && (block.timestamp < coverWindowOpensAt[loanId] || block.timestamp >= coverWindowCutoffAt[loanId])
        ) revert InvalidCoverWindow();
        Types.ReferencePriceFact memory fact = oracle.requireFreshReference(loan.assetId);
        uint256 shares = vault.remainingSnapshotShares(loanId);
        if (snapshotShares == 0 || snapshotShares > shares) revert Errors.InvalidExerciseShares();
        if (
            loan.activeCoverId != 0
                && shares - snapshotShares < ILoanCoverCoordinator(coverManager).reservedShares(loan.activeCoverId)
        ) {
            revert CoveredCollateralReserved();
        }
        uint256 price = _loanPrice(loanId, fact);
        if (
            vault.debtOf(loanId)
                > LiquidationMath.debtLimit(shares - snapshotShares, price, loan.config.originationLtvBps)
        ) {
            revert Errors.BorrowerLtvTooHigh();
        }
        _transition = Transition.ORDINARY;
        vault.releaseCollateral(
            loanId, msg.sender, snapshotShares, fact.multiplierNumerator, fact.multiplierDenominator
        );
        _transition = Transition.NONE;
        emit CollateralWithdrawn(loanId, msg.sender, snapshotShares);
    }

    function topUpBacking(uint256 loanId, uint256 tokenUnits) external stable nonReentrant {
        if (_loan(loanId).status == LoanStatus.CLOSED) revert LoanNotPending();
        _transition = Transition.ORDINARY;
        vault.topUpBacking(loanId, msg.sender, tokenUnits);
        _transition = Transition.NONE;
    }

    function finalizeHandoff(uint256 loanId) external stable nonReentrant {
        Loan storage loan = _loan(loanId);
        if (msg.sender != loan.borrower) revert InvalidBorrower();
        if (loan.status != LoanStatus.HANDOFF_PENDING) revert LoanNotPending();
        if (vault.outstandingClaimUnits(loanId) != 0) revert HandoffIncomplete();
        _transition = Transition.ORDINARY;
        vault.releaseSurplus(loanId);
        loan.status = LoanStatus.CLOSED;
        _transition = Transition.NONE;
        emit LoanClosed(loanId);
    }

    function coverSnapshot(uint256 loanId, uint64 deadline) external view stable returns (CoverSnapshot memory) {
        _active(loanId);
        return _snapshot(loanId, deadline);
    }

    function beginCover(uint256 loanId, uint256 receiptId, bytes32 sessionId, uint64 deadline)
        external
        onlyCover
        stable
        nonReentrant
        returns (CoverSnapshot memory snapshot)
    {
        Loan storage loan = _active(loanId);
        if (
            receiptId == 0 || loan.activeCoverId != 0 || loanOfReceipt[receiptId] != 0
                || sessionId == loan.lastCoveredSessionId
        ) revert InvalidCover();
        Types.ReferencePriceFact memory fact = oracle.requireFreshReference(loan.assetId);
        if (fact.sessionId != sessionId) revert InvalidCover();
        Types.SessionFact memory session = oracle.sessionFact(sessionId);
        uint64 opens = ILoanCoverCoordinator(coverManager).coverOpensBeforeClose();
        uint64 cutoff = ILoanCoverCoordinator(coverManager).coverCutoffBeforeClose();
        if (
            session.scheduledClose < opens || block.timestamp < session.scheduledClose - opens
                || block.timestamp >= session.scheduledClose - cutoff || deadline <= session.scheduledClose
        ) revert InvalidCoverWindow();
        snapshot = _snapshot(loanId, deadline);
        if (snapshot.debtNow == 0) revert InvalidCover();
        if (
            snapshot.debtNow
                > LiquidationMath.debtLimit(
                    snapshot.remainingCollateralShares, _loanPrice(loanId, fact), loan.config.triggerLtvBps
                )
        ) {
            revert Errors.BorrowerLtvTooHigh();
        }
        if (snapshot.debtAtDeadline > type(uint128).max) revert Errors.UnsupportedCashAmount();
        _transition = Transition.ACTIVATING;
        _transitionLoan = loanId;
        loan.activeCoverId = receiptId;
        loan.lastCoveredSessionId = sessionId;
        loanOfReceipt[receiptId] = loanId;
        coverWindowOpensAt[loanId] = session.scheduledClose - opens;
        coverWindowCutoffAt[loanId] = session.scheduledClose - cutoff;
        vault.setCoverDeadline(loanId, deadline);
        snapshot.activeCoverId = receiptId;
    }

    function completeCoverActivation(uint256 loanId, uint256 receiptId) external onlyCover nonReentrant {
        _requireTransition(loanId, receiptId, Transition.ACTIVATING);
        _transition = Transition.NONE;
        delete _transitionLoan;
    }

    function beginCoverSettlement(uint256 loanId, uint256 receiptId) external onlyCover stable nonReentrant {
        _bound(loanId, receiptId);
        _transition = Transition.SETTLING;
        _transitionLoan = loanId;
    }

    function applyCoverFill(
        uint256 loanId,
        uint256 receiptId,
        uint256 debtApplied,
        address buyer,
        uint256 shares,
        uint128 reportN,
        uint128 reportD
    ) external onlyCover nonReentrant returns (uint256 claimId) {
        _requireTransition(loanId, receiptId, Transition.SETTLING);
        if (debtApplied == 0) revert Errors.InvalidDebtApplied();
        // A paid buyer fill must produce a deliverable claim; dust disposal is never a paid fill.
        if (vault.deliveryUnitsFor(loanId, shares, reportN, reportD) == 0) revert LoanVault.ZeroDelivery();
        _reduceDebt(loanId, debtApplied);
        // Settlement claims retain the vault's deferred-delivery semantics for issuer splits.
        claimId = _claim(loanId, buyer, shares, reportN, reportD);
    }

    function finishCoverSettlement(uint256 loanId, uint256 receiptId, uint128 reportN, uint128 reportD, bool terminal)
        external
        onlyCover
        nonReentrant
    {
        _requireTransition(loanId, receiptId, Transition.SETTLING);
        if (reportN == 0 || reportD == 0) revert Errors.InvalidMultiplier();
        uint256 debt = vault.debtOf(loanId);
        uint64 deadline = vault.activeCoverDeadline(loanId);
        if (terminal) {
            if (block.timestamp < deadline || debt != 0) revert InvalidCover();
        } else if (block.timestamp >= deadline) {
            revert CoverDeadlineReached();
        }
        Loan storage loan = _loans[loanId];
        loan.activeCoverId = 0;
        vault.clearCoverDeadline(loanId);
        delete coverWindowOpensAt[loanId];
        delete coverWindowCutoffAt[loanId];
        _transition = Transition.NONE;
        delete _transitionLoan;
        if (debt == 0) _financialClose(loanId, loan, reportN, reportD);
    }

    function liquidate(uint256 loanId, uint256 maxRepay) external stable nonReentrant {
        Loan storage loan = _active(loanId);
        Types.ReferencePriceFact memory fact = oracle.requireFreshReference(loan.assetId);
        uint16 trigger = loan.config.triggerLtvBps;
        uint16 target = loan.config.targetLtvBps;
        if (loan.activeCoverId != 0) {
            if (block.timestamp < coverWindowOpensAt[loanId] || block.timestamp >= coverWindowCutoffAt[loanId]) {
                revert InvalidCoverWindow();
            }
        } else {
            uint64 cutoff =
                coverManager == address(0) ? 1800 : ILoanCoverCoordinator(coverManager).coverCutoffBeforeClose();
            uint64 close = oracle.sessionFact(fact.sessionId).scheduledClose;
            if (close <= cutoff || block.timestamp >= close - cutoff) {
                trigger = 5000;
                target = 4500;
            }
        }
        uint256 debt = vault.debtOf(loanId);
        uint256 shares = vault.remainingSnapshotShares(loanId);
        LiquidationMath.Result memory result =
            LiquidationMath.plan(debt, shares, _loanPrice(loanId, fact), trigger, target);
        uint256 units = result.shares == 0
            ? 0
            : vault.deliveryUnitsFor(loanId, result.shares, fact.multiplierNumerator, fact.multiplierDenominator);
        if (units == 0) {
            // No physical delivery: close only when ALL remaining shares round to zero units.
            // Charging a liquidator for an undeliverable claim would strand rounding dust.
            if (
                shares != 0
                    && vault.deliveryUnitsFor(loanId, shares, fact.multiplierNumerator, fact.multiplierDenominator) != 0
            ) {
                revert LoanVault.ZeroDelivery();
            }
            result.repaid = 0;
            result.shares = shares;
            result.badDebt = debt;
        } else if (units + vault.outstandingClaimUnits(loanId) > vault.backingOf(loanId)) {
            revert LoanVault.InsufficientBacking();
        }
        if (result.repaid > maxRepay) revert SlippageExceeded();
        _transition = Transition.ORDINARY;
        _releaseCover(loanId, loan, true);
        if (result.repaid != 0) {
            _pullRepayment(msg.sender, result.repaid);
            _reduceDebt(loanId, result.repaid);
        }
        if (result.badDebt != 0) {
            _reduceDebt(loanId, result.badDebt);
            emit BadDebt(loanId, result.badDebt);
        }
        uint256 claimId;
        if (result.shares != 0) {
            claimId = _claim(loanId, msg.sender, result.shares, fact.multiplierNumerator, fact.multiplierDenominator);
        }
        _transition = Transition.NONE;
        emit Liquidated(loanId, msg.sender, result.repaid, result.shares, claimId);
        if (vault.debtOf(loanId) == 0) {
            _financialClose(loanId, loan, fact.multiplierNumerator, fact.multiplierDenominator);
        }
    }

    function _snapshot(uint256 loanId, uint64 deadline) private view returns (CoverSnapshot memory s) {
        Loan storage loan = _loans[loanId];
        LoanVault.DebtRecord memory debt = vault.getDebt(loanId);
        s = CoverSnapshot(
            loan.borrower,
            loan.recipient,
            loan.assetId,
            debt.terms.originalPrincipal,
            debt.terms.startTime,
            debt.terms.rateNumerator,
            debt.terms.rateDenominator,
            vault.debtOf(loanId),
            vault.projectedDebtOf(loanId, deadline),
            vault.remainingSnapshotShares(loanId),
            debt.terms.snapshotMultiplierNumerator,
            debt.terms.snapshotMultiplierDenominator,
            loan.activeCoverId
        );
    }

    function _releaseCover(uint256 loanId, Loan storage loan, bool liquidation) private {
        uint256 receiptId = loan.activeCoverId;
        if (receiptId == 0) return;
        if (liquidation) ILoanCoverCoordinator(coverManager).releaseForLiquidation(receiptId);
        else ILoanCoverCoordinator(coverManager).releaseForLoanClosure(receiptId);
        loan.activeCoverId = 0;
        vault.clearCoverDeadline(loanId);
        delete coverWindowOpensAt[loanId];
        delete coverWindowCutoffAt[loanId];
    }

    function _financialClose(uint256 loanId, Loan storage loan, uint128 n, uint128 d) private {
        pool.closeLoan(loanId);
        uint256 shares = vault.remainingSnapshotShares(loanId);
        uint256 claimId;
        if (shares != 0) claimId = _claim(loanId, loan.borrower, shares, n, d);
        loan.status = LoanStatus.HANDOFF_PENDING;
        emit FinanciallyClosed(loanId, claimId);
        emit HandoffPending(loanId);
    }

    function _claim(uint256 loanId, address beneficiary, uint256 shares, uint128 n, uint128 d)
        private
        returns (uint256 claimId)
    {
        if (beneficiary == address(0)) revert Errors.ZeroAddress();
        if (vault.deliveryUnitsFor(loanId, shares, n, d) == 0) {
            vault.discardRoundingDust(loanId, shares, n, d);
            emit RoundingDustReleased(loanId, shares);
            return 0;
        }
        claimId = vault.recordClaim(loanId, beneficiary, shares, n, d, _now());
        emit ClaimCreated(loanId, claimId, beneficiary, shares);
    }

    function _multipliers(bytes32 assetId) private view returns (uint128 n, uint128 d) {
        Types.CorporateActionFact memory action = oracle.latestCorporateAction(assetId);
        return action.reportHash == bytes32(0)
            ? (uint128(1), uint128(1))
            : (action.multiplierNumerator, action.multiplierDenominator);
    }

    function _loanPrice(uint256 loanId, Types.ReferencePriceFact memory fact) private view returns (uint256) {
        LoanVault.DebtRecord memory debt = vault.getDebt(loanId);
        return FixedPointMath.mulDivDown(
            fact.price,
            uint256(fact.multiplierNumerator) * debt.terms.snapshotMultiplierDenominator,
            uint256(fact.multiplierDenominator) * debt.terms.snapshotMultiplierNumerator
        );
    }

    function _reduceDebt(uint256 loanId, uint256 amount) private {
        vault.reduceDebt(loanId, vault.cumulativeDebtReductionOf(loanId) + amount);
    }

    function _loan(uint256 loanId) private view returns (Loan storage loan) {
        loan = _loans[loanId];
        if (loan.status == LoanStatus.NONE) revert Errors.InvalidReceiptId();
    }

    function _active(uint256 loanId) private view returns (Loan storage loan) {
        loan = _loan(loanId);
        if (loan.status != LoanStatus.ACTIVE) revert LoanNotActive();
    }

    function _bound(uint256 loanId, uint256 receiptId) private view {
        if (receiptId == 0 || _active(loanId).activeCoverId != receiptId || loanOfReceipt[receiptId] != loanId) {
            revert InvalidCover();
        }
    }

    function _requireTransition(uint256 loanId, uint256 receiptId, Transition transition) private view {
        if (_transition != transition || _transitionLoan != loanId) revert CashDebtTransition();
        _bound(loanId, receiptId);
    }

    function _now() private view returns (uint64) {
        if (block.timestamp > type(uint64).max) revert Errors.InvalidTimeRange();
        return uint64(block.timestamp);
    }

    // Reused exact-transfer repayment accounting from CoverManager.
    function _pullRepayment(address payer, uint256 amount) private {
        IERC20 token = IERC20(address(pool.cashToken()));
        if (payer == address(pool)) revert Errors.InvalidTokenBalanceDelta(amount, 0);
        uint256 payerBefore = token.balanceOf(payer);
        uint256 poolBefore = token.balanceOf(address(pool));
        token.safeTransferFrom(payer, address(pool), amount);
        uint256 payerAfter = token.balanceOf(payer);
        uint256 poolAfter = token.balanceOf(address(pool));
        uint256 spent = payerBefore >= payerAfter ? payerBefore - payerAfter : 0;
        uint256 received = poolAfter >= poolBefore ? poolAfter - poolBefore : 0;
        if (spent != amount) revert Errors.InvalidTokenBalanceDelta(amount, spent);
        if (received != amount) revert Errors.InvalidTokenBalanceDelta(amount, received);
    }
}
