// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {LoanVault} from "../../src/LoanVault.sol";
import {Errors} from "../../src/lib/Errors.sol";
import {MockCashToken} from "../helpers/MockCashToken.sol";

interface VaultAPI {
    struct DebtTerms {
        address borrower;
        bytes32 assetId;
        address assetToken;
        uint256 originalPrincipal;
        uint32 rateNumerator;
        uint64 rateDenominator;
        uint64 startTime;
        uint64 settlementDeadline;
        uint256 snapshotCollateral;
        uint128 snapshotMultiplierNumerator;
        uint128 snapshotMultiplierDenominator;
    }

    struct DebtRecord {
        DebtTerms terms;
        uint256 cumulativeDebtReduction;
        bool closed;
    }
    function initialize(address manager) external;
    function createDebt(uint256 receiptId, DebtTerms calldata terms) external;
    function debtOf(uint256 receiptId) external view returns (uint256);
    function getDebt(uint256 receiptId) external view returns (DebtRecord memory);
    function backingOf(uint256 receiptId) external view returns (uint256);
    function accountedBacking(address token) external view returns (uint256);
    function remainingSnapshotShares(uint256 receiptId) external view returns (uint256);
    function reduceDebt(uint256 receiptId, uint256 newCumulativeReduction) external returns (uint256);
    function topUpBacking(uint256 receiptId, address from, uint256 amount) external;
    function creditBackingFromSurplus(uint256 receiptId, uint256 amount) external;
    function addCollateral(uint256 receiptId, address from, uint256 shares, uint128 reportN, uint128 reportD) external;
    function releaseCollateral(uint256 receiptId, address to, uint256 shares, uint128 reportN, uint128 reportD) external;
}

