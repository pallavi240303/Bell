// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IEligibilityPolicy} from "./interfaces/IEligibilityPolicy.sol";
import {Errors} from "./lib/Errors.sol";
import {SettlementMath} from "./lib/SettlementMath.sol";
import {Types} from "./lib/Types.sol";

contract CommitmentBook is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable cashToken;
    IEligibilityPolicy public immutable eligibilityPolicy;
    address public immutable owner;

    address public coverManager;
    address public protectedPool;

    uint256 public totalLockedCash;
    uint256 public totalPremiumCredits;
    uint256 public totalCashCredits;

    mapping(bytes32 offerId => Types.Offer offer) private _offers;
    mapping(bytes32 offerId => bytes32 termsHash) private _termsHashes;
    mapping(address buyer => mapping(uint256 nonce => bool used)) public nonceUsed;
    mapping(address account => uint256 amount) public premiumCredit;
    mapping(address account => uint256 amount) public cashCredit;

    event Initialized(address indexed coverManager, address indexed protectedPool);
    event OfferPosted(
        bytes32 indexed offerId, address indexed buyer, bytes32 indexed assetId, uint256 cashCapacity, bytes32 termsHash
    );
    event OfferCancelled(bytes32 indexed offerId, address indexed buyer, uint256 cashCredit);
    event OfferReserved(
        bytes32 indexed offerId, uint256 indexed receiptId, address indexed premiumPayer, uint256 premium
    );
    event OfferExercised(
        bytes32 indexed offerId,
        uint256 indexed receiptId,
        uint256 cumulativeShares,
        uint256 cashCharged,
        uint256 debtApplied,
        uint256 borrowerExcess
    );
    event OfferReleased(bytes32 indexed offerId, address indexed buyer, uint256 cashCredit);
    event PremiumWithdrawn(address indexed account, address indexed to, uint256 amount);
    event CashCreditWithdrawn(address indexed account, address indexed to, uint256 amount);

    constructor(address cashToken_, address eligibilityPolicy_, address owner_) {
        if (cashToken_ == address(0) || eligibilityPolicy_ == address(0) || owner_ == address(0)) {
            revert Errors.ZeroAddress();
        }
        cashToken = IERC20(cashToken_);
        eligibilityPolicy = IEligibilityPolicy(eligibilityPolicy_);
        owner = owner_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Errors.Unauthorized(msg.sender);
        _;
    }

    modifier onlyManager() {
        if (msg.sender != coverManager) revert Errors.UnauthorizedManager(msg.sender);
        _;
    }

    modifier whenInitialized() {
        if (coverManager == address(0)) revert Errors.NotInitialized();
        _;
    }

    function initialize(address coverManager_, address protectedPool_) external onlyOwner {
        if (coverManager != address(0)) revert Errors.AlreadyInitialized();
        if (coverManager_ == address(0) || protectedPool_ == address(0)) revert Errors.ZeroAddress();
        coverManager = coverManager_;
        protectedPool = protectedPool_;
        emit Initialized(coverManager_, protectedPool_);
    }

    function postOffer(Types.OfferTerms calldata terms)
        external
        nonReentrant
        whenInitialized
        returns (bytes32 offerId)
    {
        _validateTerms(terms);
        if (!eligibilityPolicy.isEligible(terms.assetId, msg.sender, terms.policyHash)) {
            revert Errors.IneligibleBuyer(msg.sender);
        }
        if (nonceUsed[msg.sender][terms.nonce]) revert Errors.OfferNonceUsed(msg.sender, terms.nonce);

        offerId = computeOfferId(msg.sender, terms.nonce);
        uint256 cashCapacity = SettlementMath.cashOwed(terms.snapshotShares, terms.strike);

        nonceUsed[msg.sender][terms.nonce] = true;
        Types.Offer storage offer = _offers[offerId];
        offer.buyer = msg.sender;
        offer.terms = terms;
        offer.cashCapacity = cashCapacity;
        offer.status = Types.OfferStatus.FREE;
        bytes32 identity = keccak256(abi.encode(offerId, msg.sender, terms, cashCapacity));
        _termsHashes[offerId] = identity;
        totalLockedCash += cashCapacity;

        _pullExact(msg.sender, cashCapacity);
        _assertSolvent();
        emit OfferPosted(offerId, msg.sender, terms.assetId, cashCapacity, identity);
    }

    function cancelOffer(bytes32 offerId) external {
        Types.Offer storage offer = _offers[offerId];
        if (msg.sender != offer.buyer) revert Errors.NotOfferBuyer(msg.sender);
        _requireStatus(offer, Types.OfferStatus.FREE);

        offer.status = Types.OfferStatus.CANCELLED;
        totalLockedCash -= offer.cashCapacity;
        cashCredit[offer.buyer] += offer.cashCapacity;
        totalCashCredits += offer.cashCapacity;
        _assertSolvent();
        emit OfferCancelled(offerId, offer.buyer, offer.cashCapacity);
    }

    function reserveOffer(
        bytes32 offerId,
        bytes32 expectedTermsHash,
        uint256 receiptId,
        address premiumPayer,
        uint64 settlementDeadline,
        uint256 acceptedReferencePrice,
        uint16 borrowerLtvBps
    ) external nonReentrant onlyManager returns (uint256 premium) {
        if (receiptId == 0) revert Errors.InvalidReceiptId();
        if (premiumPayer == address(0)) revert Errors.ZeroAddress();

        Types.Offer storage offer = _offers[offerId];
        _requireStatus(offer, Types.OfferStatus.FREE);
        if (_termsHashes[offerId] != expectedTermsHash) revert Errors.OfferTermsHashMismatch();
        // forge-lint: disable-next-line(block-timestamp)
        if (offer.terms.expiry < block.timestamp || offer.terms.expiry < settlementDeadline) {
            revert Errors.OfferExpiredBeforeSettlement();
        }
        if (borrowerLtvBps > offer.terms.maxBorrowerLtvBps) revert Errors.BorrowerLtvTooHigh();
        if (acceptedReferencePrice > type(uint96).max) revert Errors.UnsupportedPrice();
        if (!eligibilityPolicy.isEligible(offer.terms.assetId, offer.buyer, offer.terms.policyHash)) {
            revert Errors.IneligibleBuyer(offer.buyer);
        }
        _validateReferenceDeviation(offer.terms, acceptedReferencePrice);

        offer.status = Types.OfferStatus.RESERVED;
        offer.receiptId = receiptId;
        premium = offer.terms.premium;
        if (premium != 0) {
            premiumCredit[offer.buyer] += premium;
            totalPremiumCredits += premium;
            _pullExact(premiumPayer, premium);
        }
        _assertSolvent();
        emit OfferReserved(offerId, receiptId, premiumPayer, premium);
    }

    function exerciseOffer(bytes32 offerId, uint256 newCumulativeSnapshotShares, uint256 debtApplied, address borrower)
        external
        nonReentrant
        onlyManager
        returns (uint256 cashCharged, uint256 borrowerExcess)
    {
        if (borrower == address(0)) revert Errors.ZeroAddress();
        Types.Offer storage offer = _offers[offerId];
        _requireStatus(offer, Types.OfferStatus.RESERVED);
        if (
            newCumulativeSnapshotShares <= offer.cumulativeExercisedShares
                || newCumulativeSnapshotShares > offer.terms.snapshotShares
        ) {
            revert Errors.InvalidExerciseShares();
        }

        cashCharged =
            SettlementMath.cashDelta(offer.cumulativeExercisedShares, newCumulativeSnapshotShares, offer.terms.strike);
        if (debtApplied == 0 || debtApplied > cashCharged) revert Errors.InvalidDebtApplied();
        borrowerExcess = cashCharged - debtApplied;

        offer.cumulativeExercisedShares = newCumulativeSnapshotShares;
        offer.cumulativeCashCharged += cashCharged;
        totalLockedCash -= cashCharged;
        if (borrowerExcess != 0) {
            cashCredit[borrower] += borrowerExcess;
            totalCashCredits += borrowerExcess;
        }

        _pushExact(protectedPool, debtApplied);
        _assertSolvent();
        emit OfferExercised(
            offerId, offer.receiptId, newCumulativeSnapshotShares, cashCharged, debtApplied, borrowerExcess
        );
    }

    function releaseOffer(bytes32 offerId) external onlyManager {
        Types.Offer storage offer = _offers[offerId];
        _requireStatus(offer, Types.OfferStatus.RESERVED);

        uint256 unchargedCash = offer.cashCapacity - offer.cumulativeCashCharged;
        offer.status = Types.OfferStatus.RELEASED;
        if (unchargedCash != 0) {
            totalLockedCash -= unchargedCash;
            cashCredit[offer.buyer] += unchargedCash;
            totalCashCredits += unchargedCash;
        }
        _assertSolvent();
        emit OfferReleased(offerId, offer.buyer, unchargedCash);
    }

    function withdrawPremium(uint256 amount, address to) external nonReentrant {
        if (to == address(0)) revert Errors.ZeroAddress();
        uint256 available = premiumCredit[msg.sender];
        if (amount == 0 || amount > available) revert Errors.InsufficientCredit();
        premiumCredit[msg.sender] = available - amount;
        totalPremiumCredits -= amount;
        _pushExact(to, amount);
        _assertSolvent();
        emit PremiumWithdrawn(msg.sender, to, amount);
    }

    function withdrawCashCredit(uint256 amount, address to) external nonReentrant {
        if (to == address(0)) revert Errors.ZeroAddress();
        uint256 available = cashCredit[msg.sender];
        if (amount == 0 || amount > available) revert Errors.InsufficientCredit();
        cashCredit[msg.sender] = available - amount;
        totalCashCredits -= amount;
        _pushExact(to, amount);
        _assertSolvent();
        emit CashCreditWithdrawn(msg.sender, to, amount);
    }

    function computeOfferId(address buyer, uint256 nonce) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), buyer, nonce));
    }

    function getOffer(bytes32 offerId) external view returns (Types.Offer memory) {
        return _offers[offerId];
    }

    function termsHashOf(bytes32 offerId) external view returns (bytes32) {
        return _termsHashes[offerId];
    }

    function totalLiabilities() public view returns (uint256) {
        return totalLockedCash + totalPremiumCredits + totalCashCredits;
    }

    function _validateTerms(Types.OfferTerms calldata terms) private view {
        // forge-lint: disable-next-line(block-timestamp)
        bool expired = terms.expiry <= block.timestamp;
        if (
            terms.assetId == bytes32(0) || terms.policyHash == bytes32(0) || terms.snapshotShares == 0
                || terms.strike == 0 || terms.referencePrice == 0 || expired
        ) {
            revert Errors.InvalidOfferTerms();
        }
        if (terms.maxBorrowerLtvBps > Types.BPS || terms.maxReferenceDeviationBps > Types.BPS) {
            revert Errors.InvalidOfferTerms();
        }
        if (terms.premium > type(uint128).max) revert Errors.UnsupportedCashAmount();
        SettlementMath.cashOwed(terms.snapshotShares, terms.strike);
        if (terms.referencePrice > type(uint96).max) revert Errors.UnsupportedPrice();
    }

    function _validateReferenceDeviation(Types.OfferTerms storage terms, uint256 acceptedReferencePrice) private view {
        uint256 difference = acceptedReferencePrice > terms.referencePrice
            ? acceptedReferencePrice - terms.referencePrice
            : terms.referencePrice - acceptedReferencePrice;
        if (difference * uint256(Types.BPS) > terms.referencePrice * terms.maxReferenceDeviationBps) {
            revert Errors.ReferenceDeviationTooHigh();
        }
    }

    function _requireStatus(Types.Offer storage offer, Types.OfferStatus expected) private view {
        if (offer.status != expected) revert Errors.InvalidOfferState(expected, offer.status);
    }

    function _pullExact(address from, uint256 amount) private {
        uint256 beforeBalance = cashToken.balanceOf(address(this));
        cashToken.safeTransferFrom(from, address(this), amount);
        uint256 received = cashToken.balanceOf(address(this)) - beforeBalance;
        if (received != amount) revert Errors.InvalidTokenBalanceDelta(amount, received);
    }

    function _pushExact(address to, uint256 amount) private {
        uint256 beforeBalance = cashToken.balanceOf(to);
        cashToken.safeTransfer(to, amount);
        uint256 received = cashToken.balanceOf(to) - beforeBalance;
        if (received != amount) revert Errors.InvalidTokenBalanceDelta(amount, received);
    }

    function _assertSolvent() private view {
        uint256 liabilities = totalLiabilities();
        uint256 balance = cashToken.balanceOf(address(this));
        if (balance < liabilities) revert Errors.LiabilityShortfall(balance, liabilities);
    }
}
