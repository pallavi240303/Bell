// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {LoanFixture, LoanAPI} from "../unit/LoanManager.t.sol";
import {LoanManager} from "../../src/LoanManager.sol";
import {LoanVault} from "../../src/LoanVault.sol";

/// @dev A narrow stateful campaign: no reset of principal/start through repayments or cover cycles.
contract DurableLoanInvariants is LoanFixture {
    uint256 internal id;
    uint256 internal repayments;
    uint256 internal additions;

    function setUp() public override {
        super.setUp();
        id = _borrow();
        targetContract(address(this));
        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = this.repaySome.selector;
        selectors[1] = this.addSome.selector;
        selectors[2] = this.advanceTime.selector;
        targetSelector(FuzzSelector(address(this), selectors));
    }

    function repaySome(uint256 seed) external {
        uint256 debt = manager.debtOf(id);
        if (debt == 0) return;
        uint256 amount = bound(seed, 1, debt);
        cash.mint(OTHER, amount);
        vm.prank(OTHER);
        manager.repay(id, amount);
        repayments += amount;
    }

    function addSome(uint256 seed) external {
        if (manager.debtOf(id) == 0) return;
        uint256 shares = bound(seed, 1, 1e18);
        stock.mint(OTHER, shares);
        vm.prank(OTHER);
        manager.addCollateral(id, shares);
        additions += shares;
    }

    function advanceTime(uint64 seconds_) external {
        vm.warp(block.timestamp + bound(uint256(seconds_), 1, 365 days));
    }

    function invariant_originalBasisAndReductionsNeverChangeMeaning() public view {
        LoanVault.DebtRecord memory record = vault.getDebt(id);
        assertEq(record.terms.originalPrincipal, 500e6);
        assertEq(record.terms.startTime, 1200);
        assertEq(record.terms.settlementDeadline, 0);
        assertEq(record.cumulativeDebtReduction, repayments);
        assertEq(record.terms.rateNumerator, 800);
        if (record.closed) assertEq(manager.debtOf(id), 0);
    }

    function invariant_poolNavExactlyCashPlusLiveDebt() public view {
        assertEq(pool.totalAssets(), cash.balanceOf(address(pool)) + manager.debtOf(id));
        assertEq(pool.activeReceiptIds().length, manager.debtOf(id) == 0 ? 0 : 1);
    }

    function invariant_oneLoanBackingNeverLeavesWithoutClaims() public view {
        assertEq(vault.backingOf(id), 10e18 + additions);
        assertEq(vault.accountedBacking(address(stock)), stock.balanceOf(address(vault)));
        assertEq(vault.remainingSnapshotShares(id) + vault.outstandingClaimUnits(id), 10e18 + additions);
        assertEq(manager.nextLoanId(), 2);
    }
}
