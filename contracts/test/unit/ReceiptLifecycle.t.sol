// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReceiptFixture, LifecycleAPI} from "../helpers/ReceiptFixture.sol";
import {LoanVault} from "../../src/LoanVault.sol";
import {MockStockToken} from "../../src/demo/MockStockToken.sol";
import {Types} from "../../src/lib/Types.sol";
import {Errors} from "../../src/lib/Errors.sol";
import {CoverManager} from "../../src/CoverManager.sol";
import {SessionOracle} from "../../src/SessionOracle.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ReceiptLifecycleTest is ReceiptFixture {
    function testManagerDeployableWithinEvmRuntimeLimit() public view {
        assertLe(address(manager).code.length, 24_576);
    }

    // Removing any identity comparison would consume a benchmark for a different funded receipt.
    function testNormalSettlementAuthenticatesEveryBenchmarkIdentityAndRollsBack() public {
        uint256 id = _borrow();
        _benchmark(100e6, 1, 1);
        Types.Benchmark memory accepted = oracle.benchmarkOf(SESSION);
        bytes32 beforeState = _state(id);
        for (uint256 i; i < 4; ++i) {
            Types.Benchmark memory wrong = oracle.benchmarkOf(SESSION);
            if (i == 0) wrong.assetId = bytes32(uint256(8));
            if (i == 1) wrong.sessionId = bytes32(uint256(8));
            if (i == 2) wrong.configHash = bytes32(uint256(8));
            if (i == 3) wrong.reportHash = 0;
            // The real oracle prevents these states; this boundary double checks the manager independently.
            vm.mockCall(address(oracle), abi.encodeCall(SessionOracle.benchmarkOf, (SESSION)), abi.encode(wrong));
            vm.expectRevert(CoverManager.BenchmarkIdentityMismatch.selector);
            life.settle(id);
            vm.clearMockedCalls();
            assertEq(_state(id), beforeState);
        }
        _settle(id, false);
        assertEq(manager.getReceipt(id).benchmarkReportHash, accepted.reportHash);
        assertEq(manager.getReceipt(id).benchmarkValuePerSnapshotShare, 100e6);
    }

    function testSnapshotRationalBenchmarkFloorsOnlyOnceAndUsesReceiptSessionAfterNewSchedule() public {
        Types.MarketEventReport memory action = _report(Types.MarketEventKind.CORPORATE_ACTION);
        action.corporateAction = Types.CorporateAction.REVERSE_SPLIT;
        action.actionId = keccak256("RATIONAL");
        action.multiplierNumerator = 1;
        action.multiplierDenominator = 3;
        oracle.acceptReport(action);
        quote.corporateActionHash = oracle.latestCorporateAction(ASSET).reportHash;
        quote.snapshotMultiplierDenominator = 3;
        uint256 id = _borrow();
        _benchmark(60_000_001, 1, 2);
        Types.MarketEventReport memory nextSession = _report(Types.MarketEventKind.SESSION_SCHEDULED);
        nextSession.sessionId = keccak256("NEXT");
        nextSession.scheduledOpen = 1800;
        nextSession.scheduledClose = 1900;
        oracle.acceptReport(nextSession);
        _settle(id, false);
        CoverManager.Receipt memory r = manager.getReceipt(id);
        assertEq(r.benchmarkValuePerSnapshotShare, 90_000_001);
        assertEq(r.latestMultiplierNumerator, 1);
        assertEq(r.latestMultiplierDenominator, 2);
        vm.prank(PAYER);
        life.addCollateral(id, 2);
        assertEq(vault.backingOf(id), 10e18 + 3);
        assertEq(vault.remainingSnapshotShares(id), 10e18 + 2);
        vm.warp(2000);
        _settle(id, true);
        assertEq(vault.getClaim(1).reportMultiplierDenominator, 2);
    }

    function testBenchmarkWithoutProcessingDoesNotChangeTerminalClaimMultiplier() public {
        uint256 id = _borrow();
        _benchmark(50e6, 2, 1);
        vm.warp(2000);
        _settle(id, true);
        assertEq(manager.getReceipt(id).benchmarkReportHash, bytes32(0));
        assertEq(vault.getClaim(1).reportMultiplierNumerator, 1);
        assertEq(liabilities.outstandingClaimUnits(id), 10e18);
    }

    function testCashCallbacksCannotMintOrRedeemPoolSharesDuringRepayOrExercise() public {
        uint256 id = _borrow();
        vm.prank(LENDER);
        assertTrue(pool.transfer(address(cash), 1e18));
        bytes32 beforeState = _state(id);
        cash.setTransferFromHook(address(pool), abi.encodeCall(pool.deposit, (100)));
        vm.prank(PAYER);
        vm.expectRevert(CoverManager.CashDebtTransition.selector);
        life.repay(id, 100);
        assertEq(_state(id), beforeState);
        cash.setTransferFromHook(address(pool), abi.encodeCall(pool.redeem, (1e18, ADVERSARY)));
        vm.prank(PAYER);
        vm.expectRevert(CoverManager.CashDebtTransition.selector);
        life.repay(id, 100);
        assertEq(_state(id), beforeState);
        cash.setTransferFromHook(address(0), "");
        _repay(id, PAYER, 100);
        _benchmark(60e6, 1, 1);
        beforeState = _state(id);
        cash.setTransferHook(address(pool), abi.encodeCall(pool.redeem, (1e18, ADVERSARY)));
        vm.expectRevert(CoverManager.CashDebtTransition.selector);
        life.settle(id);
        assertEq(_state(id), beforeState);
        assertEq(cash.balanceOf(ADVERSARY), 0);
        cash.setTransferHook(address(0), "");
        _settle(id, false);
        assertEq(pool.totalAssets(), POOL_CASH + 1);
    }

    function testReentrantRepayCannotApplySecondReductionAndRecovers() public {
        uint256 id = _borrow();
        bytes32 beforeState = _state(id);
        cash.setTransferFromHook(address(manager), abi.encodeCall(LifecycleAPI.repay, (id, 1)));
        vm.prank(PAYER);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        life.repay(id, 100);
        assertEq(_state(id), beforeState);
        cash.setTransferFromHook(address(0), "");
        _repay(id, PAYER, 100);
    }

    function testSettlementCashFailureRollsBackBenchmarkClaimsFillsAndDebtBeforeRecovery() public {
        uint256 id = _borrow();
        _benchmark(60e6, 1, 1);
        bytes32 beforeState = _state(id);
        cash.setShortTransfer(true);
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidTokenBalanceDelta.selector, 180_327_869, 180_327_868));
        life.settle(id);
        assertEq(_state(id), beforeState);
        assertEq(liabilities.outstandingClaimUnits(id), 0);
        cash.setShortTransfer(false);
        _settle(id, false);
        assertEq(manager.getReceipt(id).benchmarkValuePerSnapshotShare, 60e6);
    }

    function testCollateralInputsAndTransferFailurePreserveBackingAndRecover() public {
        uint256 id = _borrow();
        bytes32 beforeState = _state(id);
        vm.prank(PAYER);
        vm.expectRevert(Errors.UnsupportedShareAmount.selector);
        life.addCollateral(id, 0);
        stock.setPaused(true);
        vm.prank(PAYER);
        vm.expectRevert(MockStockToken.TransfersPaused.selector);
        life.addCollateral(id, 1e18);
        assertEq(_state(id), beforeState);
        stock.setPaused(false);
        vm.prank(PAYER);
        life.addCollateral(id, 1e18);
        vm.prank(BORROWER);
        vm.expectRevert(Errors.InvalidExerciseShares.selector);
        life.withdrawCollateral(id, 0);
        vm.prank(BORROWER);
        vm.expectRevert(Errors.InvalidExerciseShares.selector);
        life.withdrawCollateral(id, 12e18);
        vm.prank(BORROWER);
        life.withdrawCollateral(id, 1e18);
        assertEq(vault.backingOf(id), 10e18);
    }

    function testVaultSurplusCannotConsumeOutstandingBuyerClaimsAndOnlyManagerCanRelease() public {
        uint256 id = _borrow();
        _benchmark(1, 1, 10);
        _settle(id, false);
        uint256 backing = vault.backingOf(id);
        vm.prank(ADVERSARY);
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedManager.selector, ADVERSARY));
        liabilities.releaseSurplus(id);
        vm.prank(address(manager));
        vm.expectRevert(LoanVault.HandoffIncomplete.selector);
        liabilities.releaseSurplus(id);
        vm.prank(BORROWER);
        vm.expectRevert(LoanVault.InvalidClaim.selector);
        vault.withdrawClaim(1, BORROWER);
        assertEq(vault.backingOf(id), backing);
        assertFalse(vault.getClaim(1).withdrawn);
        _withdrawAllClaims();
        life.finalizeHandoff(id);
        assertEq(vault.backingOf(id), 0);
    }

    function testActiveCollateralReleaseCannotConsumeRecordedClaimBacking() public {
        uint256 id = _borrow();
        _benchmark(30e6, 2, 1);
        _settle(id, false);
        // Manager-only vault boundary: even an attempted release cannot spend assigned claim units.
        uint256 backing = vault.backingOf(id);
        vm.prank(address(manager));
        vm.expectRevert(LoanVault.InsufficientBacking.selector);
        vault.releaseCollateral(id, BORROWER, 4e18, 2, 1);
        assertEq(vault.backingOf(id), backing);
        vm.prank(PAYER);
        life.topUpBacking(id, 10e18);
        vm.prank(address(manager));
        vault.releaseCollateral(id, BORROWER, 4e18, 2, 1);
        assertEq(vault.backingOf(id), 12e18);
    }

    // Omitting pool funding, resetting principal, or releasing partial cover breaks conservation.
    function testBorrowerAndThirdPartyRepayRetainCoverUntilExactFinancialClosure() public {
        uint256 id = _borrow();
        _repay(id, BORROWER, 100e6);
        _repay(id, PAYER, 150e6);
        assertEq(vault.getDebt(id).terms.originalPrincipal, 500e6 - 1);
        assertEq(vault.getDebt(id).cumulativeDebtReduction, 250e6);
        assertEq(book.totalLockedCash(), 950e6);
        _reserved();
        stock.setPaused(true);
        _repay(id, PAYER, 250e6);
        _closedFinancially(id);
        assertEq(vault.getClaim(1).owner, BORROWER);
        assertEq(vault.getClaim(1).snapshotShares, 10e18);
        assertEq(liabilities.outstandingClaimUnits(id), 10e18);
        vm.warp(3000);
        assertEq(manager.debtOf(id), 0);
        stock.setPaused(false);
        _withdrawAllClaims();
        vm.prank(KEEPER);
        life.finalizeHandoff(id);
        assertEq(uint8(manager.getReceipt(id).status), 3);
    }

    function testInvalidRepayAmountsAndUnknownReceiptsRollbackThenRepaymentWorks() public {
        uint256 id = _borrow();
        bytes32 beforeState = _state(id);
        vm.expectRevert(Errors.InvalidReceiptId.selector);
        life.repay(99, 1);
        vm.expectRevert(Errors.InvalidDebtApplied.selector);
        life.repay(id, 0);
        vm.expectRevert(Errors.InvalidDebtApplied.selector);
        life.repay(id, 500e6 + 1);
        assertEq(_state(id), beforeState);
        _repay(id, PAYER, 1);
    }

    function testRepayShortTransferSenderFeeAndCallbackRollbackWithRecovery() public {
        uint256 id = _borrow();
        bytes32 beforeState = _state(id);
        cash.setShortTransferFrom(true);
        vm.prank(PAYER);
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidTokenBalanceDelta.selector, 100, 99));
        life.repay(id, 100);
        assertEq(_state(id), beforeState);
        cash.setShortTransferFrom(false);
        cash.setSenderFee(1);
        vm.prank(PAYER);
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidTokenBalanceDelta.selector, 100, 101));
        life.repay(id, 100);
        assertEq(_state(id), beforeState);
        cash.setSenderFee(0);
        cash.setTransferFromHook(address(pool), abi.encodeCall(pool.totalAssets, ()));
        vm.prank(PAYER);
        vm.expectRevert(bytes4(keccak256("CashDebtTransition()")));
        life.repay(id, 100);
        assertEq(_state(id), beforeState);
        cash.setTransferFromHook(address(0), "");
        _repay(id, PAYER, 100);
        assertEq(pool.totalAssets(), POOL_CASH + 1);
    }

    function testCollateralAdditionWorksDuringHaltAndAfterDeadlineWithoutChangingDebt() public {
        uint256 id = _borrow();
        Types.MarketEventReport memory halt = _report(Types.MarketEventKind.HALT);
        halt.halted = true;
        oracle.acceptReport(halt);
        vm.warp(2000);
        vm.prank(PAYER);
        life.addCollateral(id, 2e18);
        assertEq(vault.remainingSnapshotShares(id), 12e18);
        assertEq(vault.backingOf(id), 12e18);
        assertEq(vault.debtOf(id), 500e6);
        _settle(id, true);
        _closedFinancially(id);
    }

    function testWithdrawRequiresBorrowerSafetyAndEveryUnexercisedReservedShare() public {
        uint256 id = _borrow();
        vm.prank(PAYER);
        life.addCollateral(id, 2e18);
        bytes32 beforeState = _state(id);
        vm.prank(ADVERSARY);
        vm.expectRevert(bytes4(keccak256("InvalidBorrower()")));
        life.withdrawCollateral(id, 1e18);
        vm.prank(BORROWER);
        vm.expectRevert(bytes4(keccak256("ReservedCollateral()")));
        life.withdrawCollateral(id, 3e18);
        assertEq(_state(id), beforeState);
        stock.setPaused(true);
        vm.prank(BORROWER);
        vm.expectRevert(MockStockToken.TransfersPaused.selector);
        life.withdrawCollateral(id, 2e18);
        assertEq(_state(id), beforeState);
        stock.setPaused(false);
        vm.prank(BORROWER);
        life.withdrawCollateral(id, 2e18);
        assertEq(vault.remainingSnapshotShares(id), 10e18);
        assertEq(vault.backingOf(id), 10e18);
        assertEq(stock.balanceOf(BORROWER), 992e18);
    }

    function testWithdrawalUsesLatestBenchmarkLtvAndDeadlineRatherThanReferencePrice() public {
        uint256 id = _borrow();
        vm.prank(PAYER);
        life.addCollateral(id, 2e18);
        _benchmark(60e6, 1, 1);
        _settle(id, false); // healthy at 500 / 720, but above origination LTV
        bytes32 beforeState = _state(id);
        vm.prank(BORROWER);
        vm.expectRevert(Errors.BorrowerLtvTooHigh.selector);
        life.withdrawCollateral(id, 1e18);
        assertEq(_state(id), beforeState);
        _repay(id, PAYER, 200e6);
        vm.prank(BORROWER);
        life.withdrawCollateral(id, 1e18);
        vm.warp(2000);
        vm.prank(BORROWER);
        vm.expectRevert(bytes4(keccak256("SettlementDeadlineReached()")));
        life.withdrawCollateral(id, 1);
        _settle(id, true);
    }

    function testHealthyBenchmarkChangesNoFinancialStateAndCannotBeReplayed() public {
        uint256 id = _borrow();
        _benchmark(100e6, 1, 1);
        _settle(id, false);
        assertEq(vault.debtOf(id), 500e6);
        assertEq(vault.remainingSnapshotShares(id), 10e18);
        assertEq(vault.nextClaimId(), 1);
        assertEq(book.totalLockedCash(), 950e6);
        _reserved();
        bytes32 afterState = _state(id);
        vm.expectRevert(bytes4(keccak256("BenchmarkAlreadyProcessed()")));
        life.settle(id);
        assertEq(_state(id), afterState);
        vm.warp(2000);
        _settle(id, true);
        _closedFinancially(id);
    }

    function testMissingBenchmarkAndEarlyTerminalRejectThenExactDeadlineTerminalWins() public {
        uint256 id = _borrow();
        vm.expectRevert(bytes4(keccak256("BenchmarkUnavailable()")));
        life.settle(id);
        vm.expectRevert(bytes4(keccak256("SettlementDeadlineNotReached()")));
        life.terminalSettle(id);
        assertEq(vault.debtOf(id), 500e6);
        _benchmark(100e6, 1, 1);
        vm.warp(2000);
        bytes32 beforeState = _state(id);
        vm.expectRevert(bytes4(keccak256("SettlementDeadlineReached()")));
        life.settle(id);
        assertEq(_state(id), beforeState);
        _settle(id, true);
        _closedFinancially(id);
    }

    function testFinancialAndFinalClosureCannotRepeatOrRevive() public {
        uint256 id = _borrow();
        _repay(id, PAYER, 500e6);
        bytes32 beforeState = _state(id);
        vm.expectRevert(bytes4(keccak256("ReceiptNotActive()")));
        life.repay(id, 1);
        vm.expectRevert(bytes4(keccak256("ReceiptNotActive()")));
        life.settle(id);
        vm.warp(2000);
        vm.expectRevert(bytes4(keccak256("ReceiptNotActive()")));
        life.terminalSettle(id);
        vm.expectRevert(bytes4(keccak256("ReceiptNotActive()")));
        life.addCollateral(id, 1);
        vm.expectRevert(bytes4(keccak256("HandoffIncomplete()")));
        life.finalizeHandoff(id);
        assertEq(_state(id), beforeState);
        _withdrawAllClaims();
        life.finalizeHandoff(id);
        vm.expectRevert(bytes4(keccak256("ReceiptNotPending()")));
        life.finalizeHandoff(id);
        assertEq(uint8(manager.getReceipt(id).status), 3);
        assertEq(vault.debtOf(id), 0);
    }
}

