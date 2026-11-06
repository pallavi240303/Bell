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
import {LoanManager} from "./LoanManager.sol";
import {LiquidationMath} from "./lib/LiquidationMath.sol";
import {SettlementMath} from "./lib/SettlementMath.sol";
import {QuoteHash} from "./lib/QuoteHash.sol";
import {Types} from "./lib/Types.sol";

contract CoverManager is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum ReceiptStatus {
        NONE,
        ACTIVE,
        ENDED
    }

    enum Profile {
        LIVE,
        REPLAY
    }
    enum Outcome {
        HEALTHY,
        TARGET_REACHED,
        FULL_CLOSURE,
        REPAID,
        LIQUIDATED,
        TERMINAL
    }

    struct Receipt {
        uint256 loanId;
        QuoteHash.Quote consent;
        Types.AssetConfig config;
        bytes32 quoteHash;
        bytes32[] offerIds;
        bytes32[] offerTermsHashes;
        uint64 startTime;
        uint64 opensAt;
        uint64 cutoffAt;
        uint64 settlementDeadline;
        uint256 debtAtAcceptance;
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
        uint64 opensAt;
        uint64 cutoffAt;
        uint64 settlementDeadline;
        uint256 debtAtAcceptance;
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
    LoanManager public immutable loanManager;
    Profile public immutable profile;
    uint64 public immutable coverOpensBeforeClose;
    uint64 public immutable coverCutoffBeforeClose;
    error InvalidPolicy();
    error InvalidLoanConsent();
    error DebtLimitExceeded();
    error InvalidCoverWindow();

    AssetRegistry public immutable registry;
    SessionOracle public immutable oracle;
    CommitmentBook public immutable book;
    ProtectedPool public immutable pool;
    LoanVault public immutable vault;

    event CoverPurchased(
        uint256 indexed receiptId,
        uint256 indexed loanId,
        bytes32 indexed sessionId,
        bytes32 quoteHash,
        uint256 debtAtAcceptance,
        uint256 debtCeiling,
        uint64 opensAt,
        uint64 cutoffAt,
        uint64 settlementDeadline
    );
    event CoverEnded(uint256 indexed receiptId, uint256 indexed loanId, uint8 outcome);
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

    constructor(
        address registry_,
        address oracle_,
        address book_,
        address pool_,
        address vault_,
        address loanManager_,
        Profile profile_
    ) {
        if (
            registry_ == address(0) || oracle_ == address(0) || book_ == address(0) || pool_ == address(0)
                || vault_ == address(0) || loanManager_ == address(0)
        ) {
            revert Errors.ZeroAddress();
        }
        loanManager = LoanManager(loanManager_);
        profile = profile_;
        coverOpensBeforeClose = profile_ == Profile.LIVE ? 7200 : 600;
        coverCutoffBeforeClose = profile_ == Profile.LIVE ? 1800 : 60;
        registry = AssetRegistry(registry_);
        oracle = SessionOracle(oracle_);
        book = CommitmentBook(book_);
        pool = ProtectedPool(pool_);
        vault = LoanVault(vault_);
        if (
            address(book.cashToken()) != address(pool.cashToken()) || address(loanManager.registry()) != registry_
                || address(loanManager.oracle()) != oracle_ || address(loanManager.pool()) != pool_
                || address(loanManager.vault()) != vault_
        ) revert ComponentMismatch();
    }

    /// @notice Attach fully funded session cover to an existing ordinary loan.
    function buyCover(
        uint256 loanId,
        QuoteHash.Quote calldata quote,
        bytes32[] calldata offerIds,
        bytes32[] calldata termsHashes,
        bytes32 expectedQuoteHash
    ) external nonReentrant returns (uint256 receiptId) {
        if (loanId != quote.loanId) revert InvalidLoanConsent();
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
            loanId: loanId,
            consent: quote,
            config: valid.config,
            quoteHash: identity,
            offerIds: offerIds,
            offerTermsHashes: termsHashes,
            startTime: valid.startTime,
            opensAt: valid.opensAt,
            cutoffAt: valid.cutoffAt,
            settlementDeadline: valid.settlementDeadline,
            debtAtAcceptance: valid.debtAtAcceptance,
            debtCeiling: valid.debtCeiling,
            status: ReceiptStatus.ACTIVE,
            benchmarkReportHash: bytes32(0),
            benchmarkValuePerSnapshotShare: 0,
            latestMultiplierNumerator: quote.snapshotMultiplierNumerator,
            latestMultiplierDenominator: quote.snapshotMultiplierDenominator
        });
        loanManager.beginCover(loanId, receiptId, quote.sessionId, valid.settlementDeadline);
        _fundReceipt(receiptId, valid.borrowerLtvBps);
        loanManager.completeCoverActivation(loanId, receiptId);
        emit CoverPurchased(
            receiptId,
            loanId,
            quote.sessionId,
            identity,
            valid.debtAtAcceptance,
            valid.debtCeiling,
            valid.opensAt,
            valid.cutoffAt,
            valid.settlementDeadline
        );
    }

    function _fundReceipt(uint256 receiptId, uint16 borrowerLtvBps) private {
        Receipt storage receipt = _receipts[receiptId];
        QuoteHash.Quote storage quote = receipt.consent;
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
    }

    function getReceipt(uint256 receiptId) external view returns (Receipt memory) {
        if (_receipts[receiptId].status == ReceiptStatus.NONE) revert Errors.InvalidReceiptId();
        return _receipts[receiptId];
    }

    function reservedShares(uint256 receiptId) external view returns (uint256) {
        Receipt storage receipt = _receipts[receiptId];
        return receipt.status == ReceiptStatus.ACTIVE ? receipt.consent.totalOfferShares : 0;
    }

    function policyHash(bytes32 assetId, bytes32 sessionId, bytes32 configHash, uint128 loanN, uint128 loanD)
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                keccak256("BELL_SESSION_COVER_POLICY_V1"),
                block.chainid,
                address(this),
                assetId,
                sessionId,
                configHash,
                loanN,
                loanD,
                profile,
                coverOpensBeforeClose,
                coverCutoffBeforeClose
            )
        );
    }

    function releaseForLoanClosure(uint256 receiptId) external nonReentrant {
        if (msg.sender != address(loanManager)) revert Errors.UnauthorizedManager(msg.sender);
        _end(receiptId, _active(receiptId), Outcome.REPAID);
    }

    function releaseForLiquidation(uint256 receiptId) external nonReentrant {
        if (msg.sender != address(loanManager)) revert Errors.UnauthorizedManager(msg.sender);
        _end(receiptId, _active(receiptId), Outcome.LIQUIDATED);
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
        _executePlan(receiptId, receipt, price, false);
    }

    function terminalSettle(uint256 receiptId) external nonReentrant {
        Receipt storage receipt = _active(receiptId);
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < receipt.settlementDeadline) revert SettlementDeadlineNotReached();
        Types.CorporateActionFact memory action = oracle.latestCorporateAction(receipt.consent.assetId);
        receipt.latestMultiplierNumerator = action.reportHash == bytes32(0) ? 1 : action.multiplierNumerator;
        receipt.latestMultiplierDenominator = action.reportHash == bytes32(0) ? 1 : action.multiplierDenominator;
        _executePlan(receiptId, receipt, 0, true);
    }

    function _executePlan(uint256 receiptId, Receipt storage receipt, uint256 price, bool terminal) private {
        uint256 length = receipt.offerIds.length;
        SettlementMath.LotState[] memory lots = new SettlementMath.LotState[](length);
        for (uint256 i; i < length; ++i) {
            Types.Offer memory offer = book.getOffer(receipt.offerIds[i]);
            lots[i] = SettlementMath.LotState(
                offer.terms.strike, offer.terms.snapshotShares, offer.cumulativeExercisedShares
            );
        }
        SettlementMath.Plan memory plan = SettlementMath.planNormal(
            vault.debtOf(receipt.loanId),
            vault.remainingSnapshotShares(receipt.loanId),
            price,
            receipt.config.triggerLtvBps,
            receipt.config.targetLtvBps,
            lots
        );
        loanManager.beginCoverSettlement(receipt.loanId, receiptId);
        for (uint256 i; i < length; ++i) {
            SettlementMath.Fill memory fill = plan.fills[i];
            if (fill.additionalShares == 0) continue;
            _applyFill(receiptId, receipt, receipt.offerIds[i], lots[i].exercisedShares, fill);
        }
        Outcome outcome = terminal ? Outcome.TERMINAL : Outcome(uint8(plan.outcome));
        _end(receiptId, receipt, outcome);
        loanManager.finishCoverSettlement(
            receipt.loanId, receiptId, receipt.latestMultiplierNumerator, receipt.latestMultiplierDenominator, terminal
        );
    }

    function _applyFill(
        uint256 receiptId,
        Receipt storage receipt,
        bytes32 offerId,
        uint256 exercised,
        SettlementMath.Fill memory fill
    ) private {
        book.exerciseOffer(offerId, exercised + fill.additionalShares, fill.debtApplied, receipt.consent.borrower);
        uint256 claimId = loanManager.applyCoverFill(
            receipt.loanId,
            receiptId,
            fill.debtApplied,
            book.getOffer(offerId).buyer,
            fill.additionalShares,
            receipt.latestMultiplierNumerator,
            receipt.latestMultiplierDenominator
        );
        emit ReceiptOfferExercised(receiptId, offerId, claimId, fill.additionalShares, fill.debtApplied);
    }

    function _end(uint256 receiptId, Receipt storage receipt, Outcome outcome) private {
        for (uint256 i; i < receipt.offerIds.length; ++i) {
            book.releaseOffer(receipt.offerIds[i]);
        }
        receipt.status = ReceiptStatus.ENDED;
        emit CoverEnded(receiptId, receipt.loanId, uint8(outcome));
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
            book.coverManager() != address(this) || pool.coverManager() != address(loanManager)
                || vault.coverManager() != address(loanManager) || book.protectedPool() != address(pool)
                || loanManager.coverManager() != address(this)
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
        uint256 capacity;
        (valid.settlementDeadline, capacity) = _validateOffers(quote, offerIds, termsHashes);
        if (
            valid.settlementDeadline <= scheduledClose || valid.settlementDeadline < quote.minSettlementDeadline
                || valid.settlementDeadline > quote.maxSettlementDeadline
        ) revert InvalidSettlementDeadline();
        // Safe: the validated uint64 scheduled close is strictly after block.timestamp.
        // forge-lint: disable-next-line(unsafe-typecast)
        valid.startTime = uint64(block.timestamp);
        _validateLoan(quote, valid);
        valid.opensAt = scheduledClose - coverOpensBeforeClose;
        valid.cutoffAt = scheduledClose - coverCutoffBeforeClose;
        if (capacity < valid.debtCeiling) revert Errors.InsufficientFundedCapacity(capacity, valid.debtCeiling);
    }

    function _validateLoan(QuoteHash.Quote calldata quote, BorrowValidation memory valid) private view {
        LoanManager.CoverSnapshot memory loan = loanManager.coverSnapshot(quote.loanId, valid.settlementDeadline);
        LoanManager.Loan memory metadata = loanManager.getLoan(quote.loanId);
        if (
            loan.borrower != quote.borrower || loan.recipient != quote.recipient || loan.assetId != quote.assetId
                || loan.originalPrincipal != quote.principal || loan.remainingCollateralShares != quote.collateralShares
                || loan.loanSnapshotMultiplierNumerator != quote.snapshotMultiplierNumerator
                || loan.loanSnapshotMultiplierDenominator != quote.snapshotMultiplierDenominator
        ) revert InvalidLoanConsent();
        if (
            metadata.config.assetToken != valid.config.assetToken
                || metadata.config.stockTokenDecimals != valid.config.stockTokenDecimals
                || metadata.config.cashTokenDecimals != valid.config.cashTokenDecimals
        ) revert ComponentMismatch();
        uint16 trigger = metadata.config.triggerLtvBps < valid.config.triggerLtvBps
            ? metadata.config.triggerLtvBps
            : valid.config.triggerLtvBps;
        if (loan.debtNow > LiquidationMath.debtLimit(quote.collateralShares, quote.referencePrice, trigger)) {
            revert Errors.BorrowerLtvTooHigh();
        }
        valid.borrowerLtvBps = uint16(
            FixedPointMath.mulDivUp(
                loan.debtNow, uint256(Types.BPS) * 1e18, quote.collateralShares * quote.referencePrice
            )
        );
        valid.debtAtAcceptance = loan.debtNow;
        valid.debtCeiling = loan.debtAtDeadline;
        if (valid.debtCeiling > type(uint128).max) revert Errors.UnsupportedCashAmount();
        if (loan.debtNow > quote.maxDebtAtAcceptance || loan.debtAtDeadline > quote.maxDebtAtDeadline) {
            revert DebtLimitExceeded();
        }
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
        if (session.scheduledClose < coverOpensBeforeClose) revert InvalidCoverWindow();
        uint64 opens = session.scheduledClose - coverOpensBeforeClose;
        uint64 cutoff = session.scheduledClose - coverCutoffBeforeClose;
        if (
            session.scheduledOpen > opens || opens >= cutoff || cutoff >= session.scheduledClose
                || block.timestamp < opens || block.timestamp >= cutoff
        ) revert InvalidCoverWindow();
        if (quote.snapshotMultiplierNumerator == 0 || quote.snapshotMultiplierDenominator == 0) {
            revert Errors.InvalidMultiplier();
        }
        Types.ReferencePriceFact memory fact = oracle.requireFreshReference(quote.assetId);
        if (
            fact.reportHash != quote.referenceReportHash || fact.configHash != quote.configHash
                || fact.sessionId != quote.sessionId
                || quote.referencePrice
                    != FixedPointMath.mulDivDown(
                        fact.price,
                        uint256(fact.multiplierNumerator) * quote.snapshotMultiplierDenominator,
                        uint256(fact.multiplierDenominator) * quote.snapshotMultiplierNumerator
                    )
        ) revert ReferenceFactsMismatch();
        if (
            quote.policyHash
                != policyHash(
                    quote.assetId,
                    quote.sessionId,
                    quote.configHash,
                    quote.snapshotMultiplierNumerator,
                    quote.snapshotMultiplierDenominator
                )
        ) revert InvalidPolicy();
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
