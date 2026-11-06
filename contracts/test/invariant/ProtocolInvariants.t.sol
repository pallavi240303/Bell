// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Handler} from "./Handler.sol";

/// forge-config: default.invariant.fail-on-revert = true
contract ProtocolInvariantsTest is Test {
    Handler internal handler;

    function setUp() public {
        handler = new Handler();
        handler.setUp();
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](16);
        selectors[0] = handler.borrow.selector;
        selectors[1] = handler.postCancel.selector;
        selectors[2] = handler.repay.selector;
        selectors[3] = handler.report.selector;
        selectors[4] = handler.settle.selector;
        selectors[5] = handler.terminal.selector;
        selectors[6] = handler.restrictions.selector;
        selectors[7] = handler.split.selector;
        selectors[8] = handler.withdrawClaims.selector;
        selectors[9] = handler.withdrawCredits.selector;
        selectors[10] = handler.unauthorized.selector;
        selectors[11] = handler.invalidReport.selector;
        selectors[12] = handler.topUp.selector;
        selectors[13] = handler.invalidActions.selector;
        selectors[14] = handler.collateral.selector;
        selectors[15] = handler.invalidPreBorrow.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
    }

    function testBorrowActionIsReachable() public {
        handler.borrow();
        handler.invalidActions();
        assertEq(handler.successfulBorrows(), 1);
    }

    function testGuidedActionsAreReachable() public {
        handler.postCancel(1);
        handler.invalidPreBorrow();
        handler.borrow();
        handler.invalidActions();
        handler.collateral(1e18);
        handler.repay(1e6);
        handler.restrictions();
        handler.split();
        handler.unauthorized();
        handler.invalidReport(0);
        handler.invalidReport(1);
        handler.invalidReport(2);
        handler.report(60e6 + 2);
        handler.settle();
        handler.terminal();
        handler.invalidActions();
        handler.topUp();
        handler.withdrawClaims();
        handler.withdrawCredits();
        handler.checkAccounting();
        assertGt(handler.successfulPosts(), 0);
        assertGt(handler.successfulCancellations(), 0);
        assertGt(handler.successfulBorrows(), 0);
        assertGt(handler.successfulRepayments(), 0);
        assertGt(handler.successfulCollateralAdds(), 0);
        assertGt(handler.successfulCollateralWithdrawals(), 0);
        assertGt(handler.successfulReports(), 0);
        assertGt(handler.successfulSettlements(), 0);
        assertEq(handler.successfulTerminal(), 0); // ended normal cover cannot terminal-settle
        assertGt(handler.successfulClaims(), 0);
        assertGt(handler.successfulCredits(), 0);
        assertGt(handler.successfulRestrictions(), 0);
        assertGt(handler.successfulSplits(), 0);
        assertGt(handler.expectedReverts(), 0);
        assertEq(handler.invalidReports(), 3);
        assertGt(handler.rejectedMissingBenchmarks(), 0);
        assertGt(handler.rejectedUnsafeWithdrawals(), 0);
        assertGt(handler.rejectedUnauthenticatedClaims(), 0);
        assertGt(handler.rejectedInvalidPosts(), 0);
        assertGt(handler.rejectedInvalidCancellations(), 0);
        assertGt(handler.rejectedInvalidBorrows(), 0);
        assertGt(handler.rejectedInvalidRepayments(), 0);
        assertGt(handler.successfulTopups(), 0);
        assertEq(handler.violations(), 0);
        emit log_named_uint("posts", handler.successfulPosts());
        emit log_named_uint("cancellations", handler.successfulCancellations());
        emit log_named_uint("borrows", handler.successfulBorrows());
        emit log_named_uint("repayments", handler.successfulRepayments());
        emit log_named_uint("collateral additions", handler.successfulCollateralAdds());
        emit log_named_uint("collateral withdrawals", handler.successfulCollateralWithdrawals());
        emit log_named_uint("reports", handler.successfulReports());
        emit log_named_uint("normal settlements", handler.successfulSettlements());
        emit log_named_uint("terminal settlements", handler.successfulTerminal());
        emit log_named_uint("restrictions", handler.successfulRestrictions());
        emit log_named_uint("splits", handler.successfulSplits());
        emit log_named_uint("topups", handler.successfulTopups());
        emit log_named_uint("claims", handler.successfulClaims());
        emit log_named_uint("credits", handler.successfulCredits());
        emit log_named_uint("expected reverts", handler.expectedReverts());
        emit log_named_uint("violations", handler.violations());
    }

    function testTerminalSettlementNeedsNoReport() public {
        handler.borrow();
        handler.terminal();
        handler.checkAccounting();
        assertEq(handler.ghostEconomicShares(), 10e18);
        assertEq(handler.successfulReports(), 0);
        assertEq(handler.successfulTerminal(), 1);
    }

    function testReverseSplitUsesIndependentFloorConversion() public {
        handler.borrow();
        handler.report(60e6 + 3);
        handler.settle();
        handler.terminal();
        handler.withdrawClaims();
        handler.checkAccounting();
        assertEq(handler.ghostMultiplierN(), 1);
        assertEq(handler.ghostMultiplierD(), 2);
        assertEq(handler.ghostEconomicShares() + handler.ghostRemainingShares(), 10e18);
        assertEq(handler.ghostClaimShares(1) % 2, 1);
        assertEq(handler.ghostClaimUnits(1), handler.ghostClaimShares(1) / 2);
        assertGt(handler.successfulClaims(), 0);
    }

    function invariant_accountingAndAuthority() public view {
        handler.checkAccounting();
        assertEq(handler.violations(), 0);
    }

    function testRandomizedSuccessfulTransitionCounts() public {
        bytes4[16] memory actions = [
            handler.borrow.selector,
            handler.postCancel.selector,
            handler.repay.selector,
            handler.report.selector,
            handler.settle.selector,
            handler.terminal.selector,
            handler.restrictions.selector,
            handler.split.selector,
            handler.withdrawClaims.selector,
            handler.withdrawCredits.selector,
            handler.unauthorized.selector,
            handler.invalidReport.selector,
            handler.topUp.selector,
            handler.invalidActions.selector,
            handler.collateral.selector,
            handler.invalidPreBorrow.selector
        ];
        uint256[16] memory totals;
        uint256 snapshot = vm.snapshotState();
        for (uint256 run; run < 32; ++run) {
            for (uint256 step; step < 200; ++step) {
                uint256 seed = uint256(keccak256(abi.encode(run, step)));
                (bool ok,) = address(handler).call(abi.encodeWithSelector(actions[seed % 16], seed >> 8));
                assertTrue(ok);
            }
            handler.checkAccounting();
            totals[0] += handler.successfulPosts();
            totals[1] += handler.successfulCancellations();
            totals[2] += handler.successfulBorrows();
            totals[3] += handler.successfulRepayments();
            totals[4] += handler.successfulCollateralAdds();
            totals[5] += handler.successfulCollateralWithdrawals();
            totals[6] += handler.successfulReports();
            totals[7] += handler.successfulSettlements();
            totals[8] += handler.successfulTerminal();
            totals[9] += handler.successfulRestrictions();
            totals[10] += handler.successfulSplits();
            totals[11] += handler.successfulTopups();
            totals[12] += handler.successfulClaims();
            totals[13] += handler.successfulCredits();
            totals[14] += handler.expectedReverts();
            totals[15] += handler.violations();
            assertTrue(vm.revertToState(snapshot));
        }
        string[16] memory labels = [
            string("campaign posts"),
            "campaign cancellations",
            "campaign borrows",
            "campaign repayments",
            "campaign collateral additions",
            "campaign collateral withdrawals",
            "campaign reports",
            "campaign normal settlements",
            "campaign terminal settlements",
            "campaign restrictions",
            "campaign splits",
            "campaign topups",
            "campaign claims",
            "campaign credits",
            "campaign expected reverts",
            "campaign violations"
        ];
        for (uint256 i; i < totals.length; ++i) {
            emit log_named_uint(labels[i], totals[i]);
            if (i < 15) assertGt(totals[i], 0);
            else assertEq(totals[i], 0);
        }
    }
}
