// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {ReceiptFixture} from "../helpers/ReceiptFixture.sol";
import {Types} from "../../src/lib/Types.sol";

contract OptionalCoverTest is ReceiptFixture {
    function testHealthySettlementEndsCoverAndReleasesAllEscrow() public {
        uint256 id = _borrow();
        _benchmark(100e6, 1, 1);
        _settle(id, false);
        assertEq(uint8(manager.getReceipt(id).status), 2);
        assertEq(book.totalLockedCash(), 0);
        assertGt(vault.debtOf(id), 0);
        for (uint256 i; i < ids.length; ++i) {
            assertEq(uint8(book.getOffer(ids[i]).status), uint8(Types.OfferStatus.RELEASED));
        }
    }

    function testCoverHasImmutableReplayWindow() public view {
        (bool ok, bytes memory data) = address(manager).staticcall(abi.encodeWithSignature("coverOpensBeforeClose()"));
        assertTrue(ok, "missing optional-cover coordinator");
        assertEq(abi.decode(data, (uint64)), 600);
    }
}

import {CoverManager} from "../../src/CoverManager.sol";
import {LoanManager} from "../../src/LoanManager.sol";
import {LoanVault} from "../../src/LoanVault.sol";
import {QuoteHash} from "../../src/lib/QuoteHash.sol";
import {Errors} from "../../src/lib/Errors.sol";
import {SessionOracle} from "../../src/SessionOracle.sol";

