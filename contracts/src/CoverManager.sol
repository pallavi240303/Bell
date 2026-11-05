// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
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
    enum ReceiptStatus {
        NONE,
        ACTIVE,
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

    uint256 public nextReceiptId = 1;
    mapping(address => uint256) public borrowerNonce;
    mapping(uint256 receiptId => Receipt receipt) private _receipts;

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
            status: ReceiptStatus.ACTIVE
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
        return vault.debtOf(receiptId);
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
