// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {LoanVault} from "../../src/LoanVault.sol";
import {MockCashToken} from "../helpers/MockCashToken.sol";

interface WideVault {
    function projectedDebtOf(uint256 id, uint64 timestamp) external view returns (uint256);
    function setCoverDeadline(uint256 id, uint64 deadline) external;
    function clearCoverDeadline(uint256 id) external;
    function activeCoverDeadline(uint256 id) external view returns (uint64);
}

contract WideLoanVaultTest is Test {
    LoanVault vault;
    WideVault wide;
    MockCashToken stock;

    function setUp() public {
        vm.warp(1000);
        stock = new MockCashToken();
        vault = new LoanVault(address(this));
        wide = WideVault(address(vault));
        vault.initialize(address(this));
        stock.mint(address(this), 100e18);
        stock.approve(address(vault), type(uint256).max);
    }

    function create(uint256 principal) internal {
        vault.createDebt(
            1,
            LoanVault.DebtTerms(
                address(this), keccak256("A"), address(stock), principal, 800, 10000, 1000, 0, 10e18, 1, 1
            )
        );
    }

    function testOrdinaryZeroDeadlineAccruesOriginalBasisWithoutMaturity() public {
        create(1000);
        vm.warp(1005);
        assertEq(vault.debtOf(1), 1400);
        vault.reduceDebt(1, 100);
        vm.warp(1020);
        assertEq(vault.debtOf(1), 2500);
        assertEq(wide.projectedDebtOf(1, 1100), 8900);
    }

    function testActiveCapCanDetachWithoutResettingPastInterestOrRepayments() public {
        create(1000);
        vm.warp(1005);
        vault.reduceDebt(1, 100);
        wide.setCoverDeadline(1, 1010);
        assertEq(wide.projectedDebtOf(1, 2000), 1700);
        vm.warp(1007);
        wide.clearCoverDeadline(1);
        assertEq(vault.debtOf(1), 1460);
        vm.warp(1020);
        assertEq(vault.debtOf(1), 2500);
    }

    function testWideOneSecondDebtAndPermanentFullReduction() public {
        uint256 principal = type(uint128).max;
        create(principal);
        vm.warp(1001);
        uint256 debt = principal + (principal * 800 + 9999) / 10000;
        assertGt(debt, type(uint128).max);
        assertEq(vault.debtOf(1), debt);
        vault.reduceDebt(1, debt);
        vm.warp(type(uint64).max);
        assertEq(vault.debtOf(1), 0);
        vm.expectRevert();
        wide.setCoverDeadline(1, type(uint64).max);
    }

    function testCapRejectsUnauthorizedPastOverlapAndLateRemoval() public {
        create(1000);
        vm.prank(address(9));
        vm.expectRevert();
        wide.setCoverDeadline(1, 1010);
        vm.expectRevert();
        wide.setCoverDeadline(1, 999);
        wide.setCoverDeadline(1, 1010);
        vm.expectRevert();
        wide.setCoverDeadline(1, 1020);
        vm.warp(1010);
        vm.expectRevert();
        wide.clearCoverDeadline(1);
        vault.reduceDebt(1, vault.debtOf(1));
        wide.clearCoverDeadline(1);
        assertEq(wide.activeCoverDeadline(1), 0);
    }

    function testUnsupportedTimestampAndProjectedPastReject() public {
        create(1000);
        vm.warp(1010);
        vm.expectRevert();
        wide.projectedDebtOf(1, 1009);
        vm.warp(uint256(type(uint64).max) + 1);
        vm.expectRevert();
        vault.debtOf(1);
    }

    function testFuzzWideOriginalBasisAndReduction(
        uint128 principal,
        uint32 rate,
        uint64 elapsed,
        uint64 denominator,
        uint128 reduction
    ) public {
        principal = uint128(bound(principal, 1, type(uint128).max));
        rate = uint32(bound(rate, 0, 10000));
        denominator = uint64(bound(denominator, 1, type(uint64).max));
        elapsed = uint64(bound(elapsed, 0, type(uint64).max - 1000));
        vault.createDebt(
            1,
            LoanVault.DebtTerms(
                address(this), keccak256("A"), address(stock), principal, rate, denominator, 1000, 0, 10e18, 1, 1
            )
        );
        vm.warp(1000 + uint256(elapsed));
        uint256 numerator = uint256(principal) * rate * elapsed;
        uint256 gross = uint256(principal) + (numerator == 0 ? 0 : (numerator - 1) / denominator + 1);
        assertEq(vault.debtOf(1), gross);
        uint256 applied = bound(uint256(reduction), 1, gross);
        vault.reduceDebt(1, applied);
        assertEq(vault.debtOf(1), gross - applied);
        assertEq(vault.getDebt(1).terms.originalPrincipal, principal);
        if (applied == gross) {
            vm.warp(type(uint64).max);
            assertEq(vault.debtOf(1), 0);
        }
    }
}
