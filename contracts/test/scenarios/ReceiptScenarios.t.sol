// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReceiptFixture} from "../helpers/ReceiptFixture.sol";
import {CoverManager} from "../../src/CoverManager.sol";
import {LoanVault} from "../../src/LoanVault.sol";
import {MockStockToken} from "../../src/demo/MockStockToken.sol";
import {Types} from "../../src/lib/Types.sol";
import {Errors} from "../../src/lib/Errors.sol";

contract ReceiptScenariosTest is ReceiptFixture {
    // Catches independent per-call rounding, release-after-partial, and reordered lots.
    function testPartialSettlementEndsAndReleasesResidualEscrow() public {
        uint256 id = _borrow();
        _benchmark(60e6, 1, 1);
        _settle(id, false);
        assertEq(vault.debtOf(id), 319_672_131);
        assertEq(book.getOffer(ids[0]).cumulativeCashCharged, 180_327_869);
        assertEq(book.getOffer(ids[0]).cumulativeExercisedShares, 1_803_278_680_000_000_001);
        assertEq(book.getOffer(ids[1]).cumulativeCashCharged, 0);
        assertEq(vault.getClaim(1).owner, BUYER);
        assertEq(vault.getClaim(1).receiptId, id);
        assertEq(book.totalLockedCash(), 0);
        assertEq(book.cashCredit(OTHER_BUYER), 450e6);
        vm.warp(2000);
        vm.expectRevert(CoverManager.ReceiptNotActive.selector);
        manager.terminalSettle(id);
        _repay(id, PAYER, vault.debtOf(id));
        _closedFinancially(id);
        _withdrawAllClaims();
        _finalize(id);
        assertEq(vault.backingOf(id), 0);
    }

    function testNoReportTerminalIgnoresTokenMetadataPauseAndBuyerIneligibility() public {
        uint256 id = _borrow();
        stock.setMultiplier(10, 1); // unauthenticated metadata must not affect claims
        stock.setPaused(true);
        stock.setRestricted(BUYER, true);
        eligibility.setEligible(ASSET, BUYER, POLICY, false);
        vm.warp(2000);
        _settle(id, true);
        _closedFinancially(id);
        assertEq(vault.getClaim(1).reportMultiplierNumerator, 1);
        assertEq(liabilities.outstandingClaimUnits(id), 10e18);
        vm.prank(BUYER);
        vm.expectRevert(MockStockToken.TransfersPaused.selector);
        vault.withdrawClaim(1, BUYER);
        assertFalse(vault.getClaim(1).withdrawn);
        assertEq(vault.backingOf(id), 10e18);
        stock.setPaused(false);
        vm.prank(BUYER);
        vm.expectRevert(abi.encodeWithSelector(MockStockToken.RestrictedAddress.selector, BUYER));
        vault.withdrawClaim(1, BUYER);
        stock.setRestricted(BUYER, false);
        stock.setRestricted(address(vault), true);
        vm.prank(BUYER);
        vm.expectRevert(abi.encodeWithSelector(MockStockToken.RestrictedAddress.selector, address(vault)));
        vault.withdrawClaim(1, BUYER);
        assertEq(liabilities.outstandingClaimUnits(id), 10e18);
        assertEq(vault.debtOf(id), 0);
        stock.setRestricted(address(vault), false);
        _withdrawAllClaims();
        _finalize(id);
        assertEq(vault.backingOf(id), 0);
    }

    function testAcceptedSplitClaimsSurviveAbsentBackingAndRecoverAfterThirdPartyTopup() public {
        uint256 id = _borrow();
        _benchmark(1, 2, 1);
        _settle(id, false);
        Types.MarketEventReport memory action = _report(Types.MarketEventKind.CORPORATE_ACTION);
        action.corporateAction = Types.CorporateAction.SPLIT;
        action.actionId = keccak256("SPLIT");
        action.multiplierNumerator = 2;
        action.multiplierDenominator = 1;
        oracle.acceptReport(action);
        _repay(id, PAYER, vault.debtOf(id));
        _closedFinancially(id);
        assertEq(liabilities.outstandingClaimUnits(id), 20e18);
        uint256 borrowerClaim = vault.nextClaimId() - 1;
        vm.prank(BORROWER);
        vm.expectRevert(LoanVault.InsufficientBacking.selector);
        vault.withdrawClaim(borrowerClaim, BORROWER);
        assertFalse(vault.getClaim(borrowerClaim).withdrawn);
        vm.prank(PAYER);
        life.topUpBacking(id, 10e18);
        stock.setMultiplier(100, 1);
        _withdrawAllClaims();
        _finalize(id);
        assertEq(vault.backingOf(id), 0);
    }

    function testNormalFullClosureWithZeroConvertedBenchmarkLeavesRoundingSurplusForFinalHandoff() public {
        uint256 id = _borrow();
        _benchmark(1, 1, 10);
        stock.setPaused(true);
        _settle(id, false);
        _closedFinancially(id);
        assertEq(liabilities.outstandingClaimUnits(id), 1e18 - 1);
        stock.setPaused(false);
        _withdrawAllClaims();
        assertEq(vault.backingOf(id), 9e18 + 1);
        stock.setPaused(true);
        vm.expectRevert(MockStockToken.TransfersPaused.selector);
        _finalize(id);
        assertEq(uint8(manager.getReceipt(id).status), 2);
        assertEq(vault.backingOf(id), 9e18 + 1);
        stock.setPaused(false);
        uint256 beforeBorrower = stock.balanceOf(BORROWER);
        _finalize(id);
        assertEq(stock.balanceOf(BORROWER) - beforeBorrower, 9e18 + 1);
        assertEq(uint8(manager.getReceipt(id).status), 2);
    }

    function testPaidZeroDeliveryFillRollsBackEntireCoverSettlement() public {
        _clearOffers();
        ids.push(_post(BUYER, 10, 1e18));
        _quote();
        quote.principal = 4;
        uint256 id = _borrow();
        _benchmark(1, 1, type(uint64).max);
        bytes32 beforeState = _state(id);
        vm.expectRevert(LoanVault.ZeroDelivery.selector);
        manager.settle(id);
        assertEq(_state(id), beforeState);
        assertEq(vault.nextClaimId(), 1);
        assertEq(uint8(manager.getReceipt(id).status), 1);
        assertEq(loans.getLoan(id).activeCoverId, id);
    }

    function testLastFillExcessIsBorrowerCreditNeverPoolDebtReduction() public {
        _clearOffers();
        ids.push(_post(BUYER, 10, 2e18));
        _quote();
        quote.principal = 4;
        uint256 id = _borrow();
        uint256 buyerCreditBefore = book.cashCredit(BUYER);
        vm.warp(2000);
        _settle(id, true);
        assertEq(book.getOffer(ids[0]).cumulativeExercisedShares, 3);
        assertEq(book.getOffer(ids[0]).cumulativeCashCharged, 6);
        assertEq(book.cashCredit(BORROWER), 1);
        assertEq(book.cashCredit(BUYER) - buyerCreditBefore, 14);
        assertEq(cash.balanceOf(address(pool)), POOL_CASH + 1);
        _closedFinancially(id);
    }

    function testEightLotTerminalTraversesFundedOrderAndClosesExactDebt() public {
        _clearOffers();
        for (uint256 i; i < 8; ++i) {
            ids.push(_post(i % 2 == 0 ? BUYER : OTHER_BUYER, 1e18, (67 - i) * 1e6));
        }
        _quote();
        uint256 id = _borrow();
        vm.warp(2000);
        vm.cool(address(manager));
        vm.cool(address(book));
        vm.cool(address(pool));
        vm.cool(address(vault));
        vm.cool(address(cash));
        uint256 gasBefore = gasleft();
        vm.prank(KEEPER);
        manager.terminalSettle(id);
        emit log_named_uint("cold eight-lot terminal settlement gas", gasBefore - gasleft());
        uint256 charged;
        for (uint256 i; i < 8; ++i) {
            Types.Offer memory o = book.getOffer(ids[i]);
            assertGt(o.cumulativeExercisedShares, 0);
            charged += o.cumulativeCashCharged;
        }
        assertEq(charged, 500e6);
        assertEq(cash.balanceOf(address(pool)), POOL_CASH + 1);
        assertEq(vault.nextClaimId(), 10);
        _closedFinancially(id);
    }

    function testLaterTerminalFillFailureRollsBackAllEarlierCashClaimsAndExercise() public {
        quote.principal = 550e6 - 1;
        uint256 id = _borrow();
        vm.warp(2000);
        bytes32 beforeState = _state(id);
        cash.setTransferHook(address(this), abi.encodeCall(this.shortenNextCashTransfer, ()));
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidTokenBalanceDelta.selector, 50e6, 50e6 - 1));
        manager.terminalSettle(id);
        assertEq(_state(id), beforeState);
        assertEq(vault.nextClaimId(), 1);
        assertEq(liabilities.outstandingClaimUnits(id), 0);
        assertFalse(cash.shortTransfer());
        assertEq(pool.totalAssets(), POOL_CASH + 1);
        cash.setTransferHook(address(0), "");
        _settle(id, true);
        assertEq(book.getOffer(ids[0]).cumulativeCashCharged, 500e6);
        assertEq(book.getOffer(ids[1]).cumulativeCashCharged, 50e6);
        _closedFinancially(id);
    }

    function shortenNextCashTransfer() external {
        assertEq(msg.sender, address(cash));
        cash.setShortTransfer(true);
    }

    function testFuzzRepayNormalAndTerminalConserveCashSharesAndCumulativeRounding(uint96 rawRepayment, uint96 rawPrice)
        public
    {
        uint256 repayment = bound(rawRepayment, 1, 500e6 - 1);
        uint256 price = bound(rawPrice, 1, 200e6);
        uint256 id = _borrow();
        _repay(id, PAYER, repayment);
        _benchmark(price, 1, 1);
        _settle(id, false);
        if (vault.debtOf(id) != 0) {
            assertEq(book.totalLockedCash(), 0);
            uint256 residual = vault.debtOf(id);
            _repay(id, PAYER, residual);
            repayment += residual;
        }
        uint256 totalCash;
        for (uint256 i; i < ids.length; ++i) {
            Types.Offer memory o = book.getOffer(ids[i]);
            uint256 exactCeil = (o.cumulativeExercisedShares * o.terms.strike + 1e18 - 1) / 1e18;
            assertEq(o.cumulativeCashCharged, exactCeil);
            assertLe(o.cumulativeCashCharged, o.cashCapacity);
            totalCash += o.cumulativeCashCharged;
        }
        assertEq(totalCash + repayment, 500e6);
        assertEq(vault.getDebt(id).cumulativeDebtReduction, 500e6);
        assertEq(cash.balanceOf(address(pool)), POOL_CASH + 1);
        assertEq(liabilities.outstandingClaimUnits(id), 10e18);
        _closedFinancially(id);
        _withdrawAllClaims();
        _finalize(id);
        assertEq(vault.backingOf(id), 0);
        assertEq(vault.accountedBacking(address(stock)), 0);
    }
}
