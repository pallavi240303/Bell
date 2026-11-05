// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";

import {CommitmentBook} from "../../src/CommitmentBook.sol";
import {Errors} from "../../src/lib/Errors.sol";
import {Types} from "../../src/lib/Types.sol";
import {MockCashToken} from "../helpers/MockCashToken.sol";
import {MockEligibilityPolicy} from "../helpers/MockEligibilityPolicy.sol";

contract CommitmentBookTest is Test {
    uint256 internal constant SHARE_SCALE = 1e18;
    bytes32 internal constant ASSET_ID = keccak256("BELL_STOCK");
    bytes32 internal constant POLICY_HASH = keccak256("ELIGIBLE_BUYER_POLICY");
    address internal constant OWNER = address(0xA11CE);
    address internal constant MANAGER = address(0xB311);
    address internal constant POOL = address(0xB001);
    address internal constant BUYER = address(0xB0B);
    address internal constant BORROWER = address(0xA1A);
    address internal constant ATTACKER = address(0xBAD);
    address internal constant RECIPIENT = address(0xCAFE);

    MockCashToken internal cash;
    MockEligibilityPolicy internal eligibility;
    CommitmentBook internal book;

    function setUp() public {
        vm.warp(100_000);
        cash = new MockCashToken();
        eligibility = new MockEligibilityPolicy();
        book = new CommitmentBook(address(cash), address(eligibility), OWNER);

        vm.prank(OWNER);
        book.initialize(MANAGER, POOL);
        eligibility.setEligible(ASSET_ID, BUYER, POLICY_HASH, true);

        cash.mint(BUYER, 10_000_000_000);
        cash.mint(BORROWER, 10_000_000_000);
        vm.prank(BUYER);
        cash.approve(address(book), type(uint256).max);
        vm.prank(BORROWER);
        cash.approve(address(book), type(uint256).max);
    }

    function testInitializationIsOwnerOnlyOneShotAndRequiredBeforeFunding() public {
        CommitmentBook fresh = new CommitmentBook(address(cash), address(eligibility), OWNER);

        vm.prank(BUYER);
        vm.expectRevert(Errors.NotInitialized.selector);
        fresh.postOffer(_terms(1));

        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Errors.Unauthorized.selector, ATTACKER));
        fresh.initialize(MANAGER, POOL);

        vm.prank(OWNER);
        vm.expectRevert(Errors.ZeroAddress.selector);
        fresh.initialize(address(0), POOL);

        vm.prank(OWNER);
        fresh.initialize(MANAGER, POOL);
        assertEq(fresh.coverManager(), MANAGER);
        assertEq(fresh.protectedPool(), POOL);

        vm.prank(OWNER);
        vm.expectRevert(Errors.AlreadyInitialized.selector);
        fresh.initialize(address(0x123), address(0x456));
    }

    function testConstructorRejectsZeroDependencies() public {
        vm.expectRevert(Errors.ZeroAddress.selector);
        new CommitmentBook(address(0), address(eligibility), OWNER);

        vm.expectRevert(Errors.ZeroAddress.selector);
        new CommitmentBook(address(cash), address(0), OWNER);

        vm.expectRevert(Errors.ZeroAddress.selector);
        new CommitmentBook(address(cash), address(eligibility), address(0));
    }

    function testPostOfferPullsExactWholeCapacityAndSpendsNonce() public {
        Types.OfferTerms memory terms = _terms(1);
        uint256 buyerBefore = cash.balanceOf(BUYER);

        bytes32 offerId = _post(BUYER, terms);
        Types.Offer memory offer = book.getOffer(offerId);

        assertEq(offer.buyer, BUYER);
        assertEq(offer.cashCapacity, 1_000_000_000);
        assertEq(uint8(offer.status), uint8(Types.OfferStatus.FREE));
        assertEq(cash.balanceOf(address(book)), offer.cashCapacity);
        assertEq(cash.balanceOf(BUYER), buyerBefore - offer.cashCapacity);
        assertEq(book.totalLockedCash(), offer.cashCapacity);
        assertTrue(book.nonceUsed(BUYER, terms.nonce));
        _assertFullyCovered();

        vm.prank(BUYER);
        book.cancelOffer(offerId);
        vm.prank(BUYER);
        vm.expectRevert(abi.encodeWithSelector(Errors.OfferNonceUsed.selector, BUYER, terms.nonce));
        book.postOffer(terms);
    }

    function testPostRejectsShortFundingWithoutSpendingNonceOrCreatingOffer() public {
        Types.OfferTerms memory terms = _terms(7);
        bytes32 expectedId = book.computeOfferId(BUYER, terms.nonce);
        cash.setShortTransferFrom(true);

        vm.prank(BUYER);
        vm.expectRevert();
        book.postOffer(terms);

        assertFalse(book.nonceUsed(BUYER, terms.nonce));
        assertEq(uint8(book.getOffer(expectedId).status), uint8(Types.OfferStatus.NONE));
        assertEq(cash.balanceOf(address(book)), 0);
    }

    function testPostRejectsInvalidTermsAndIneligibleBuyer() public {
        Types.OfferTerms memory terms = _terms(1);
        terms.assetId = bytes32(0);
        _expectInvalidTerms(terms);

        terms = _terms(2);
        terms.policyHash = bytes32(0);
        _expectInvalidTerms(terms);

        terms = _terms(3);
        terms.snapshotShares = 0;
        _expectInvalidTerms(terms);

        terms = _terms(4);
        terms.strike = 0;
        _expectInvalidTerms(terms);

        terms = _terms(5);
        terms.referencePrice = 0;
        _expectInvalidTerms(terms);

        terms = _terms(6);
        terms.expiry = uint64(block.timestamp);
        _expectInvalidTerms(terms);

        terms = _terms(7);
        terms.maxBorrowerLtvBps = 10_001;
        _expectInvalidTerms(terms);

        terms = _terms(8);
        terms.maxReferenceDeviationBps = 10_001;
        _expectInvalidTerms(terms);

        terms = _terms(9);
        terms.premium = uint256(type(uint128).max) + 1;
        vm.prank(BUYER);
        vm.expectRevert(Errors.UnsupportedCashAmount.selector);
        book.postOffer(terms);

        terms = _terms(10);
        terms.snapshotShares = uint256(type(uint128).max) + 1;
        vm.prank(BUYER);
        vm.expectRevert(Errors.UnsupportedShareAmount.selector);
        book.postOffer(terms);

        terms = _terms(11);
        terms.strike = uint256(type(uint96).max) + 1;
        vm.prank(BUYER);
        vm.expectRevert(Errors.UnsupportedPrice.selector);
        book.postOffer(terms);

        terms = _terms(12);
        terms.referencePrice = uint256(type(uint96).max) + 1;
        vm.prank(BUYER);
        vm.expectRevert(Errors.UnsupportedPrice.selector);
        book.postOffer(terms);

        terms = _terms(13);
        eligibility.setEligible(ASSET_ID, BUYER, POLICY_HASH, false);
        vm.prank(BUYER);
        vm.expectRevert(abi.encodeWithSelector(Errors.IneligibleBuyer.selector, BUYER));
        book.postOffer(terms);
    }

    function testTermsHashIsStableAndBindsEveryTermAndCapacity() public {
        Types.OfferTerms memory terms = _terms(1);
        bytes32 offerId = _post(BUYER, terms);
        Types.Offer memory offer = book.getOffer(offerId);
        bytes32 expected = keccak256(abi.encode(offerId, BUYER, terms, offer.cashCapacity));

        assertEq(book.termsHashOf(offerId), expected);
        assertEq(book.termsHashOf(offerId), book.termsHashOf(offerId));
    }

    function testCancelIsBuyerOnlyFreeOnlyAndUsesPullCredit() public {
        bytes32 offerId = _post(BUYER, _terms(1));
        uint256 capacity = book.getOffer(offerId).cashCapacity;

        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Errors.NotOfferBuyer.selector, ATTACKER));
        book.cancelOffer(offerId);

        uint256 bookBalance = cash.balanceOf(address(book));
        vm.prank(BUYER);
        book.cancelOffer(offerId);
        assertEq(cash.balanceOf(address(book)), bookBalance);
        assertEq(book.cashCredit(BUYER), capacity);
        assertEq(book.totalLockedCash(), 0);
        assertEq(book.totalCashCredits(), capacity);
        assertEq(uint8(book.getOffer(offerId).status), uint8(Types.OfferStatus.CANCELLED));

        vm.prank(BUYER);
        vm.expectRevert();
        book.cancelOffer(offerId);

        vm.prank(BUYER);
        book.withdrawCashCredit(capacity, RECIPIENT);
        assertEq(cash.balanceOf(RECIPIENT), capacity);
        assertEq(book.cashCredit(BUYER), 0);
        _assertFullyCovered();
    }

    function testReserveChecksManagerTermsDeadlineLtvDeviationAndEligibility() public {
        Types.OfferTerms memory terms = _terms(1);
        bytes32 offerId = _post(BUYER, terms);
        bytes32 termsHash = book.termsHashOf(offerId);

        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedManager.selector, ATTACKER));
        book.reserveOffer(offerId, termsHash, 1, BORROWER, terms.expiry, terms.referencePrice, 6_500);

        vm.prank(MANAGER);
        vm.expectRevert(Errors.OfferTermsHashMismatch.selector);
        book.reserveOffer(offerId, bytes32(uint256(1)), 1, BORROWER, terms.expiry, terms.referencePrice, 6_500);

        vm.prank(MANAGER);
        vm.expectRevert(Errors.OfferExpiredBeforeSettlement.selector);
        book.reserveOffer(offerId, termsHash, 1, BORROWER, terms.expiry + 1, terms.referencePrice, 6_500);

        vm.prank(MANAGER);
        vm.expectRevert(Errors.BorrowerLtvTooHigh.selector);
        book.reserveOffer(offerId, termsHash, 1, BORROWER, terms.expiry, terms.referencePrice, 7_001);

        vm.prank(MANAGER);
        vm.expectRevert(Errors.ReferenceDeviationTooHigh.selector);
        book.reserveOffer(offerId, termsHash, 1, BORROWER, terms.expiry, 105_000_001, 6_500);

        vm.prank(MANAGER);
        vm.expectRevert(Errors.UnsupportedPrice.selector);
        book.reserveOffer(offerId, termsHash, 1, BORROWER, terms.expiry, uint256(type(uint96).max) + 1, 6_500);

        eligibility.setEligible(ASSET_ID, BUYER, POLICY_HASH, false);
        vm.prank(MANAGER);
        vm.expectRevert(abi.encodeWithSelector(Errors.IneligibleBuyer.selector, BUYER));
        book.reserveOffer(offerId, termsHash, 1, BORROWER, terms.expiry, 105_000_000, 6_500);

        eligibility.setEligible(ASSET_ID, BUYER, POLICY_HASH, true);
        vm.prank(MANAGER);
        book.reserveOffer(offerId, termsHash, 1, BORROWER, terms.expiry, 105_000_000, 7_000);

        Types.Offer memory reserved = book.getOffer(offerId);
        assertEq(uint8(reserved.status), uint8(Types.OfferStatus.RESERVED));
        assertEq(reserved.receiptId, 1);
        assertEq(book.premiumCredit(BUYER), terms.premium);
        assertEq(book.totalPremiumCredits(), terms.premium);
        _assertFullyCovered();

        vm.prank(MANAGER);
        vm.expectRevert();
        book.reserveOffer(offerId, termsHash, 2, BORROWER, terms.expiry, terms.referencePrice, 6_500);
    }

    function testExpiredOfferCannotBeReserved() public {
        Types.OfferTerms memory terms = _terms(1);
        bytes32 offerId = _post(BUYER, terms);
        bytes32 termsHash = book.termsHashOf(offerId);

        vm.warp(terms.expiry + 1);
        vm.prank(MANAGER);
        vm.expectRevert(Errors.OfferExpiredBeforeSettlement.selector);
        book.reserveOffer(offerId, termsHash, 1, BORROWER, terms.expiry, terms.referencePrice, terms.maxBorrowerLtvBps);
    }

    function testReserveRejectsInvalidReceiptAndPremiumPayerAndShortPremiumPull() public {
        Types.OfferTerms memory terms = _terms(1);
        bytes32 offerId = _post(BUYER, terms);
        bytes32 termsHash = book.termsHashOf(offerId);

        vm.startPrank(MANAGER);
        vm.expectRevert(Errors.InvalidReceiptId.selector);
        book.reserveOffer(offerId, termsHash, 0, BORROWER, terms.expiry, terms.referencePrice, 6_500);
        vm.expectRevert(Errors.ZeroAddress.selector);
        book.reserveOffer(offerId, termsHash, 1, address(0), terms.expiry, terms.referencePrice, 6_500);
        vm.stopPrank();

        cash.setShortTransferFrom(true);
        vm.prank(MANAGER);
        vm.expectRevert();
        book.reserveOffer(offerId, termsHash, 1, BORROWER, terms.expiry, terms.referencePrice, 6_500);

        Types.Offer memory offer = book.getOffer(offerId);
        assertEq(uint8(offer.status), uint8(Types.OfferStatus.FREE));
        assertEq(offer.receiptId, 0);
        assertEq(book.premiumCredit(BUYER), 0);
        assertEq(book.totalPremiumCredits(), 0);
    }

    function testExerciseAndReleaseAreManagerOnly() public {
        Types.OfferTerms memory terms = _terms(1);
        bytes32 offerId = _post(BUYER, terms);
        _reserve(offerId, 1, terms.referencePrice, 6_500);

        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedManager.selector, ATTACKER));
        book.exerciseOffer(offerId, SHARE_SCALE, 100_000_000, BORROWER);

        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedManager.selector, ATTACKER));
        book.releaseOffer(offerId);
    }

    function testPremiumIsImmediateAndNonRefundableOnRelease() public {
        Types.OfferTerms memory terms = _terms(1);
        bytes32 offerId = _post(BUYER, terms);
        _reserve(offerId, 1, terms.referencePrice, terms.maxBorrowerLtvBps);

        uint256 buyerPremium = book.premiumCredit(BUYER);
        vm.prank(MANAGER);
        book.releaseOffer(offerId);

        assertEq(book.premiumCredit(BUYER), buyerPremium);
        assertEq(book.cashCredit(BUYER), book.getOffer(offerId).cashCapacity);
        assertEq(uint8(book.getOffer(offerId).status), uint8(Types.OfferStatus.RELEASED));
        _assertFullyCovered();
    }

    function testCumulativeExercisePaysPoolAndCreditsLastFillExcess() public {
        Types.OfferTerms memory terms = _terms(1);
        bytes32 offerId = _post(BUYER, terms);
        _reserve(offerId, 1, terms.referencePrice, 6_500);

        vm.prank(MANAGER);
        (uint256 firstCash, uint256 firstExcess) = book.exerciseOffer(offerId, 4 * SHARE_SCALE, 400_000_000, BORROWER);
        assertEq(firstCash, 400_000_000);
        assertEq(firstExcess, 0);
        assertEq(cash.balanceOf(POOL), 400_000_000);

        vm.prank(MANAGER);
        (uint256 secondCash, uint256 secondExcess) =
            book.exerciseOffer(offerId, 10 * SHARE_SCALE, 550_000_000, BORROWER);
        assertEq(secondCash, 600_000_000);
        assertEq(secondExcess, 50_000_000);
        assertEq(cash.balanceOf(POOL), 950_000_000);
        assertEq(book.cashCredit(BORROWER), 50_000_000);
        assertEq(book.totalLockedCash(), 0);

        Types.Offer memory exercised = book.getOffer(offerId);
        assertEq(exercised.cumulativeExercisedShares, terms.snapshotShares);
        assertEq(exercised.cumulativeCashCharged, exercised.cashCapacity);
        _assertFullyCovered();

        vm.prank(MANAGER);
        vm.expectRevert();
        book.exerciseOffer(offerId, terms.snapshotShares + 1, 1, BORROWER);
    }

    function testLaterIneligibilityDoesNotBlockExerciseOrRelease() public {
        Types.OfferTerms memory terms = _terms(1);
        bytes32 offerId = _post(BUYER, terms);
        _reserve(offerId, 1, terms.referencePrice, 6_500);
        eligibility.setEligible(ASSET_ID, BUYER, POLICY_HASH, false);

        vm.prank(MANAGER);
        book.exerciseOffer(offerId, 2 * SHARE_SCALE, 200_000_000, BORROWER);
        vm.prank(MANAGER);
        book.releaseOffer(offerId);

        assertEq(book.cashCredit(BUYER), 800_000_000);
        assertEq(uint8(book.getOffer(offerId).status), uint8(Types.OfferStatus.RELEASED));
    }

    function testReleaseCreditsOnlyUnchargedEscrow() public {
        Types.OfferTerms memory terms = _terms(1);
        bytes32 offerId = _post(BUYER, terms);
        _reserve(offerId, 1, terms.referencePrice, 6_500);

        vm.prank(MANAGER);
        book.exerciseOffer(offerId, 4 * SHARE_SCALE, 400_000_000, BORROWER);
        vm.prank(MANAGER);
        book.releaseOffer(offerId);

        assertEq(book.cashCredit(BUYER), 600_000_000);
        assertEq(book.totalLockedCash(), 0);
        _assertFullyCovered();
    }

    function testExerciseRejectsInvalidCumulativeCashAndDebtApplied() public {
        Types.OfferTerms memory terms = _terms(1);
        bytes32 offerId = _post(BUYER, terms);
        _reserve(offerId, 1, terms.referencePrice, 6_500);

        vm.startPrank(MANAGER);
        vm.expectRevert(Errors.InvalidDebtApplied.selector);
        book.exerciseOffer(offerId, SHARE_SCALE, 0, BORROWER);
        vm.expectRevert(Errors.InvalidDebtApplied.selector);
        book.exerciseOffer(offerId, SHARE_SCALE, 100_000_001, BORROWER);
        book.exerciseOffer(offerId, SHARE_SCALE, 100_000_000, BORROWER);
        vm.expectRevert(Errors.InvalidExerciseShares.selector);
        book.exerciseOffer(offerId, SHARE_SCALE, 1, BORROWER);
        vm.expectRevert(Errors.InvalidExerciseShares.selector);
        book.exerciseOffer(offerId, terms.snapshotShares + 1, 1, BORROWER);
        vm.stopPrank();
    }

    function testShortPoolTransferRevertsWithoutAccountingMutation() public {
        Types.OfferTerms memory terms = _terms(1);
        bytes32 offerId = _post(BUYER, terms);
        _reserve(offerId, 1, terms.referencePrice, 6_500);
        uint256 lockedBefore = book.totalLockedCash();
        uint256 balanceBefore = cash.balanceOf(address(book));
        cash.setShortTransfer(true);

        vm.prank(MANAGER);
        vm.expectRevert();
        book.exerciseOffer(offerId, SHARE_SCALE, 100_000_000, BORROWER);

        Types.Offer memory offer = book.getOffer(offerId);
        assertEq(offer.cumulativeExercisedShares, 0);
        assertEq(offer.cumulativeCashCharged, 0);
        assertEq(book.totalLockedCash(), lockedBefore);
        assertEq(cash.balanceOf(address(book)), balanceBefore);
        assertEq(cash.balanceOf(POOL), 0);
    }

    function testCreditLedgersAreSeparatedAndWithdrawalsAreAtomic() public {
        Types.OfferTerms memory terms = _terms(1);
        bytes32 offerId = _post(BUYER, terms);
        _reserve(offerId, 1, terms.referencePrice, 6_500);
        vm.prank(MANAGER);
        book.releaseOffer(offerId);

        vm.prank(BUYER);
        vm.expectRevert(Errors.InsufficientCredit.selector);
        book.withdrawPremium(terms.premium + 1, RECIPIENT);

        vm.prank(BUYER);
        vm.expectRevert(Errors.ZeroAddress.selector);
        book.withdrawCashCredit(1, address(0));

        vm.prank(BUYER);
        vm.expectRevert(Errors.InsufficientCredit.selector);
        book.withdrawCashCredit(0, RECIPIENT);

        uint256 premiumBefore = book.premiumCredit(BUYER);
        cash.setFailTransfer(true);
        vm.prank(BUYER);
        vm.expectRevert();
        book.withdrawPremium(premiumBefore, RECIPIENT);
        assertEq(book.premiumCredit(BUYER), premiumBefore);
        assertEq(book.totalPremiumCredits(), premiumBefore);

        cash.setFailTransfer(false);
        vm.prank(BUYER);
        book.withdrawPremium(premiumBefore, RECIPIENT);
        assertEq(cash.balanceOf(RECIPIENT), premiumBefore);
        assertEq(book.premiumCredit(BUYER), 0);
        assertEq(book.cashCredit(BUYER), book.getOffer(offerId).cashCapacity);
        _assertFullyCovered();
    }

    function testReentrantWithdrawalRevertsAndRestoresCredit() public {
        bytes32 offerId = _post(BUYER, _terms(1));
        vm.prank(BUYER);
        book.cancelOffer(offerId);
        uint256 creditBefore = book.cashCredit(BUYER);
        cash.setTransferHook(address(book), abi.encodeCall(CommitmentBook.withdrawCashCredit, (1, ATTACKER)));

        vm.prank(BUYER);
        vm.expectRevert();
        book.withdrawCashCredit(1, RECIPIENT);

        assertEq(book.cashCredit(BUYER), creditBefore);
        assertEq(book.totalCashCredits(), creditBefore);
        assertEq(cash.balanceOf(RECIPIENT), 0);
    }

    function testMixedLifecycleConservesLockedPremiumAndCashLiabilities() public {
        Types.OfferTerms memory cancelledTerms = _terms(1);
        bytes32 cancelled = _post(BUYER, cancelledTerms);
        vm.prank(BUYER);
        book.cancelOffer(cancelled);

        Types.OfferTerms memory reservedTerms = _terms(2);
        bytes32 reserved = _post(BUYER, reservedTerms);
        _reserve(reserved, 2, reservedTerms.referencePrice, 6_500);
        vm.prank(MANAGER);
        book.exerciseOffer(reserved, 4 * SHARE_SCALE, 350_000_000, BORROWER);
        vm.prank(MANAGER);
        book.releaseOffer(reserved);

        assertEq(book.totalLockedCash(), 0);
        assertEq(book.premiumCredit(BUYER), reservedTerms.premium);
        assertEq(book.cashCredit(BUYER), 1_600_000_000);
        assertEq(book.cashCredit(BORROWER), 50_000_000);
        _assertFullyCovered();

        vm.prank(BUYER);
        book.withdrawCashCredit(600_000_000, RECIPIENT);
        vm.prank(BORROWER);
        book.withdrawCashCredit(50_000_000, RECIPIENT);
        _assertFullyCovered();
    }

    function _post(address buyer, Types.OfferTerms memory terms) internal returns (bytes32 offerId) {
        vm.prank(buyer);
        offerId = book.postOffer(terms);
    }

    function _reserve(bytes32 offerId, uint256 receiptId, uint256 acceptedReference, uint16 ltv) internal {
        bytes32 termsHash = book.termsHashOf(offerId);
        uint64 expiry = book.getOffer(offerId).terms.expiry;
        vm.prank(MANAGER);
        book.reserveOffer(offerId, termsHash, receiptId, BORROWER, expiry, acceptedReference, ltv);
    }

    function _terms(uint256 nonce) internal view returns (Types.OfferTerms memory terms) {
        terms = Types.OfferTerms({
            assetId: ASSET_ID,
            policyHash: POLICY_HASH,
            snapshotShares: 10 * SHARE_SCALE,
            strike: 100_000_000,
            premium: 10_000_000,
            maxBorrowerLtvBps: 7_000,
            referencePrice: 100_000_000,
            maxReferenceDeviationBps: 500,
            expiry: uint64(block.timestamp + 1_000),
            nonce: nonce
        });
    }

    function _expectInvalidTerms(Types.OfferTerms memory terms) internal {
        vm.prank(BUYER);
        vm.expectRevert();
        book.postOffer(terms);
    }

    function _assertFullyCovered() internal view {
        assertEq(
            cash.balanceOf(address(book)), book.totalLockedCash() + book.totalPremiumCredits() + book.totalCashCredits()
        );
    }
}
