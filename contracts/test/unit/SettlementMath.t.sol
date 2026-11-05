// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";

import {Errors} from "../../src/lib/Errors.sol";
import {SettlementMath} from "../../src/lib/SettlementMath.sol";

contract SettlementMathHarness {
    function cashOwed(uint256 shares, uint256 strike) external pure returns (uint256) {
        return SettlementMath.cashOwed(shares, strike);
    }

    function cashDelta(uint256 oldShares, uint256 newShares, uint256 strike) external pure returns (uint256) {
        return SettlementMath.cashDelta(oldShares, newShares, strike);
    }

    function minimumSharesForCash(uint256 oldShares, uint256 lotShares, uint256 strike, uint256 targetCash)
        external
        pure
        returns (uint256, uint256)
    {
        return SettlementMath.minimumSharesForCash(oldShares, lotShares, strike, targetCash);
    }

    function planNormal(
        uint256 debtAmount,
        uint256 collateralShares,
        uint256 benchmarkPrice,
        uint16 triggerLtvBps,
        uint16 targetLtvBps,
        SettlementMath.LotState[] calldata lots
    ) external pure returns (SettlementMath.Plan memory) {
        return SettlementMath.planNormal(
            debtAmount, collateralShares, benchmarkPrice, triggerLtvBps, targetLtvBps, lots
        );
    }
}