contract OptionalCoverIntegrationTest is ReceiptFixture {
    function testOrdinaryLoanExistsBeforeAnyOffersAndCoverDoesNotResetLoan() public {
        _clearOffers();
        uint256 id = _openOrdinary();
        assertEq(book.totalLockedCash(), 0);
        vm.warp(1200);
        _repay(id, PAYER, 50e6);
        ids.push(_post(BUYER, 5e18, 100e6));
        ids.push(_post(OTHER_BUYER, 5e18, 90e6));
        _quote();
        quote.loanId = id;
        uint256 beforeCash = cash.balanceOf(BORROWER);
        uint256 debt = loans.debtOf(id);
        _buy();
        assertEq(loans.debtOf(id), debt);
        assertEq(cash.balanceOf(BORROWER), beforeCash - 200);
        assertEq(vault.getDebt(id).terms.startTime, 1001);
        assertEq(vault.getDebt(id).cumulativeDebtReduction, 50e6);
    }

    function testDifferentLoanAndReceiptIdsKeepClaimsAndEscrowIsolated() public {
        uint256 first = _openOrdinary();
        uint256 second = _openOrdinary();
        assertEq(first, 1);
        assertEq(second, 2);
        uint256 receipt = _buy();
        assertEq(receipt, 1);
        assertEq(manager.getReceipt(receipt).loanId, second);
        vm.warp(2000);
        manager.terminalSettle(receipt);
        assertEq(loans.debtOf(second), 0);
        assertGt(loans.debtOf(first), 0);
        assertEq(vault.getClaim(1).receiptId, second);
        assertEq(vault.backingOf(first), 10e18);
        _withdrawAllClaims();
        assertEq(vault.backingOf(first), 10e18);
        assertEq(pool.activeReceiptIds().length, 1);
    }

    function testSameLoanSecondSessionGetsNewReceiptAndOldReceiptCannotOperate() public {
        uint256 old = _borrow();
        _benchmark(100e6, 1, 1);
        _settle(old, false);
        bytes32 oldSnapshot = keccak256(abi.encode(manager.getReceipt(old)));
        bytes32 next = keccak256("SECOND SESSION");
        Types.AssetConfig memory newConfig = _config(800);
        newConfig.triggerLtvBps = 7000;
        registry.scheduleAssetConfig(ASSET, newConfig, 1502);
        configHash = registry.configHash(ASSET, 2);
        Types.MarketEventReport memory report = _report(Types.MarketEventKind.SESSION_SCHEDULED);
        report.sessionId = next;
        report.scheduledOpen = 1600;
        report.scheduledClose = 3000;
        oracle.acceptReport(report);
        vm.warp(2400);
        report = _report(Types.MarketEventKind.MARKET_PRICE);
        report.scheduledOpen = 1600;
        report.scheduledClose = 3000;
        report.benchmarkPrice = 100e6;
        report.multiplierNumerator = 1;
        report.multiplierDenominator = 1;
        report.secondarySourceHash = keccak256("SECONDARY");
        oracle.acceptReport(report);
        POLICY = manager.policyHash(ASSET, next, configHash, 1, 1);
        eligibility.setEligible(ASSET, BUYER, POLICY, true);
        delete ids;
        vm.prank(BUYER);
        ids.push(book.postOffer(Types.OfferTerms(ASSET, POLICY, 10e18, 100e6, 100, 7500, 100e6, 10000, 4000, ++nonce)));
        _quote();
        quote.configVersion = 2;
        quote.loanId = 1;
        quote.sessionId = next;
        quote.expiry = 2999;
        quote.scheduledReportHash = oracle.sessionFact(next).scheduledReportHash;
        quote.minSettlementDeadline = 4000;
        quote.maxSettlementDeadline = 4000;
        // Current cover trigger is 70%; the original loan trigger is 75%.
        vm.warp(2401);
        report = _report(Types.MarketEventKind.MARKET_PRICE);
        report.scheduledOpen = 1600;
        report.scheduledClose = 3000;
        report.benchmarkPrice = 70e6;
        report.multiplierNumerator = 1;
        report.multiplierDenominator = 1;
        report.secondarySourceHash = keccak256("SECONDARY");
        oracle.acceptReport(report);
        quote.referencePrice = 70e6;
        quote.referenceReportHash = oracle.latestReference(ASSET).reportHash;
        bytes32 rejectedHash = QuoteHash.hash(address(manager), quote, ids, hashes);
        vm.prank(BORROWER);
        vm.expectRevert(Errors.BorrowerLtvTooHigh.selector);
        manager.buyCover(1, quote, ids, hashes, rejectedHash);
        assertEq(loans.getLoan(1).activeCoverId, 0);
        vm.warp(2402);
        report = _report(Types.MarketEventKind.MARKET_PRICE);
        report.scheduledOpen = 1600;
        report.scheduledClose = 3000;
        report.benchmarkPrice = 100e6;
        report.multiplierNumerator = 1;
        report.multiplierDenominator = 1;
        report.secondarySourceHash = keccak256("SECONDARY");
        oracle.acceptReport(report);
        quote.referencePrice = 100e6;
        quote.referenceReportHash = oracle.latestReference(ASSET).reportHash;
        uint256 second = _buy();
        assertEq(second, 2);
        assertEq(loans.nextLoanId(), 2);
        assertEq(manager.getReceipt(second).config.rateNumerator, 800);
        assertEq(vault.getDebt(1).terms.rateNumerator, 1);
        assertEq(manager.getReceipt(second).debtCeiling, 500e6);
        assertEq(loans.getLoan(1).activeCoverId, second);
        assertEq(manager.getReceipt(second).loanId, 1);
        vm.expectRevert(CoverManager.ReceiptNotActive.selector);
        manager.settle(old);
        vm.expectRevert(CoverManager.ReceiptNotActive.selector);
        manager.terminalSettle(old);
        assertEq(keccak256(abi.encode(manager.getReceipt(old))), oldSnapshot);
        vm.warp(4000);
        manager.terminalSettle(second);
        assertEq(loans.debtOf(1), 0);
        assertEq(vault.getClaim(1).receiptId, 1);
    }

    function testCoveredWindowWithdrawalAllowsOnlyUnreservedHealthyShares() public {
        uint256 id = _borrow();
        vm.prank(PAYER);
        loans.addCollateral(id, 2e18);
        vm.prank(BORROWER);
        loans.withdrawCollateral(id, 2e18);
        vm.prank(BORROWER);
        vm.expectRevert(LoanManager.CoveredCollateralReserved.selector);
        loans.withdrawCollateral(id, 1);
        vm.prank(PAYER);
        loans.addCollateral(id, 2e18);
        vm.warp(1440);
        vm.prank(BORROWER);
        vm.expectRevert(LoanManager.InvalidCoverWindow.selector);
        loans.withdrawCollateral(id, 1);
        assertEq(vault.remainingSnapshotShares(id), 12e18);
    }

    function testCoveredLiquidationReleasesOnlyItsOwnLotsInsideWindow() public {
        uint256 id = _borrow();
        vm.warp(1200);
        _reference(60e6);
        vm.prank(PAYER);
        loans.liquidate(id, type(uint256).max);
        assertEq(uint8(manager.getReceipt(id).status), 2);
        assertEq(manager.reservedShares(id), 0);
        assertEq(book.totalLockedCash(), 0);
        assertEq(book.getOffer(ids[0]).cumulativeCashCharged, 0);
        assertEq(loans.getLoan(id).activeCoverId, 0);
        assertGt(loans.debtOf(id), 0);
        vm.expectRevert(CoverManager.ReceiptNotActive.selector);
        manager.settle(id);
    }

    function testHealthyAboveOriginationCanAttachWhenBuyersConsent() public {
        uint256 id = _openOrdinary();
        vm.warp(1200);
        _reference(80e6);
        _clearOffers();
        vm.prank(BUYER);
        ids.push(book.postOffer(Types.OfferTerms(ASSET, POLICY, 10e18, 100e6, 100, 7500, 80e6, 10000, 2000, ++nonce)));
        _quote();
        quote.loanId = id;
        quote.referencePrice = 80e6;
        uint256 receipt = _buy();
        assertEq(manager.getReceipt(receipt).debtAtAcceptance, 500e6);
    }

    function testStaleReferenceCannotAttachEvenInsideWindow() public {
        _openOrdinary();
        vm.warp(1100);
        Types.MarketEventReport memory r = _report(Types.MarketEventKind.MARKET_PRICE);
        r.scheduledOpen = 900;
        r.scheduledClose = 1500;
        r.validUntil = 1101;
        r.benchmarkPrice = 100e6;
        r.multiplierNumerator = 1;
        r.multiplierDenominator = 1;
        r.secondarySourceHash = keccak256("SECONDARY");
        oracle.acceptReport(r);
        quote.referenceReportHash = oracle.latestReference(ASSET).reportHash;
        vm.warp(1102);
        bytes32 h = QuoteHash.hash(address(manager), quote, ids, hashes);
        vm.prank(BORROWER);
        vm.expectRevert();
        manager.buyCover(quote.loanId, quote, ids, hashes, h);
        assertEq(vault.activeCoverDeadline(quote.loanId), 0);
        assertEq(manager.borrowerNonce(BORROWER), 0);
    }

    function testDuplicateSessionAndActiveCoverCannotReattach() public {
        uint256 id = _borrow();
        quote.borrowerNonce = 1;
        bytes32 h = QuoteHash.hash(address(manager), quote, ids, hashes);
        vm.prank(BORROWER);
        vm.expectRevert();
        manager.buyCover(id, quote, ids, hashes, h);
        assertEq(loans.getLoan(id).activeCoverId, id);
        assertEq(manager.borrowerNonce(BORROWER), 1);
    }

    function testWindowOpeningIncludedAndEarlierTimeRejected() public {
        _openOrdinary();
        Types.SessionFact memory fact = oracle.sessionFact(SESSION);
        // Independent coordinator validation of stored scheduledOpen <= opensAt.
        fact.scheduledOpen = 901;
        vm.mockCall(address(oracle), abi.encodeCall(oracle.sessionFact, (SESSION)), abi.encode(fact));
        bytes32 h = QuoteHash.hash(address(manager), quote, ids, hashes);
        vm.prank(BORROWER);
        vm.expectRevert(CoverManager.InvalidCoverWindow.selector);
        manager.buyCover(quote.loanId, quote, ids, hashes, h);
        vm.clearMockedCalls();
        vm.warp(899);
        vm.prank(BORROWER);
        vm.expectRevert(CoverManager.ConfigNotEffective.selector);
        manager.buyCover(quote.loanId, quote, ids, hashes, h);
    }

    function testLaterSplitReferenceUsesOriginalLoanBasisAndTerminalUsesAuthenticatedDeliveryBasis() public {
        uint256 id = _openOrdinary();
        vm.warp(1100);
        Types.MarketEventReport memory action = _report(Types.MarketEventKind.CORPORATE_ACTION);
        action.corporateAction = Types.CorporateAction.SPLIT;
        action.actionId = keccak256("LATER SPLIT");
        action.multiplierNumerator = 2;
        action.multiplierDenominator = 1;
        oracle.acceptReport(action);
        _reference(50e6);
        quote.referenceReportHash = oracle.latestReference(ASSET).reportHash;
        quote.corporateActionHash = oracle.latestCorporateAction(ASSET).reportHash;
        quote.referencePrice = 100e6;
        uint256 receipt = _buy();
        assertEq(manager.getReceipt(receipt).consent.snapshotMultiplierNumerator, 1);
        assertEq(vault.getDebt(id).terms.snapshotMultiplierNumerator, 1);
        vm.warp(2000);
        manager.terminalSettle(receipt);
        assertEq(vault.getClaim(1).reportMultiplierNumerator, 2);
        assertEq(vault.outstandingClaimUnits(id), 20e18);
        assertEq(loans.debtOf(id), 0);
    }

    function testTwoCoveredLoansCannotSpendEachOthersBuyerEscrowOrBacking() public {
        uint256 firstLoan = _openOrdinary();
        uint256 firstReceipt = _buy();
        bytes32 firstOffer = ids[0];
        bytes32 firstOfferState = keccak256(abi.encode(book.getOffer(firstOffer)));
        delete ids;
        ids.push(_post(BUYER, 5e18, 100e6));
        ids.push(_post(OTHER_BUYER, 5e18, 90e6));
        _quote();
        uint256 secondLoan = _openOrdinary();
        uint256 secondReceipt = _buy();
        assertNotEq(firstLoan, secondLoan);
        assertNotEq(firstReceipt, secondReceipt);
        vm.warp(2000);
        manager.terminalSettle(secondReceipt);
        assertEq(keccak256(abi.encode(book.getOffer(firstOffer))), firstOfferState);
        assertEq(book.totalLockedCash(), 950e6);
        assertEq(vault.debtOf(firstLoan), 500e6);
        assertEq(loans.getLoan(firstLoan).activeCoverId, firstReceipt);
        _withdrawAllClaims();
        assertEq(vault.backingOf(firstLoan), 10e18);
        assertEq(vault.backingOf(secondLoan), 0);
    }

    function testBothManagersFitRuntimeLimit() public view {
        assertLe(address(manager).code.length, 24576);
        assertLe(address(loans).code.length, 24576);
    }

    function testPolicyHashBindsDomainChainManagerBasisConfigSessionAndProfile() public {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("BELL_SESSION_COVER_POLICY_V1"),
                block.chainid,
                address(manager),
                ASSET,
                SESSION,
                configHash,
                uint128(1),
                uint128(1),
                CoverManager.Profile.REPLAY,
                uint64(600),
                uint64(60)
            )
        );
        assertEq(POLICY, expected);
        assertNotEq(POLICY, manager.policyHash(ASSET, SESSION, configHash, 2, 1));
        assertNotEq(POLICY, manager.policyHash(ASSET, keccak256("other"), configHash, 1, 1));
        vm.chainId(block.chainid + 1);
        assertNotEq(POLICY, manager.policyHash(ASSET, SESSION, configHash, 1, 1));
    }
}

