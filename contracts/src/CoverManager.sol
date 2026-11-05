// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AssetRegistry} from "./AssetRegistry.sol";
import {SessionOracle} from "./SessionOracle.sol";
import {CommitmentBook} from "./CommitmentBook.sol";
import {ProtectedPool, IPoolDebtProvider} from "./ProtectedPool.sol";
import {LoanVault} from "./LoanVault.sol";
import {Errors} from "./lib/Errors.sol";
import {FixedPointMath} from "./lib/FixedPointMath.sol";
import {InterestMath} from "./lib/InterestMath.sol";
import {SettlementMath} from "./lib/SettlementMath.sol";
import {QuoteHash} from "./lib/QuoteHash.sol";
import {Types} from "./lib/Types.sol";

contract CoverManager is ReentrancyGuard, IPoolDebtProvider {
    using SafeERC20 for IERC20;

    enum ReceiptStatus {
        NONE,
        ACTIVE,
        HANDOFF_PENDING,
        CLOSED
    }

    struct Receipt {
        QuoteHash.Quote consent;
        Types.AssetConfig config;
        bytes32 quoteHash;
        bytes32[] offerIds;
        bytes32[] offerTermsHashes;
        uint64 startTime;
        uint64 settlementDeadline;
        uint256 debtCeiling;
        ReceiptStatus status;
        bytes32 benchmarkReportHash;
        uint256 benchmarkValuePerSnapshotShare;
        uint128 latestMultiplierNumerator;
        uint128 latestMultiplierDenominator;
    }

    struct BorrowValidation {
        Types.AssetConfig config;
        uint64 startTime;
        uint64 settlementDeadline;
        uint256 debtCeiling;
        uint16 borrowerLtvBps;
    }

    error InvalidBorrower();
    error InvalidBorrowerNonce();
    error QuoteHashMismatch();
    error QuoteExpired();
    error InvalidOfferOrder();
    error QuoteTotalsMismatch();
    error InvalidOfferCount();
    error InvalidCollateral();
    error InvalidSettlementDeadline();
    error ReferenceFactsMismatch();
    error InvalidSession();
    error OfferIdentityMismatch();
    error ConfigNotEffective();
    error AssetHalted();
    error ComponentMismatch();
    error ReceiptNotActive();
    error ReceiptNotPending();
    error SettlementDeadlineReached();
    error SettlementDeadlineNotReached();
    error BenchmarkUnavailable();
    error BenchmarkIdentityMismatch();
    error BenchmarkAlreadyProcessed();
    error ReservedCollateral();
    error HandoffIncomplete();
    error CashDebtTransition();

    uint256 public nextReceiptId = 1;
    mapping(address => uint256) public borrowerNonce;
    mapping(uint256 receiptId => Receipt receipt) private _receipts;
    bool private _cashDebtTransition;

    AssetRegistry public immutable registry;
    SessionOracle public immutable oracle;
    CommitmentBook public immutable book;
    ProtectedPool public immutable pool;
    LoanVault public immutable vault;

    event CoveredBorrowCreated(
        uint256 indexed receiptId,
        address indexed borrower,
        bytes32 indexed sessionId,
        bytes32 quoteHash,
        uint256 principal,
        uint64 startTime,
        uint64 settlementDeadline,
        uint256 debtCeiling
    );
    event Repaid(uint256 indexed receiptId, address indexed payer, uint256 amount, uint256 debtAfter);
    event CollateralAdded(uint256 indexed receiptId, address indexed payer, uint256 snapshotShares);
    event CollateralWithdrawn(uint256 indexed receiptId, address indexed borrower, uint256 snapshotShares);
    event BenchmarkProcessed(
        uint256 indexed receiptId,
        bytes32 indexed reportHash,
        uint256 valuePerSnapshotShare,
        uint128 multiplierNumerator,
        uint128 multiplierDenominator
    );
    event ReceiptOfferExercised(
        uint256 indexed receiptId,
        bytes32 indexed offerId,
        uint256 indexed claimId,
        uint256 additionalShares,
        uint256 debtApplied
    );
    event FinanciallyClosed(uint256 indexed receiptId, uint256 borrowerClaimId);
    event HandoffPending(uint256 indexed receiptId);
    event ReceiptClosed(uint256 indexed receiptId);

    constructor(address registry_, address oracle_, address book_, address pool_, address vault_) {
        if (
            registry_ == address(0) || oracle_ == address(0) || book_ == address(0) || pool_ == address(0)
                || vault_ == address(0)
        ) {
            revert Errors.ZeroAddress();
        }
        registry = AssetRegistry(registry_);
        oracle = SessionOracle(oracle_);
        book = CommitmentBook(book_);
        pool = ProtectedPool(pool_);
        vault = LoanVault(vault_);
        if (address(book.cashToken()) != address(pool.cashToken())) revert ComponentMismatch();
    }

    /// @notice Direct borrower consent reserves the exact all-or-nothing lots and creates a funded loan.
    function borrowWithCover(
        QuoteHash.Quote calldata quote,
        bytes32[] calldata offerIds,
        bytes32[] calldata termsHashes,
        bytes32 expectedQuoteHash
    ) external nonReentrant returns (uint256 receiptId) {
        if (quote.borrower != msg.sender) revert InvalidBorrower();
        if (quote.borrowerNonce != borrowerNonce[msg.sender]) revert InvalidBorrowerNonce();
        if (quote.recipient == address(0)) revert Errors.ZeroAddress();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > quote.expiry) revert QuoteExpired();
        bytes32 identity = QuoteHash.hash(address(this), quote, offerIds, termsHashes);
        if (identity != expectedQuoteHash) revert QuoteHashMismatch();
        _requireBindings();
        BorrowValidation memory valid = _validateBorrow(quote, offerIds, termsHashes);

        receiptId = nextReceiptId++;
        borrowerNonce[msg.sender] += 1;
        _receipts[receiptId] = Receipt({
            consent: quote,
            config: valid.config,
            quoteHash: identity,
            offerIds: offerIds,
            offerTermsHashes: termsHashes,
            startTime: valid.startTime,
            settlementDeadline: valid.settlementDeadline,
            debtCeiling: valid.debtCeiling,
            status: ReceiptStatus.ACTIVE,
            benchmarkReportHash: bytes32(0),
            benchmarkValuePerSnapshotShare: 0,
            latestMultiplierNumerator: quote.snapshotMultiplierNumerator,
            latestMultiplierDenominator: quote.snapshotMultiplierDenominator
        });
        _fundReceipt(receiptId, valid.borrowerLtvBps);
        emit CoveredBorrowCreated(
            receiptId,
            quote.borrower,
            quote.sessionId,
            identity,
            quote.principal,
            valid.startTime,
            valid.settlementDeadline,
            valid.debtCeiling
        );
    }

    function _fundReceipt(uint256 receiptId, uint16 borrowerLtvBps) private {
        Receipt storage receipt = _receipts[receiptId];
        QuoteHash.Quote storage quote = receipt.consent;
        vault.createDebt(
            receiptId,
            LoanVault.DebtTerms({
                borrower: quote.borrower,
                assetId: quote.assetId,
                assetToken: receipt.config.assetToken,
                originalPrincipal: quote.principal,
                rateNumerator: receipt.config.rateNumerator,
                rateDenominator: receipt.config.rateDenominator,
                startTime: receipt.startTime,
                settlementDeadline: receipt.settlementDeadline,
                snapshotCollateral: quote.collateralShares,
                snapshotMultiplierNumerator: quote.snapshotMultiplierNumerator,
                snapshotMultiplierDenominator: quote.snapshotMultiplierDenominator
            })
        );
        for (uint256 i; i < receipt.offerIds.length; ++i) {
            book.reserveOffer(
                receipt.offerIds[i],
                receipt.offerTermsHashes[i],
                receiptId,
                quote.borrower,
                receipt.settlementDeadline,
                quote.referencePrice,
                borrowerLtvBps
            );
        }
        // Registration is adjacent to guarded disbursement: token callbacks during collateral
        // or premium pulls cannot observe an inflated pool NAV before the principal leaves.
        pool.registerLoan(receiptId);
        pool.disburse(quote.recipient, quote.principal);
    }

    function getReceipt(uint256 receiptId) external view returns (Receipt memory) {
        if (_receipts[receiptId].status == ReceiptStatus.NONE) revert Errors.InvalidReceiptId();
        return _receipts[receiptId];
    }

    function debtOf(uint256 receiptId) external view returns (uint256) {
        // Prevent pool pricing against temporarily double-counted cash and debt during token callbacks.
        if (_cashDebtTransition) revert CashDebtTransition();
        return vault.debtOf(receiptId);
    }

    function repay(uint256 receiptId, uint256 amount) external nonReentrant {
        Receipt storage receipt = _active(receiptId);
        uint256 debt = vault.debtOf(receiptId);
        if (amount == 0 || amount > debt) revert Errors.InvalidDebtApplied();
        _cashDebtTransition = true;
        _pullRepayment(msg.sender, amount);
        _reduceDebt(receiptId, amount);
        _cashDebtTransition = false;
        emit Repaid(receiptId, msg.sender, amount, debt - amount);
        if (amount == debt) _financialClose(receiptId, receipt);
    }

    function addCollateral(uint256 receiptId, uint256 snapshotShares) external nonReentrant {
        Receipt storage receipt = _active(receiptId);
        vault.addCollateral(
            receiptId,
            msg.sender,
            snapshotShares,
            receipt.latestMultiplierNumerator,
            receipt.latestMultiplierDenominator
        );
        emit CollateralAdded(receiptId, msg.sender, snapshotShares);
    }

    function withdrawCollateral(uint256 receiptId, uint256 snapshotShares) external nonReentrant {
        Receipt storage receipt = _active(receiptId);
        if (msg.sender != receipt.consent.borrower) revert InvalidBorrower();
        _beforeDeadline(receipt);
        uint256 collateral = vault.remainingSnapshotShares(receiptId);
        if (snapshotShares == 0 || snapshotShares > collateral) revert Errors.InvalidExerciseShares();
        uint256 afterShares = collateral - snapshotShares;
        uint256 reservedShares;
        for (uint256 i; i < receipt.offerIds.length; ++i) {
            Types.Offer memory offer = book.getOffer(receipt.offerIds[i]);
            reservedShares += offer.terms.snapshotShares - offer.cumulativeExercisedShares;
        }
        if (afterShares < reservedShares) revert ReservedCollateral();
        uint256 price = receipt.benchmarkReportHash == bytes32(0)
            ? receipt.consent.referencePrice
            : receipt.benchmarkValuePerSnapshotShare;
        if (!SettlementMath.isAtOrBelowTarget(
                vault.debtOf(receiptId), afterShares, price, receipt.config.originationLtvBps
            )) {
            revert Errors.BorrowerLtvTooHigh();
        }
        vault.releaseCollateral(
            receiptId,
            msg.sender,
            snapshotShares,
            receipt.latestMultiplierNumerator,
            receipt.latestMultiplierDenominator
        );
        emit CollateralWithdrawn(receiptId, msg.sender, snapshotShares);
    }

    function settle(uint256 receiptId) external nonReentrant {
        Receipt storage receipt = _active(receiptId);
        _beforeDeadline(receipt);
        if (receipt.benchmarkReportHash != bytes32(0)) revert BenchmarkAlreadyProcessed();
        Types.Benchmark memory benchmark = oracle.benchmarkOf(receipt.consent.sessionId);
        if (!benchmark.finalized) revert BenchmarkUnavailable();
        if (
            benchmark.assetId != receipt.consent.assetId || benchmark.sessionId != receipt.consent.sessionId
                || benchmark.configHash != receipt.consent.configHash || benchmark.reportHash == bytes32(0)
        ) {
            revert BenchmarkIdentityMismatch();
        }
        // Report/snapshot products fit 256 bits. One full-width division floors only the final value.
        uint256 price = FixedPointMath.mulDivDown(
            benchmark.price,
            uint256(benchmark.multiplierNumerator) * receipt.consent.snapshotMultiplierDenominator,
            uint256(benchmark.multiplierDenominator) * receipt.consent.snapshotMultiplierNumerator
        );
        receipt.benchmarkReportHash = benchmark.reportHash;
        receipt.benchmarkValuePerSnapshotShare = price;
        receipt.latestMultiplierNumerator = benchmark.multiplierNumerator;
        receipt.latestMultiplierDenominator = benchmark.multiplierDenominator;
        emit BenchmarkProcessed(
            receiptId, benchmark.reportHash, price, benchmark.multiplierNumerator, benchmark.multiplierDenominator
        );
        _executePlan(receiptId, receipt, price);
    }

    function terminalSettle(uint256 receiptId) external nonReentrant {
        Receipt storage receipt = _active(receiptId);
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < receipt.settlementDeadline) revert SettlementDeadlineNotReached();
        _executePlan(receiptId, receipt, 0);
        if (vault.debtOf(receiptId) != 0) revert Errors.InvalidDebtApplied();
    }

    /// @notice Anyone can fund physical delivery without changing economic collateral or debt.
    function topUpBacking(uint256 receiptId, uint256 tokenUnits) external nonReentrant {
        Receipt storage receipt = _receipt(receiptId);
        if (receipt.status == ReceiptStatus.CLOSED) revert ReceiptNotPending();
        vault.topUpBacking(receiptId, msg.sender, tokenUnits);
    }

    function finalizeHandoff(uint256 receiptId) external nonReentrant {
        Receipt storage receipt = _receipt(receiptId);
        if (receipt.status != ReceiptStatus.HANDOFF_PENDING) revert ReceiptNotPending();
        if (vault.outstandingClaimUnits(receiptId) != 0) revert HandoffIncomplete();
        vault.releaseSurplus(receiptId);
        receipt.status = ReceiptStatus.CLOSED;
        emit ReceiptClosed(receiptId);
    }

    function _executePlan(uint256 receiptId, Receipt storage receipt, uint256 price) private {
        uint256 length = receipt.offerIds.length;
        SettlementMath.LotState[] memory lots = new SettlementMath.LotState[](length);
        for (uint256 i; i < length; ++i) {
            Types.Offer memory offer = book.getOffer(receipt.offerIds[i]);
            lots[i] = SettlementMath.LotState(
                offer.terms.strike, offer.terms.snapshotShares, offer.cumulativeExercisedShares
            );
        }
        SettlementMath.Plan memory plan = SettlementMath.planNormal(
            vault.debtOf(receiptId),
            vault.remainingSnapshotShares(receiptId),
            price,
            receipt.config.triggerLtvBps,
            receipt.config.targetLtvBps,
            lots
        );
        for (uint256 i; i < length; ++i) {
            SettlementMath.Fill memory fill = plan.fills[i];
            if (fill.additionalShares == 0) continue;
            bytes32 offerId = receipt.offerIds[i];
            _cashDebtTransition = true;
            book.exerciseOffer(
                offerId, lots[i].exercisedShares + fill.additionalShares, fill.debtApplied, receipt.consent.borrower
            );
            _reduceDebt(receiptId, fill.debtApplied);
            _cashDebtTransition = false;
            uint256 claimId = _claim(receiptId, receipt, book.getOffer(offerId).buyer, fill.additionalShares);
            emit ReceiptOfferExercised(receiptId, offerId, claimId, fill.additionalShares, fill.debtApplied);
        }
        if (plan.debtAfter == 0) _financialClose(receiptId, receipt);
    }

    function _claim(uint256 receiptId, Receipt storage receipt, address beneficiary, uint256 shares)
        private
        returns (uint256)
    {
        // Claims are immediately mature. Capping a late terminal timestamp avoids narrowing overflow.
        uint64 maturity = receipt.settlementDeadline;
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < maturity) maturity = uint64(block.timestamp);
        return vault.recordClaim(
            receiptId,
            beneficiary,
            shares,
            receipt.latestMultiplierNumerator,
            receipt.latestMultiplierDenominator,
            maturity
        );
    }

    function _financialClose(uint256 receiptId, Receipt storage receipt) private {
        for (uint256 i; i < receipt.offerIds.length; ++i) {
            book.releaseOffer(receipt.offerIds[i]);
        }
        pool.closeLoan(receiptId);
        uint256 shares = vault.remainingSnapshotShares(receiptId);
        uint256 borrowerClaimId;
        if (shares != 0) borrowerClaimId = _claim(receiptId, receipt, receipt.consent.borrower, shares);
        receipt.status = ReceiptStatus.HANDOFF_PENDING;
        emit FinanciallyClosed(receiptId, borrowerClaimId);
        emit HandoffPending(receiptId);
    }

    function _reduceDebt(uint256 receiptId, uint256 amount) private {
        vault.reduceDebt(receiptId, vault.cumulativeDebtReductionOf(receiptId) + amount);
    }

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

    function _beforeDeadline(Receipt storage receipt) private view {
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp >= receipt.settlementDeadline) revert SettlementDeadlineReached();
    }

    function _receipt(uint256 receiptId) private view returns (Receipt storage receipt) {
        receipt = _receipts[receiptId];
        if (receipt.status == ReceiptStatus.NONE) revert Errors.InvalidReceiptId();
    }

    function _active(uint256 receiptId) private view returns (Receipt storage receipt) {
        receipt = _receipt(receiptId);
        if (receipt.status != ReceiptStatus.ACTIVE) revert ReceiptNotActive();
    }

    function _requireBindings() private view {
        if (
            book.coverManager() != address(this) || pool.coverManager() != address(this)
                || vault.coverManager() != address(this) || book.protectedPool() != address(pool)
        ) {
            revert ComponentMismatch();
        }
    }

    function _validateBorrow(
        QuoteHash.Quote calldata quote,
        bytes32[] calldata offerIds,
        bytes32[] calldata termsHashes
    ) private view returns (BorrowValidation memory valid) {
        uint64 effectiveAt;
        bytes32 identity;
        (valid.config, effectiveAt, identity) = registry.getConfig(quote.assetId, quote.configVersion);
        // forge-lint: disable-next-line(block-timestamp)
        if (effectiveAt > block.timestamp) revert ConfigNotEffective();
        if (valid.config.stockTokenDecimals != 18) {
            revert Errors.InvalidDecimals(valid.config.stockTokenDecimals, valid.config.cashTokenDecimals);
        }
        uint8 tokenDecimals = IERC20Metadata(valid.config.assetToken).decimals();
        if (tokenDecimals != 18) revert Errors.InvalidDecimals(tokenDecimals, valid.config.cashTokenDecimals);
        if (identity != quote.configHash) revert ReferenceFactsMismatch();
        uint64 scheduledClose = _validateReferenceFacts(quote);
        if (quote.principal == 0 || quote.principal > type(uint128).max) revert Errors.UnsupportedCashAmount();
        if (quote.collateralShares == 0 || quote.collateralShares > type(uint128).max) revert InvalidCollateral();
        if (quote.referencePrice == 0 || quote.referencePrice > type(uint96).max) revert Errors.UnsupportedPrice();
        if (!SettlementMath.isAtOrBelowTarget(
                quote.principal, quote.collateralShares, quote.referencePrice, valid.config.originationLtvBps
            )) {
            revert Errors.BorrowerLtvTooHigh();
        }
        // Bounds above keep both products below 256 bits. Round only the final ratio.
        uint256 ltv = FixedPointMath.mulDivUp(
            quote.principal, uint256(Types.BPS) * 1e18, quote.collateralShares * quote.referencePrice
        );
        // Safe: the exact origination check bounds the rounded LTV by config.originationLtvBps.
        // forge-lint: disable-next-line(unsafe-typecast)
        valid.borrowerLtvBps = uint16(ltv);
        uint256 capacity;
        (valid.settlementDeadline, capacity) = _validateOffers(quote, offerIds, termsHashes);
        if (
            valid.settlementDeadline <= scheduledClose || valid.settlementDeadline < quote.minSettlementDeadline
                || valid.settlementDeadline > quote.maxSettlementDeadline
        ) revert InvalidSettlementDeadline();
        // Safe: the validated uint64 scheduled close is strictly after block.timestamp.
        // forge-lint: disable-next-line(unsafe-typecast)
        valid.startTime = uint64(block.timestamp);
        valid.debtCeiling = InterestMath.debt(
            quote.principal,
            valid.config.rateNumerator,
            valid.startTime,
            valid.settlementDeadline,
            valid.settlementDeadline,
            valid.config.rateDenominator,
            0
        );
        if (capacity < valid.debtCeiling) revert Errors.InsufficientFundedCapacity(capacity, valid.debtCeiling);
    }

    function _validateReferenceFacts(QuoteHash.Quote calldata quote) private view returns (uint64 scheduledClose) {
        Types.SessionFact memory session = oracle.sessionFact(quote.sessionId);
        Types.AssetState memory state = oracle.assetState(quote.assetId);
        if (state.halted) revert AssetHalted();
        // forge-lint: disable-next-line(block-timestamp)
        bool atOrAfterClose = block.timestamp >= session.scheduledClose;
        if (
            session.phase != Types.SessionPhase.SCHEDULED || atOrAfterClose || session.assetId != quote.assetId
                || state.activeSessionId != quote.sessionId
        ) revert InvalidSession();
        if (
            session.configHash != quote.configHash || state.configHash != quote.configHash
                || session.scheduledReportHash != quote.scheduledReportHash
        ) revert ReferenceFactsMismatch();
        Types.CorporateActionFact memory action = oracle.latestCorporateAction(quote.assetId);
        if (action.reportHash != quote.corporateActionHash) revert ReferenceFactsMismatch();
        uint128 numerator = action.reportHash == bytes32(0) ? 1 : action.multiplierNumerator;
        uint128 denominator = action.reportHash == bytes32(0) ? 1 : action.multiplierDenominator;
        if (quote.snapshotMultiplierNumerator != numerator || quote.snapshotMultiplierDenominator != denominator) {
            revert ReferenceFactsMismatch();
        }
        return session.scheduledClose;
    }

    function _validateOffers(
        QuoteHash.Quote calldata quote,
        bytes32[] calldata offerIds,
        bytes32[] calldata termsHashes
    ) private view returns (uint64 deadline, uint256 capacity) {
        if (offerIds.length == 0 || offerIds.length > Types.REQUIRED_MAX_FILLS || offerIds.length != termsHashes.length)
        {
            revert InvalidOfferCount();
        }
        uint256 totalShares;
        uint256 totalPremium;
        uint256 weightedSum;
        uint256 previousStrike;
        deadline = type(uint64).max;
        for (uint256 i; i < offerIds.length; ++i) {
            Types.Offer memory offer = book.getOffer(offerIds[i]);
            if (offer.status != Types.OfferStatus.FREE) {
                revert Errors.InvalidOfferState(Types.OfferStatus.FREE, offer.status);
            }
            if (book.termsHashOf(offerIds[i]) != termsHashes[i]) revert Errors.OfferTermsHashMismatch();
            Types.OfferTerms memory terms = offer.terms;
            if (terms.assetId != quote.assetId || terms.policyHash != quote.policyHash) revert OfferIdentityMismatch();
            if (
                i != 0
                    && (terms.strike > previousStrike
                        || (terms.strike == previousStrike && offerIds[i] <= offerIds[i - 1]))
            ) {
                revert InvalidOfferOrder();
            }
            previousStrike = terms.strike;
            totalShares += terms.snapshotShares;
            totalPremium += terms.premium;
            // Each book-validated product is at most 224 bits; at most eight terms fit 227 bits.
            weightedSum += terms.snapshotShares * terms.strike;
            capacity += offer.cashCapacity;
            if (terms.expiry < deadline) deadline = terms.expiry;
        }
        if (totalShares == 0 || totalShares > quote.collateralShares) revert InvalidCollateral();
        if (
            totalShares != quote.totalOfferShares || totalPremium != quote.totalPremium
                || weightedSum / totalShares != quote.weightedStrike
        ) {
            revert QuoteTotalsMismatch();
        }
    }
}