contract ReceiptInterestTest is ReceiptFixture {
    function _config(uint32) internal view override returns (Types.AssetConfig memory) {
        return Types.AssetConfig(address(stock), 18, 6, 6000, 6500, 7500, 800, 315_360_000_000, 8, 32, 6);
    }

    function testPartialRepaymentAndExerciseKeepOriginalInterestBasisUntilImmutableDeadline() public {
        uint256 id = _borrow();
        vm.warp(1101);
        assertEq(vault.debtOf(id), 500_000_126);
        _repay(id, PAYER, 100e6);
        vm.warp(1201);
        assertEq(vault.debtOf(id), 400_000_253);
        _benchmark(40e6, 1, 1);
        uint256 beforeReduction = vault.getDebt(id).cumulativeDebtReduction;
        _settle(id, false);
        uint256 cumulative = vault.getDebt(id).cumulativeDebtReduction;
        assertGt(cumulative, beforeReduction);
        assertEq(vault.getDebt(id).terms.originalPrincipal, 499_999_999);
        vm.warp(2000);
        assertEq(vault.debtOf(id), 500_001_267 - cumulative);
        uint256 deadlineDebt = vault.debtOf(id);
        vm.warp(20000);
        assertEq(vault.debtOf(id), deadlineDebt);
        _settle(id, true);
        assertEq(cash.balanceOf(address(pool)), POOL_CASH + 1268);
        assertEq(vault.getDebt(id).cumulativeDebtReduction, 500_001_267);
        assertEq(vault.debtOf(id), 0);
    }

    function testEarlyFullRepaymentStopsInterestPermanently() public {
        uint256 id = _borrow();
        vm.warp(1101);
        _repay(id, PAYER, 500_000_126);
        vm.warp(20000);
        assertEq(vault.debtOf(id), 0);
        assertEq(pool.totalAssets(), POOL_CASH + 127);
    }
}