contract CoverWindowBoundaryTest is ReceiptFixture {
    function _report(Types.MarketEventKind kind) internal view override returns (Types.MarketEventReport memory r) {
        r = super._report(kind);
        if (
            kind == Types.MarketEventKind.SESSION_SCHEDULED || kind == Types.MarketEventKind.CLOSE_CONFIRMED
                || kind == Types.MarketEventKind.REOPEN_BENCHMARK
        ) r.scheduledClose = 1701;
    }

    function testExactOpeningIsInclusiveAndPreviousSecondIsRejected() public {
        _openOrdinary();
        vm.warp(1100);
        bytes32 h = QuoteHash.hash(address(manager), quote, ids, hashes);
        vm.prank(BORROWER);
        vm.expectRevert(CoverManager.InvalidCoverWindow.selector);
        manager.buyCover(quote.loanId, quote, ids, hashes, h);
        assertEq(manager.borrowerNonce(BORROWER), 0);
        vm.warp(1101);
        uint256 receipt = _buy();
        assertEq(manager.getReceipt(receipt).opensAt, 1101);
        assertEq(manager.getReceipt(receipt).cutoffAt, 1641);
    }

    function testLiveProfileIsImmutableAndPolicyDistinct() public {
        CoverManager live = new CoverManager(
            address(registry),
            address(oracle),
            address(book),
            address(pool),
            address(vault),
            address(loans),
            CoverManager.Profile.LIVE
        );
        assertEq(live.coverOpensBeforeClose(), 7200);
        assertEq(live.coverCutoffBeforeClose(), 1800);
        assertEq(uint8(live.profile()), 0);
        assertNotEq(live.policyHash(ASSET, SESSION, configHash, 1, 1), POLICY);
    }
}