contract SettlementMathTest is Test {
    uint256 internal constant SHARE_SCALE = 1e18;
    uint16 internal constant TRIGGER_LTV = 7_500;
    uint16 internal constant TARGET_LTV = 6_500;
    SettlementMathHarness internal harness;

    function setUp() public {
        harness = new SettlementMathHarness();
    }

    function testCashUsesCumulativeCeilingAndNotIncrementalRounding() public pure {
        assertEq(SettlementMath.cashOwed(1, 100_000_000), 1);
        assertEq(SettlementMath.cashOwed(SHARE_SCALE / 2, 1), 1);
        assertEq(SettlementMath.cashDelta(SHARE_SCALE / 2, SHARE_SCALE, 1), 0);
    }

    function testCashSupportsMaximumBoundAndRejectsUnsupportedValues() public {
        assertEq(SettlementMath.cashOwed(type(uint128).max, SHARE_SCALE), type(uint128).max);

        vm.expectRevert(Errors.UnsupportedShareAmount.selector);
        harness.cashOwed(uint256(type(uint128).max) + 1, 1);

        vm.expectRevert(Errors.UnsupportedPrice.selector);
        harness.cashOwed(1, uint256(type(uint96).max) + 1);

        vm.expectRevert(Errors.UnsupportedCashAmount.selector);
        harness.cashOwed(type(uint128).max, type(uint96).max);
    }

    function testCashDeltaRejectsDecreasingCumulativeShares() public {
        vm.expectRevert(Errors.CumulativeSharesDecrease.selector);
        harness.cashDelta(2, 1, 1);
    }

    function testMinimumSharesForCashUsesCumulativeInverseAndPriorExercise() public pure {
        (uint256 additionalShares, uint256 chargedCash) =
            SettlementMath.minimumSharesForCash(SHARE_SCALE / 2, 2 * SHARE_SCALE, 1, 1);

        assertEq(additionalShares, SHARE_SCALE / 2 + 1);
        assertEq(chargedCash, 1);
        assertEq(SettlementMath.cashDelta(SHARE_SCALE / 2, SHARE_SCALE, 1), 0);
        assertEq(SettlementMath.cashDelta(SHARE_SCALE / 2, SHARE_SCALE + 1, 1), 1);
    }

    function testMinimumSharesForCashCapsToRemainingLotCapacity() public pure {
        (uint256 additionalShares, uint256 chargedCash) =
            SettlementMath.minimumSharesForCash(0, SHARE_SCALE, 100_000_000, 200_000_000);

        assertEq(additionalShares, SHARE_SCALE);
        assertEq(chargedCash, 100_000_000);
    }

    function testMinimumSharesForCashHandlesZeroTargetAndRejectsZeroStrike() public {
        (uint256 additionalShares, uint256 chargedCash) = SettlementMath.minimumSharesForCash(0, SHARE_SCALE, 1, 0);
        assertEq(additionalShares, 0);
        assertEq(chargedCash, 0);

        vm.expectRevert(Errors.ZeroStrike.selector);
        harness.minimumSharesForCash(0, SHARE_SCALE, 0, 1);
    }

    function testTriggerAndTargetEqualityAreNotUnsafe() public pure {
        uint256 collateral = 10 * SHARE_SCALE;
        uint256 price = 100_000_000;

        assertFalse(SettlementMath.isUnsafe(750_000_000, collateral, price, TRIGGER_LTV));
        assertTrue(SettlementMath.isUnsafe(750_000_001, collateral, price, TRIGGER_LTV));
        assertTrue(SettlementMath.isAtOrBelowTarget(650_000_000, collateral, price, TARGET_LTV));
        assertFalse(SettlementMath.isAtOrBelowTarget(650_000_001, collateral, price, TARGET_LTV));
    }

    function testZeroPriceWithDebtIsUnsafe() public pure {
        assertTrue(SettlementMath.isUnsafe(1, SHARE_SCALE, 0, TRIGGER_LTV));
        assertFalse(SettlementMath.isUnsafe(0, SHARE_SCALE, 0, TRIGGER_LTV));
    }

    function testSingleLotPlanFindsExactMinimumPostExerciseTarget() public pure {
        SettlementMath.LotState[] memory lots = new SettlementMath.LotState[](1);
        lots[0] = _lot(100_000_000, 10 * SHARE_SCALE, 0);

        SettlementMath.Plan memory plan =
            SettlementMath.planNormal(800_000_000, 10 * SHARE_SCALE, 100_000_000, TRIGGER_LTV, TARGET_LTV, lots);

        assertEq(uint8(plan.outcome), uint8(SettlementMath.Outcome.TARGET_REACHED));
        assertEq(plan.fillCount, 1);
        assertTrue(plan.fills[0].additionalShares > 0);
        assertEq(plan.fills[0].cashCharged, plan.fills[0].debtApplied);
        assertEq(plan.fills[0].borrowerExcess, 0);
        assertTrue(SettlementMath.isAtOrBelowTarget(plan.debtAfter, plan.collateralAfter, 100_000_000, TARGET_LTV));

        uint256 previousShares = plan.fills[0].additionalShares - 1;
        uint256 previousCash = SettlementMath.cashDelta(0, previousShares, 100_000_000);
        assertFalse(
            SettlementMath.isAtOrBelowTarget(
                800_000_000 - previousCash, 10 * SHARE_SCALE - previousShares, 100_000_000, TARGET_LTV
            )
        );
    }

    function testTargetSolverUsesFirstShareWeiOfCashPlateau() public pure {
        SettlementMath.LotState[] memory lots = new SettlementMath.LotState[](1);
        lots[0] = _lot(1, 2 * SHARE_SCALE, 0);

        SettlementMath.Plan memory plan = SettlementMath.planNormal(2, 5 * SHARE_SCALE / 2, 1, TRIGGER_LTV, 5_000, lots);

        assertEq(uint8(plan.outcome), uint8(SettlementMath.Outcome.TARGET_REACHED));
        assertEq(plan.fills[0].additionalShares, 1);
        assertEq(plan.fills[0].cashCharged, 1);
        assertTrue(SettlementMath.isAtOrBelowTarget(plan.debtAfter, plan.collateralAfter, 1, 5_000));
        assertFalse(SettlementMath.isAtOrBelowTarget(2, 5 * SHARE_SCALE / 2, 1, 5_000));
    }

    function testMultipleLotsContinueInStoredOrderUntilTarget() public pure {
        SettlementMath.LotState[] memory lots = new SettlementMath.LotState[](2);
        lots[0] = _lot(100_000_000, 2 * SHARE_SCALE, 0);
        lots[1] = _lot(100_000_000, 4 * SHARE_SCALE, 0);

        SettlementMath.Plan memory plan =
            SettlementMath.planNormal(800_000_000, 10 * SHARE_SCALE, 100_000_000, TRIGGER_LTV, TARGET_LTV, lots);

        assertEq(uint8(plan.outcome), uint8(SettlementMath.Outcome.TARGET_REACHED));
        assertEq(plan.fillCount, 2);
        assertEq(plan.fills[0].additionalShares, 1_999_999_990_000_000_001);
        assertEq(plan.fills[0].cashCharged, 200_000_000);
        assertTrue(plan.fills[1].additionalShares > 0);
        assertTrue(SettlementMath.isAtOrBelowTarget(plan.debtAfter, plan.collateralAfter, 100_000_000, TARGET_LTV));
    }

    function testMultiLotPlanDoesNotConsumeZeroCashTailOfPriorLot() public pure {
        SettlementMath.LotState[] memory lots = new SettlementMath.LotState[](2);
        lots[0] = _lot(1, 2 * SHARE_SCALE, 0);
        lots[1] = _lot(2, 2 * SHARE_SCALE, 0);

        SettlementMath.Plan memory plan = SettlementMath.planNormal(4, 4 * SHARE_SCALE, 1, TRIGGER_LTV, 5_000, lots);

        assertEq(uint8(plan.outcome), uint8(SettlementMath.Outcome.TARGET_REACHED));
        assertEq(plan.fillCount, 2);
        assertEq(plan.fills[0].cashCharged, 2);
        assertEq(plan.fills[0].additionalShares, SHARE_SCALE + 1);
        assertEq(SettlementMath.cashDelta(0, plan.fills[0].additionalShares - 1, 1), 1);
    }

    function testZeroCashLotDoesNotForceLaterFundedTargetIntoFullClosure() public pure {
        SettlementMath.LotState[] memory lots = new SettlementMath.LotState[](2);
        lots[0] = _lot(1, SHARE_SCALE, SHARE_SCALE / 2);
        lots[1] = _lot(6, SHARE_SCALE / 2, 0);

        SettlementMath.Plan memory plan = SettlementMath.planNormal(5, 2 * SHARE_SCALE, 3, TRIGGER_LTV, 5_000, lots);

        assertEq(uint8(plan.outcome), uint8(SettlementMath.Outcome.TARGET_REACHED));
        assertEq(plan.fillCount, 1);
        assertEq(plan.fills[0].additionalShares, 0);
        assertEq(plan.fills[0].cashCharged, 0);
        assertEq(plan.fills[1].additionalShares, 333_333_333_333_333_334);
        assertEq(plan.fills[1].cashCharged, 3);
        assertEq(plan.fills[1].debtApplied, 3);
        assertEq(plan.debtAfter, 2);
    }

    function testNonImprovingLotForcesFundedFullClosureInOrder() public pure {
        SettlementMath.LotState[] memory lots = new SettlementMath.LotState[](2);
        lots[0] = _lot(50_000_000, SHARE_SCALE, 0);
        lots[1] = _lot(100_000_000, 9 * SHARE_SCALE, 0);

        SettlementMath.Plan memory plan =
            SettlementMath.planNormal(800_000_000, 10 * SHARE_SCALE, 100_000_000, TRIGGER_LTV, TARGET_LTV, lots);

        assertEq(uint8(plan.outcome), uint8(SettlementMath.Outcome.FULL_CLOSURE));
        assertEq(plan.debtAfter, 0);
        assertEq(plan.fillCount, 2);
        assertEq(plan.fills[0].additionalShares, 999_999_980_000_000_001);
        assertEq(plan.fills[0].cashCharged, 50_000_000);
        assertEq(plan.fills[0].debtApplied, 50_000_000);
        assertEq(plan.fills[1].debtApplied, 750_000_000);
    }

    function testZeroBenchmarkForcesFundedFullClosure() public pure {
        SettlementMath.LotState[] memory lots = new SettlementMath.LotState[](1);
        lots[0] = _lot(100_000_000, 5 * SHARE_SCALE, 0);

        SettlementMath.Plan memory plan =
            SettlementMath.planNormal(500_000_000, 10 * SHARE_SCALE, 0, TRIGGER_LTV, TARGET_LTV, lots);

        assertEq(uint8(plan.outcome), uint8(SettlementMath.Outcome.FULL_CLOSURE));
        assertEq(plan.debtAfter, 0);
        assertEq(plan.fills[0].additionalShares, 4_999_999_990_000_000_001);
        assertEq(plan.fills[0].cashCharged, 500_000_000);
    }

    function testFullClosureClampsEachCashRequestToSupportedLotCapacity() public pure {
        uint256 maximum = type(uint128).max;
        SettlementMath.LotState[] memory lots = new SettlementMath.LotState[](2);
        lots[0] = _lot(SHARE_SCALE, maximum, maximum - 1);
        lots[1] = _lot(SHARE_SCALE, 1, 0);

        SettlementMath.Plan memory plan = SettlementMath.planNormal(2, 2, 0, TRIGGER_LTV, TARGET_LTV, lots);

        assertEq(uint8(plan.outcome), uint8(SettlementMath.Outcome.FULL_CLOSURE));
        assertEq(plan.fillCount, 2);
        assertEq(plan.fills[0].additionalShares, 1);
        assertEq(plan.fills[0].cashCharged, 1);
        assertEq(plan.fills[0].debtApplied, 1);
        assertEq(plan.fills[1].additionalShares, 1);
        assertEq(plan.fills[1].cashCharged, 1);
        assertEq(plan.fills[1].debtApplied, 1);
        assertEq(plan.debtAfter, 0);
        assertEq(plan.collateralAfter, 0);
    }

    function testDebtClearingFillCreditsOnlyLastFillExcess() public pure {
        SettlementMath.LotState[] memory lots = new SettlementMath.LotState[](1);
        lots[0] = _lot(2 * SHARE_SCALE, 1, 0);

        SettlementMath.Plan memory plan = SettlementMath.planNormal(1, 1, 0, TRIGGER_LTV, TARGET_LTV, lots);

        assertEq(uint8(plan.outcome), uint8(SettlementMath.Outcome.FULL_CLOSURE));
        assertEq(plan.fills[0].additionalShares, 1);
        assertEq(plan.fills[0].cashCharged, 2);
        assertEq(plan.fills[0].debtApplied, 1);
        assertEq(plan.fills[0].borrowerExcess, 1);
        assertEq(plan.borrowerExcess, 1);
    }

    function testPlanSupportsExactlyEightFills() public pure {
        SettlementMath.LotState[] memory lots = new SettlementMath.LotState[](8);
        for (uint256 i; i < lots.length; ++i) {
            lots[i] = _lot(100_000_000, SHARE_SCALE, 0);
        }

        SettlementMath.Plan memory plan =
            SettlementMath.planNormal(800_000_000, 8 * SHARE_SCALE, 0, TRIGGER_LTV, TARGET_LTV, lots);

        assertEq(uint8(plan.outcome), uint8(SettlementMath.Outcome.FULL_CLOSURE));
        assertEq(plan.fillCount, 8);
        assertEq(plan.debtAfter, 0);
    }

    function testPlanRejectsMoreThanEightLots() public {
        SettlementMath.LotState[] memory lots = new SettlementMath.LotState[](9);
        for (uint256 i; i < lots.length; ++i) {
            lots[i] = _lot(100_000_000, SHARE_SCALE, 0);
        }

        vm.expectRevert(abi.encodeWithSelector(Errors.TooManyFills.selector, uint256(9)));
        harness.planNormal(800_000_000, 9 * SHARE_SCALE, 0, TRIGGER_LTV, TARGET_LTV, lots);
    }

    function testPlanRejectsInsufficientFundedCapacity() public {
        SettlementMath.LotState[] memory lots = new SettlementMath.LotState[](1);
        lots[0] = _lot(100_000_000, 5 * SHARE_SCALE, 0);

        vm.expectRevert(abi.encodeWithSelector(Errors.InsufficientFundedCapacity.selector, 500_000_000, 500_000_001));
        harness.planNormal(500_000_001, 10 * SHARE_SCALE, 0, TRIGGER_LTV, TARGET_LTV, lots);
    }

    function testPlanRejectsUnsupportedDomainInputs() public {
        SettlementMath.LotState[] memory lots = new SettlementMath.LotState[](1);
        lots[0] = _lot(1, 1, 0);

        vm.expectRevert(Errors.UnsupportedCashAmount.selector);
        harness.planNormal(uint256(type(uint128).max) + 1, 1, 1, TRIGGER_LTV, TARGET_LTV, lots);

        vm.expectRevert(Errors.UnsupportedShareAmount.selector);
        harness.planNormal(1, uint256(type(uint128).max) + 1, 1, TRIGGER_LTV, TARGET_LTV, lots);

        vm.expectRevert(Errors.UnsupportedPrice.selector);
        harness.planNormal(1, 1, uint256(type(uint96).max) + 1, TRIGGER_LTV, TARGET_LTV, lots);
    }

    function testPlanReturnsHealthyNoOpAtTriggerBoundary() public pure {
        SettlementMath.LotState[] memory lots = new SettlementMath.LotState[](1);
        lots[0] = _lot(100_000_000, 10 * SHARE_SCALE, 0);

        SettlementMath.Plan memory plan =
            SettlementMath.planNormal(750_000_000, 10 * SHARE_SCALE, 100_000_000, TRIGGER_LTV, TARGET_LTV, lots);

        assertEq(uint8(plan.outcome), uint8(SettlementMath.Outcome.HEALTHY));
        assertEq(plan.fillCount, 0);
        assertEq(plan.debtAfter, 750_000_000);
        assertEq(plan.collateralAfter, 10 * SHARE_SCALE);
    }

    function _lot(uint256 strike, uint256 totalShares, uint256 exercisedShares)
        internal
        pure
        returns (SettlementMath.LotState memory)
    {
        return SettlementMath.LotState({strike: strike, totalShares: totalShares, exercisedShares: exercisedShares});
    }
}
