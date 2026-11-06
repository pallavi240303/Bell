// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {ReceiptFixture} from "../helpers/ReceiptFixture.sol";
import {CoverManager} from "../../src/CoverManager.sol";
import {LoanManager} from "../../src/LoanManager.sol";
import {LoanVault} from "../../src/LoanVault.sol";
import {QuoteHash} from "../../src/lib/QuoteHash.sol";
import {Types} from "../../src/lib/Types.sol";
import {Errors} from "../../src/lib/Errors.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract BuyCoverTest is ReceiptFixture {
    function setUp() public override {
        super.setUp();
        _openOrdinary();
    }

    function _reject(bytes4 error) internal {
        bytes32 beforeState = keccak256(
            abi.encode(
                vault.getDebt(quote.loanId),
                loans.getLoan(quote.loanId),
                book.totalLiabilities(),
                cash.balanceOf(BORROWER),
                pool.totalAssets()
            )
        );
        bytes32 digest = QuoteHash.hash(address(manager), quote, ids, hashes);
        vm.prank(BORROWER);
        vm.expectPartialRevert(error);
        manager.buyCover(quote.loanId, quote, ids, hashes, digest);
        assertEq(
            keccak256(
                abi.encode(
                    vault.getDebt(quote.loanId),
                    loans.getLoan(quote.loanId),
                    book.totalLiabilities(),
                    cash.balanceOf(BORROWER),
                    pool.totalAssets()
                )
            ),
            beforeState
        );
        assertEq(manager.borrowerNonce(BORROWER), 0);
        assertEq(manager.nextReceiptId(), 1);
        assertEq(vault.activeCoverDeadline(quote.loanId), 0);
        for (uint256 i; i < ids.length; ++i) {
            assertEq(uint8(book.getOffer(ids[i]).status), uint8(Types.OfferStatus.FREE));
        }
    }

    function testLaterCoverPreservesAccrualRepaymentsCustodyAndPrincipal() public {
        vm.warp(1200);
        _repay(quote.loanId, PAYER, 50e6);
        LoanVault.DebtRecord memory beforeDebt = vault.getDebt(quote.loanId);
        uint256 cashBefore = cash.balanceOf(BORROWER);
        uint256 poolBefore = cash.balanceOf(address(pool));
        uint256 custody = stock.balanceOf(address(vault));
        uint256 debt = loans.debtOf(quote.loanId);
        uint256 id = _buy();
        CoverManager.Receipt memory r = manager.getReceipt(id);
        assertEq(r.loanId, quote.loanId);
        assertEq(r.debtAtAcceptance, debt);
        assertEq(vault.getDebt(quote.loanId).terms.startTime, beforeDebt.terms.startTime);
        assertEq(vault.getDebt(quote.loanId).cumulativeDebtReduction, 50e6);
        assertEq(vault.getDebt(quote.loanId).terms.originalPrincipal, beforeDebt.terms.originalPrincipal);
        assertEq(cashBefore - cash.balanceOf(BORROWER), quote.totalPremium);
        assertEq(cash.balanceOf(address(pool)), poolBefore);
        assertEq(stock.balanceOf(address(vault)), custody);
        assertEq(pool.activeReceiptIds().length, 1);
        assertEq(loans.nextLoanId(), 2);
        assertEq(r.opensAt, 900);
        assertEq(r.cutoffAt, 1440);
        assertEq(manager.reservedShares(id), quote.totalOfferShares);
    }

    function testCallerMismatch() public {
        bytes32 h = QuoteHash.hash(address(manager), quote, ids, hashes);
        vm.prank(PAYER);
        vm.expectRevert(CoverManager.InvalidBorrower.selector);
        manager.buyCover(quote.loanId, quote, ids, hashes, h);
    }

    function testNonceMismatch() public {
        quote.borrowerNonce = 1;
        _reject(CoverManager.InvalidBorrowerNonce.selector);
    }

    function testExpiry() public {
        quote.expiry = 1000;
        _reject(CoverManager.QuoteExpired.selector);
    }

    function testHashMismatch() public {
        vm.prank(BORROWER);
        vm.expectRevert(CoverManager.QuoteHashMismatch.selector);
        manager.buyCover(quote.loanId, quote, ids, hashes, 0);
    }

    function testLoanArgumentMismatch() public {
        vm.prank(BORROWER);
        vm.expectRevert(CoverManager.InvalidLoanConsent.selector);
        manager.buyCover(99, quote, ids, hashes, 0);
    }

    function testRecipientMismatch() public {
        quote.recipient = PAYER;
        _reject(CoverManager.InvalidLoanConsent.selector);
    }

    function testPrincipalMismatch() public {
        quote.principal++;
        _reject(CoverManager.InvalidLoanConsent.selector);
    }

    function testCollateralMismatch() public {
        quote.collateralShares++;
        _reject(CoverManager.InvalidLoanConsent.selector);
    }

    function testMultiplierMismatch() public {
        quote.snapshotMultiplierNumerator = 2;
        _reject(CoverManager.ReferenceFactsMismatch.selector);
    }

    function testReferencePriceCannotBeForged() public {
        quote.referencePrice++;
        _reject(CoverManager.ReferenceFactsMismatch.selector);
    }

    function testReferenceHashCannotBeForged() public {
        quote.referenceReportHash = bytes32(uint256(9));
        _reject(CoverManager.ReferenceFactsMismatch.selector);
    }

    function testCorporateHashCannotBeForged() public {
        quote.corporateActionHash = bytes32(uint256(9));
        _reject(CoverManager.ReferenceFactsMismatch.selector);
    }

    function testScheduledHashCannotBeForged() public {
        quote.scheduledReportHash = bytes32(uint256(9));
        _reject(CoverManager.ReferenceFactsMismatch.selector);
    }

    function testConfigHashCannotBeForged() public {
        quote.configHash = bytes32(uint256(9));
        _reject(CoverManager.ReferenceFactsMismatch.selector);
    }

    function testPolicyMustBeDerivedEvenWhenOffersAgree() public {
        _clearOffers();
        POLICY = bytes32(uint256(9));
        eligibility.setEligible(ASSET, BUYER, POLICY, true);
        ids.push(_post(BUYER, 10e18, 100e6));
        _quote();
        quote.loanId = 1;
        assertEq(book.getOffer(ids[0]).terms.policyHash, quote.policyHash);
        _reject(CoverManager.InvalidPolicy.selector);
    }

    function testDebtAcceptanceSlippage() public {
        quote.maxDebtAtAcceptance = quote.principal - 1;
        _reject(CoverManager.DebtLimitExceeded.selector);
    }

    function testDebtDeadlineSlippage() public {
        quote.maxDebtAtDeadline = quote.principal;
        _reject(CoverManager.DebtLimitExceeded.selector);
    }

    function testCutoffBoundary() public {
        vm.warp(1440);
        _reject(CoverManager.InvalidCoverWindow.selector);
    }

    function testWindowLastSecond() public {
        vm.warp(1439);
        _buy();
    }

    function testEmptyOffers() public {
        delete ids;
        delete hashes;
        _reject(CoverManager.InvalidOfferCount.selector);
    }

    function testOfferTermsHashMismatch() public {
        hashes[0] = 0;
        _reject(Errors.OfferTermsHashMismatch.selector);
    }

    function testOfferOrderAndDuplicate() public {
        (ids[0], ids[1]) = (ids[1], ids[0]);
        (hashes[0], hashes[1]) = (hashes[1], hashes[0]);
        _reject(CoverManager.InvalidOfferOrder.selector);
    }

    function testDuplicateOfferRejected() public {
        ids[1] = ids[0];
        hashes[1] = hashes[0];
        _reject(CoverManager.InvalidOfferOrder.selector);
    }

    function testPremiumTotals() public {
        quote.totalPremium++;
        _reject(CoverManager.QuoteTotalsMismatch.selector);
    }

    function testSharesTotals() public {
        quote.totalOfferShares--;
        _reject(CoverManager.QuoteTotalsMismatch.selector);
    }

    function testWeightedStrikeTotals() public {
        quote.weightedStrike++;
        _reject(CoverManager.QuoteTotalsMismatch.selector);
    }

    function testDeadlineBounds() public {
        quote.maxSettlementDeadline = 1999;
        _reject(CoverManager.InvalidSettlementDeadline.selector);
    }

    function testPremiumTransferRollback() public {
        cash.setShortTransferFrom(true);
        _reject(Errors.InvalidTokenBalanceDelta.selector);
        cash.setShortTransferFrom(false);
        _buy();
    }

    function testPaidPremiumCallbackCannotReadInflatedNAV() public {
        cash.setTransferFromHook(address(pool), abi.encodeCall(pool.totalAssets, ()));
        _reject(LoanManager.CashDebtTransition.selector);
        cash.setTransferFromHook(address(0), "");
        _buy();
    }

    function testPremiumReentrancyRollsBack() public {
        bytes32 h = QuoteHash.hash(address(manager), quote, ids, hashes);
        cash.setTransferFromHook(
            address(manager), abi.encodeCall(manager.buyCover, (quote.loanId, quote, ids, hashes, h))
        );
        _reject(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        cash.setTransferFromHook(address(0), "");
        _buy();
    }

    function testStrictBuyerLtvUsesCurrentDebt() public {
        vm.warp(1200);
        _reference(80e6);
        quote.referencePrice = 80e6;
        quote.referenceReportHash = oracle.latestReference(ASSET).reportHash;
        _reject(Errors.BorrowerLtvTooHigh.selector);
    }

    function testUnsafeDebtCannotAttach() public {
        vm.warp(1200);
        _reference(60e6);
        quote.referencePrice = 60e6;
        quote.referenceReportHash = oracle.latestReference(ASSET).reportHash;
        _reject(Errors.BorrowerLtvTooHigh.selector);
    }

    function testFullEscrowRequired() public {
        _clearOffers();
        ids.push(_post(BUYER, 1e18, 100e6));
        _quote();
        quote.loanId = 1;
        _reject(Errors.InsufficientFundedCapacity.selector);
    }

    function testSelectedLoanMustBelongToCaller() public {
        vm.prank(PAYER);
        uint256 other = loans.borrow(
            LoanManager.BorrowRequest(
                ASSET, 1, configHash, quote.principal, 10e18, PAYER, quote.referenceReportHash, 1499
            )
        );
        quote.loanId = other;
        _reject(CoverManager.InvalidLoanConsent.selector);
    }

    function testReleaseHooksOnlyLoanManager() public {
        uint256 id = _buy();
        vm.expectPartialRevert(Errors.UnauthorizedManager.selector);
        manager.releaseForLoanClosure(id);
        vm.expectPartialRevert(Errors.UnauthorizedManager.selector);
        manager.releaseForLiquidation(id);
    }

    function testTooManyOffersAndArrayLengthMismatch() public {
        hashes.pop();
        _reject(CoverManager.InvalidOfferCount.selector);
        hashes.push(book.termsHashOf(ids[1]));
        while (ids.length < 9) {
            ids.push(ids[0]);
            hashes.push(hashes[0]);
        }
        _reject(CoverManager.InvalidOfferCount.selector);
    }

    function testIneligibleBuyerRollsBackAllPriorReservations() public {
        eligibility.setEligible(ASSET, OTHER_BUYER, POLICY, false);
        _reject(Errors.IneligibleBuyer.selector);
        assertEq(book.premiumCredit(BUYER), 0);
        eligibility.setEligible(ASSET, OTHER_BUYER, POLICY, true);
        _buy();
    }

    function testAtomicReceiptSnapshotsExistBeforePremiumCallbacks() public {
        cash.setTransferFromHook(address(this), abi.encodeCall(this.inspectCoverActivation, ()));
        _buy();
    }

    function inspectCoverActivation() external view {
        assertEq(msg.sender, address(cash));
        assertEq(manager.borrowerNonce(BORROWER), 1);
        assertEq(manager.getReceipt(1).loanId, quote.loanId);
        assertEq(loans.getLoan(quote.loanId).activeCoverId, 1);
        assertEq(vault.activeCoverDeadline(quote.loanId), 2000);
        assertEq(pool.activeReceiptIds().length, 1);
    }

    function testConstructorRejectsEveryZeroDependencyIndependently() public {
        address[6] memory dependencies =
            [address(registry), address(oracle), address(book), address(pool), address(vault), address(loans)];
        bytes32 beforeState = _bindingState();
        for (uint256 i; i < dependencies.length; ++i) {
            address saved = dependencies[i];
            dependencies[i] = address(0);
            vm.expectRevert(Errors.ZeroAddress.selector);
            new CoverManager(
                dependencies[0],
                dependencies[1],
                dependencies[2],
                dependencies[3],
                dependencies[4],
                dependencies[5],
                CoverManager.Profile.REPLAY
            );
            dependencies[i] = saved;
            assertEq(_bindingState(), beforeState);
        }
    }

    function testConstructorRejectsCashAndEveryLoanDependencyMismatchIndependently() public {
        address[5] memory targets = [address(book), address(loans), address(loans), address(loans), address(loans)];
        bytes[5] memory calls = [
            abi.encodeCall(book.cashToken, ()),
            abi.encodeCall(loans.registry, ()),
            abi.encodeCall(loans.oracle, ()),
            abi.encodeCall(loans.pool, ()),
            abi.encodeCall(loans.vault, ())
        ];
        address[5] memory expected = [address(cash), address(registry), address(oracle), address(pool), address(vault)];
        bytes32 beforeState = _bindingState();
        for (uint256 i; i < targets.length; ++i) {
            vm.mockCall(targets[i], calls[i], abi.encode(ADVERSARY));
            _assertExactlyOneWrongBinding(targets, calls, expected, i);
            vm.expectRevert(CoverManager.ComponentMismatch.selector);
            new CoverManager(
                address(registry),
                address(oracle),
                address(book),
                address(pool),
                address(vault),
                address(loans),
                CoverManager.Profile.REPLAY
            );
            vm.clearMockedCalls();
            assertEq(_bindingState(), beforeState);
        }
        CoverManager valid = new CoverManager(
            address(registry),
            address(oracle),
            address(book),
            address(pool),
            address(vault),
            address(loans),
            CoverManager.Profile.REPLAY
        );
        assertEq(address(valid.loanManager()), address(loans));
    }

    function testEveryRuntimeBindingRejectsIndependentlyWithoutChangingCoverState() public {
        address[5] memory targets = [address(book), address(pool), address(vault), address(book), address(loans)];
        bytes[5] memory calls = [
            abi.encodeCall(book.coverManager, ()),
            abi.encodeCall(pool.coverManager, ()),
            abi.encodeCall(vault.coverManager, ()),
            abi.encodeCall(book.protectedPool, ()),
            abi.encodeCall(loans.coverManager, ())
        ];
        address[5] memory expected = [address(manager), address(loans), address(loans), address(pool), address(manager)];
        bytes32 beforeState = _bindingState();
        bytes32 digest = QuoteHash.hash(address(manager), quote, ids, hashes);
        for (uint256 i; i < targets.length; ++i) {
            vm.mockCall(targets[i], calls[i], abi.encode(ADVERSARY));
            _assertExactlyOneWrongBinding(targets, calls, expected, i);
            vm.prank(BORROWER);
            vm.expectRevert(CoverManager.ComponentMismatch.selector);
            manager.buyCover(quote.loanId, quote, ids, hashes, digest);
            vm.clearMockedCalls();
            assertEq(_bindingState(), beforeState);
            assertEq(manager.borrowerNonce(BORROWER), 0);
            assertEq(manager.nextReceiptId(), 1);
            assertEq(vault.activeCoverDeadline(quote.loanId), 0);
            assertEq(loans.getLoan(quote.loanId).activeCoverId, 0);
            vm.expectRevert(Errors.InvalidReceiptId.selector);
            manager.getReceipt(1);
        }
        assertEq(_buy(), 1); // Clearing the single wrong binding restores the otherwise-valid request.
    }

    function _assertExactlyOneWrongBinding(
        address[5] memory targets,
        bytes[5] memory calls,
        address[5] memory expected,
        uint256 wrongIndex
    ) internal view {
        for (uint256 j; j < targets.length; ++j) {
            (bool ok, bytes memory result) = targets[j].staticcall(calls[j]);
            assertTrue(ok);
            assertEq(abi.decode(result, (address)), j == wrongIndex ? ADVERSARY : expected[j]);
        }
    }

    function _bindingState() internal view returns (bytes32 state) {
        state = keccak256(
            abi.encode(
                vault.getDebt(quote.loanId),
                loans.getLoan(quote.loanId),
                vault.activeCoverDeadline(quote.loanId),
                loans.loanOfReceipt(1),
                manager.borrowerNonce(BORROWER),
                manager.nextReceiptId(),
                manager.reservedShares(1)
            )
        );
        state = keccak256(
            abi.encode(
                state,
                book.totalLockedCash(),
                book.totalPremiumCredits(),
                book.totalCashCredits(),
                book.premiumCredit(BUYER),
                book.premiumCredit(OTHER_BUYER),
                cash.balanceOf(address(book)),
                cash.balanceOf(address(pool)),
                cash.balanceOf(BORROWER),
                cash.allowance(BORROWER, address(book))
            )
        );
        for (uint256 i; i < ids.length; ++i) {
            state = keccak256(abi.encode(state, book.getOffer(ids[i])));
        }
        (bool exists, bytes memory receiptResult) = address(manager).staticcall(abi.encodeCall(manager.getReceipt, (1)));
        return keccak256(abi.encode(state, exists, receiptResult));
    }

    function testPauseOfStockCannotBlockCoverAcceptanceBecauseNoCustodyMoves() public {
        stock.setPaused(true);
        _buy();
        assertEq(vault.backingOf(quote.loanId), 10e18);
    }

    function testCurrentCollateralConsentMustMatchAfterAddition() public {
        vm.prank(PAYER);
        loans.addCollateral(quote.loanId, 1e18);
        _reject(CoverManager.InvalidLoanConsent.selector);
        quote.collateralShares = 11e18;
        _buy();
    }

    function testUnknownAndEndedReceiptsCannotReleaseOrSettle() public {
        vm.expectRevert(Errors.InvalidReceiptId.selector);
        manager.settle(99);
        uint256 id = _buy();
        vm.prank(PAYER);
        loans.repay(quote.loanId, quote.principal);
        assertEq(uint8(manager.getReceipt(id).status), 2);
        assertEq(manager.reservedShares(id), 0);
        vm.prank(address(loans));
        vm.expectRevert(CoverManager.ReceiptNotActive.selector);
        manager.releaseForLoanClosure(id);
    }

    function testEligibilityChangingDuringPremiumCallbackRollsBackAllReservations() public {
        cash.setTransferFromHook(
            address(eligibility), abi.encodeCall(eligibility.setEligible, (ASSET, OTHER_BUYER, POLICY, false))
        );
        _reject(Errors.IneligibleBuyer.selector);
        assertTrue(eligibility.isEligible(ASSET, OTHER_BUYER, POLICY));
        assertEq(book.premiumCredit(BUYER), 0);
        cash.setTransferFromHook(address(0), "");
        _buy();
    }
}
