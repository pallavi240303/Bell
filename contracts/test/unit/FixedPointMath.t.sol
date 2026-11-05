// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";

import {Errors} from "../../src/lib/Errors.sol";
import {FixedPointMath} from "../../src/lib/FixedPointMath.sol";

contract FixedPointMathHarness {
    function mulDivDown(uint256 x, uint256 y, uint256 denominator) external pure returns (uint256) {
        return FixedPointMath.mulDivDown(x, y, denominator);
    }

    function mulDivUp(uint256 x, uint256 y, uint256 denominator) external pure returns (uint256) {
        return FixedPointMath.mulDivUp(x, y, denominator);
    }
}

contract FixedPointMathTest is Test {
    FixedPointMathHarness internal harness;

    function setUp() public {
        harness = new FixedPointMathHarness();
    }

    function testMulDivRoundsDownAndUpExactly() public pure {
        assertEq(FixedPointMath.mulDivDown(5, 3, 2), 7);
        assertEq(FixedPointMath.mulDivUp(5, 3, 2), 8);
        assertEq(FixedPointMath.mulDivDown(6, 3, 2), 9);
        assertEq(FixedPointMath.mulDivUp(6, 3, 2), 9);
    }

    function testMulDivUpPreservesOneUnitResult() public pure {
        assertEq(FixedPointMath.mulDivDown(1, 1, 3), 0);
        assertEq(FixedPointMath.mulDivUp(1, 1, 3), 1);
        assertEq(FixedPointMath.mulDivUp(0, type(uint256).max, 3), 0);
    }

    function testMulDivHandlesFullWidthIntermediateProduct() public pure {
        uint256 x = uint256(1) << 200;
        uint256 y = uint256(1) << 100;
        uint256 denominator = uint256(1) << 60;
        uint256 expected = uint256(1) << 240;

        assertEq(FixedPointMath.mulDivDown(x, y, denominator), expected);
        assertEq(FixedPointMath.mulDivUp(x, y, denominator), expected);
    }

    function testMulDivRevertsForZeroDenominator() public {
        vm.expectRevert(Errors.ZeroDenominator.selector);
        harness.mulDivDown(1, 1, 0);

        vm.expectRevert(Errors.ZeroDenominator.selector);
        harness.mulDivUp(1, 1, 0);
    }

    function testMulDivRevertsWhenResultDoesNotFitUint256() public {
        vm.expectRevert(Errors.MathResultOverflow.selector);
        harness.mulDivDown(type(uint256).max, type(uint256).max, 1);

        vm.expectRevert(Errors.MathResultOverflow.selector);
        harness.mulDivUp(type(uint256).max, type(uint256).max, 1);
    }
}
