// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";

import {Errors} from "../../src/lib/Errors.sol";
import {InterestMath} from "../../src/lib/InterestMath.sol";

contract InterestMathHarness {
    function elapsed(uint64 startTime, uint64 settlementDeadline, uint64 timestamp) external pure returns (uint64) {
        return InterestMath.elapsed(startTime, settlementDeadline, timestamp);
    }

    function interest(uint256 principal, uint32 rate, uint64 elapsedSeconds, uint256 denominator)
        external
        pure
        returns (uint256)
    {
        return InterestMath.interest(principal, rate, elapsedSeconds, denominator);
    }

    function debt(
        uint256 principal,
        uint32 rate,
        uint64 startTime,
        uint64 deadline,
        uint64 timestamp,
        uint256 denominator,
        uint256 reduction
    ) external pure returns (uint256) {
        return InterestMath.debt(principal, rate, startTime, deadline, timestamp, denominator, reduction);
    }
}

contract InterestMathTest is Test {
    uint32 internal constant RATE_NUMERATOR = 800;
    uint256 internal constant RATE_DENOMINATOR = 315_360_000_000;
    InterestMathHarness internal harness;

    function setUp() public {
        harness = new InterestMathHarness();
    }

    function testElapsedIsZeroBeforeStartAndCapsAtDeadline() public pure {
        assertEq(InterestMath.elapsed(100, 200, 99), 0);
        assertEq(InterestMath.elapsed(100, 200, 100), 0);
        assertEq(InterestMath.elapsed(100, 200, 150), 50);
        assertEq(InterestMath.elapsed(100, 200, 200), 100);
        assertEq(InterestMath.elapsed(100, 200, 250), 100);
    }

    function testElapsedRejectsDeadlineBeforeStart() public {
        vm.expectRevert(Errors.InvalidTimeRange.selector);
        harness.elapsed(200, 199, 200);
    }

    function testAnnualSimpleInterestUsesOriginalPrincipal() public pure {
        uint256 principal = 1_000_000;
        uint64 annualElapsed = 31_536_000;

        assertEq(InterestMath.interest(principal, RATE_NUMERATOR, annualElapsed, RATE_DENOMINATOR), 80_000);
    }

    function testInterestRoundsAnyPositiveFractionUpToOne() public pure {
        assertEq(InterestMath.interest(1, 1, 1, 2), 1);
        assertEq(InterestMath.interest(0, 1, 1, 2), 0);
        assertEq(InterestMath.interest(1, 0, 1, 2), 0);
        assertEq(InterestMath.interest(1, 1, 0, 2), 0);
    }

    function testPartialReductionDoesNotResetPrincipalOrClock() public pure {
        uint256 principal = 1_000_000;
        uint64 startTime = 100;
        uint64 deadline = startTime + 31_536_000;
        uint64 halfway = startTime + 15_768_000;

        uint256 debtHalfway =
            InterestMath.debt(principal, RATE_NUMERATOR, startTime, deadline, halfway, RATE_DENOMINATOR, 400_000);
        uint256 debtAtDeadline =
            InterestMath.debt(principal, RATE_NUMERATOR, startTime, deadline, deadline, RATE_DENOMINATOR, 400_000);

        assertEq(debtHalfway, 640_000);
        assertEq(debtAtDeadline, 680_000);
    }

    function testDebtStopsAtDeadlineAndReductionCanCloseIt() public pure {
        uint256 atDeadline = InterestMath.debt(1_000_000, 800, 100, 200, 200, 1_000_000, 0);
        uint256 longAfter = InterestMath.debt(1_000_000, 800, 100, 200, type(uint64).max, 1_000_000, 0);

        assertEq(longAfter, atDeadline);
        assertEq(InterestMath.debt(1_000_000, 800, 100, 200, 200, 1_000_000, atDeadline), 0);
        assertEq(InterestMath.debt(1_000_000, 800, 100, 200, 200, 1_000_000, atDeadline + 1), 0);
    }

    function testMaximumSupportedInputsRemainExact() public pure {
        uint256 result = InterestMath.interest(type(uint128).max, 10_000, 1, 10_000);
        assertEq(result, type(uint128).max);
    }

    function testInterestRejectsUnsupportedInputs() public {
        vm.expectRevert(Errors.UnsupportedCashAmount.selector);
        harness.interest(uint256(type(uint128).max) + 1, 1, 1, 1);

        vm.expectRevert(Errors.UnsupportedRate.selector);
        harness.interest(1, 10_001, 1, 1);

        vm.expectRevert(Errors.ZeroDenominator.selector);
        harness.interest(1, 1, 1, 0);

        vm.expectRevert(Errors.UnsupportedCashAmount.selector);
        harness.interest(type(uint128).max, 10_000, 1, 9_999);

        vm.expectRevert(Errors.UnsupportedCashAmount.selector);
        harness.debt(type(uint128).max, 1, 0, 1, 1, 1, 0);
    }
}