contract LoanVaultTest is Test {
    LoanVault internal vault;
    VaultAPI internal v;
    MockCashToken internal stock;
    address internal constant BORROWER = address(0xA11CE);

    function setUp() public {
        vm.warp(1000);
        stock = new MockCashToken();
        vault = new LoanVault(address(this));
        v = VaultAPI(address(vault));
        v.initialize(address(this));
        stock.mint(BORROWER, 1000e18);
        vm.prank(BORROWER);
        stock.approve(address(v), type(uint256).max);
    }

    function terms() internal view returns (VaultAPI.DebtTerms memory t) {
        t = VaultAPI.DebtTerms(BORROWER, keccak256("STOCK"), address(stock), 1000, 800, 10000, 1000, 1010, 10e18, 1, 1);
    }

    // Missing binding or permissive replacement gives an attacker custody authority.
    function testVaultBindingIsOwnerOnlyNonzeroOneShotAndRequired() public {
        VaultAPI fresh = VaultAPI(address(new LoanVault(address(this))));
        vm.expectRevert(Errors.NotInitialized.selector);
        fresh.createDebt(1, terms());
        vm.prank(address(9));
        vm.expectRevert(abi.encodeWithSelector(Errors.Unauthorized.selector, address(9)));
        fresh.initialize(address(9));
        vm.expectRevert(Errors.ZeroAddress.selector);
        fresh.initialize(address(0));
        fresh.initialize(address(this));
        vm.expectRevert(Errors.AlreadyInitialized.selector);
        fresh.initialize(address(9));
        vm.expectRevert(Errors.ZeroAddress.selector);
        new LoanVault(address(0));
    }

    function testCreateCustodiesCollateralAndSnapshotsExactInterestBasis() public {
        VaultAPI.DebtTerms memory t = terms();
        v.createDebt(1, t);
        assertEq(stock.balanceOf(BORROWER), 990e18);
        assertEq(stock.balanceOf(address(v)), 10e18);
        assertEq(v.backingOf(1), 10e18);
        assertEq(v.accountedBacking(address(stock)), 10e18);
        assertEq(v.remainingSnapshotShares(1), 10e18);
        assertEq(abi.encode(v.getDebt(1).terms), abi.encode(t));
        assertEq(v.debtOf(1), 1000);
        vm.warp(1001);
        assertEq(v.debtOf(1), 1080);
        vm.warp(1010);
        assertEq(v.debtOf(1), 1800);
        vm.warp(5000);
        assertEq(v.debtOf(1), 1800);
        vm.expectRevert(Errors.InvalidReceiptId.selector);
        v.createDebt(1, t);
        assertEq(stock.balanceOf(address(v)), 10e18);
    }

    function testCreateRejectsUnauthorizedInvalidIdsTermsAndUnboundedDebt() public {
        VaultAPI.DebtTerms memory t = terms();
        vm.prank(address(9));
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedManager.selector, address(9)));
        v.createDebt(1, t);
        vm.expectRevert();
        v.createDebt(0, t);
        t.borrower = address(0);
        vm.expectRevert();
        v.createDebt(1, t);
        t = terms();
        t.assetId = bytes32(0);
        vm.expectRevert();
        v.createDebt(1, t);
        t = terms();
        t.assetToken = address(0);
        vm.expectRevert();
        v.createDebt(1, t);
        t = terms();
        t.originalPrincipal = 0;
        vm.expectRevert();
        v.createDebt(1, t);
        t = terms();
        t.originalPrincipal = type(uint128).max;
        vm.expectRevert();
        v.createDebt(1, t);
        t = terms();
        t.rateNumerator = 10001;
        vm.expectRevert();
        v.createDebt(1, t);
        t = terms();
        t.rateDenominator = 0;
        vm.expectRevert();
        v.createDebt(1, t);
        t = terms();
        t.startTime = 1001;
        vm.expectRevert();
        v.createDebt(1, t);
        t = terms();
        t.settlementDeadline = 999;
        vm.expectRevert();
        v.createDebt(1, t);
        t = terms();
        t.snapshotCollateral = 0;
        vm.expectRevert();
        v.createDebt(1, t);
        t = terms();
        t.snapshotCollateral = uint256(type(uint128).max) + 1;
        vm.expectRevert();
        v.createDebt(1, t);
        t = terms();
        t.snapshotMultiplierNumerator = 0;
        vm.expectRevert();
        v.createDebt(1, t);
        t = terms();
        t.snapshotMultiplierDenominator = 0;
        vm.expectRevert();
        v.createDebt(1, t);
        v.createDebt(1, terms());
        assertEq(v.debtOf(1), 1000);
    }

    function testShortCollateralAndSenderFeeRollbackCreationAtomically() public {
        stock.setShortTransferFrom(true);
        vm.expectRevert();
        v.createDebt(1, terms());
        stock.setShortTransferFrom(false);
        stock.setSenderFee(1);
        vm.expectRevert();
        v.createDebt(1, terms());
        assertEq(stock.balanceOf(BORROWER), 1000e18);
        assertEq(stock.balanceOf(address(v)), 0);
        assertEq(v.backingOf(1), 0);
        stock.setSenderFee(0);
        v.createDebt(1, terms());
        assertEq(v.debtOf(1), 1000);
    }

    // Resetting principal on repayment or omitting permanent closure breaks these literals.
    function testCumulativeReductionKeepsOriginalBasisAndClosedDebtNeverRevives() public {
        v.createDebt(1, terms());
        vm.warp(1001);
        assertEq(v.reduceDebt(1, 100), 100);
        assertEq(v.debtOf(1), 980);
        vm.warp(1002);
        assertEq(v.debtOf(1), 1060);
        assertEq(v.reduceDebt(1, 1160), 1060);
        assertTrue(v.getDebt(1).closed);
        assertEq(v.getDebt(1).terms.originalPrincipal, 1000);
        assertEq(v.getDebt(1).cumulativeDebtReduction, 1160);
        vm.warp(1009);
        assertEq(v.debtOf(1), 0);
        vm.warp(5000);
        assertEq(v.debtOf(1), 0);
        vm.expectRevert();
        v.reduceDebt(1, 1161);
        vm.expectRevert();
        v.createDebt(1, terms());
    }

    function testReductionRejectsUnauthorizedZeroDecreasingAndExcessAmounts() public {
        v.createDebt(1, terms());
        vm.prank(address(9));
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedManager.selector, address(9)));
        v.reduceDebt(1, 1);
        vm.expectRevert();
        v.reduceDebt(2, 1);
        vm.expectRevert();
        v.reduceDebt(1, 0);
        vm.expectRevert();
        v.reduceDebt(1, 1001);
        v.reduceDebt(1, 50);
        vm.expectRevert();
        v.reduceDebt(1, 49);
        vm.expectRevert();
        v.reduceDebt(1, 50);
        assertEq(v.debtOf(1), 950);
        assertEq(v.getDebt(1).cumulativeDebtReduction, 50);
    }

    function testAddedCollateralUsesSnapshotUnitsWithoutChangingImmutableTerms() public {
        v.createDebt(1, terms());
        v.addCollateral(1, BORROWER, 2e18, 3, 2);
        assertEq(v.remainingSnapshotShares(1), 12e18);
        assertEq(v.backingOf(1), 13e18);
        assertEq(v.getDebt(1).terms.snapshotCollateral, 10e18);
        v.releaseCollateral(1, BORROWER, 2e18, 3, 2);
        assertEq(v.remainingSnapshotShares(1), 10e18);
        assertEq(v.backingOf(1), 10e18);
        assertEq(stock.balanceOf(BORROWER), 990e18);
        assertEq(v.accountedBacking(address(stock)), 10e18);
    }

    function testBackingTopupsAndSurplusCannotDoubleCreditOrCrossReceipts() public {
        v.createDebt(1, terms());
        v.createDebt(2, terms());
        v.topUpBacking(1, BORROWER, 2e18);
        stock.mint(address(v), 3e18);
        v.creditBackingFromSurplus(1, 3e18);
        assertEq(v.backingOf(1), 15e18);
        assertEq(v.backingOf(2), 10e18);
        assertEq(v.accountedBacking(address(stock)), 25e18);
        vm.expectRevert();
        v.creditBackingFromSurplus(2, 1);
        vm.expectRevert();
        v.releaseCollateral(1, BORROWER, 10e18, 2, 1);
        assertEq(v.backingOf(2), 10e18);
        assertEq(v.remainingSnapshotShares(1), 10e18);
        v.releaseCollateral(1, BORROWER, 10e18, 3, 2);
        assertEq(stock.balanceOf(address(v)), 10e18);
        assertEq(v.backingOf(1), 0);
    }

    function testCustodyMovementRequiresManagerAndValidPositiveInputs() public {
        v.createDebt(1, terms());
        vm.startPrank(address(9));
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedManager.selector, address(9)));
        v.topUpBacking(1, BORROWER, 1);
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedManager.selector, address(9)));
        v.creditBackingFromSurplus(1, 1);
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedManager.selector, address(9)));
        v.addCollateral(1, BORROWER, 1, 1, 1);
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedManager.selector, address(9)));
        v.releaseCollateral(1, BORROWER, 1, 1, 1);
        vm.stopPrank();
        vm.expectRevert();
        v.topUpBacking(9, BORROWER, 1);
        vm.expectRevert();
        v.topUpBacking(1, BORROWER, 0);
        vm.expectRevert();
        v.creditBackingFromSurplus(1, 0);
        vm.expectRevert();
        v.releaseCollateral(1, BORROWER, 11e18, 1, 1);
        vm.expectRevert();
        v.releaseCollateral(1, address(0), 1, 1, 1);
        vm.expectRevert();
        v.releaseCollateral(1, address(v), 1, 1, 1);
        vm.expectRevert();
        v.addCollateral(1, BORROWER, 1, 0, 1);
        vm.expectRevert();
        v.addCollateral(1, BORROWER, 1, 1, 0);
        vm.expectRevert();
        v.addCollateral(1, BORROWER, 0, 1, 1);
        vm.expectRevert();
        v.addCollateral(1, BORROWER, 1, 1, 2);
        vm.expectRevert();
        v.addCollateral(1, BORROWER, type(uint128).max, 1, 1);
        v.topUpBacking(1, BORROWER, 1);
        v.reduceDebt(1, 1000);
        vm.expectRevert();
        v.addCollateral(1, BORROWER, 1, 1, 1);
        v.releaseCollateral(1, BORROWER, 1, 1, 1);
    }

    function testCustodyTransferFailuresRollbackBackingAndSnapshotShares() public {
        v.createDebt(1, terms());
        stock.setShortTransferFrom(true);
        vm.expectRevert();
        v.topUpBacking(1, BORROWER, 10);
        vm.expectRevert();
        v.addCollateral(1, BORROWER, 10, 1, 1);
        stock.setShortTransferFrom(false);
        stock.setShortTransfer(true);
        vm.expectRevert();
        v.releaseCollateral(1, BORROWER, 10, 1, 1);
        stock.setShortTransfer(false);
        stock.setSenderFee(1);
        vm.expectRevert();
        v.topUpBacking(1, BORROWER, 10);
        vm.expectRevert();
        v.releaseCollateral(1, BORROWER, 10, 1, 1);
        assertEq(v.backingOf(1), 10e18);
        assertEq(v.remainingSnapshotShares(1), 10e18);
        assertEq(v.accountedBacking(address(stock)), 10e18);
        assertEq(stock.balanceOf(BORROWER), 990e18);
        stock.setSenderFee(0);
        v.releaseCollateral(1, BORROWER, 10, 1, 1);
        assertEq(v.backingOf(1), 10e18 - 10);
    }
}
