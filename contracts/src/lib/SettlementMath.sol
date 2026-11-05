// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Errors} from "./Errors.sol";
import {FixedPointMath} from "./FixedPointMath.sol";
import {Types} from "./Types.sol";

library SettlementMath {
    uint256 internal constant SHARE_SCALE = 1e18;
    uint256 private constant MAX_CASH = type(uint128).max;
    uint256 private constant MAX_SHARES = type(uint128).max;
    uint256 private constant MAX_PRICE = type(uint96).max;

    enum Outcome {
        HEALTHY,
        TARGET_REACHED,
        FULL_CLOSURE
    }

    struct LotState {
        uint256 strike;
        uint256 totalShares;
        uint256 exercisedShares;
    }

    struct Fill {
        uint256 additionalShares;
        uint256 cashCharged;
        uint256 debtApplied;
        uint256 borrowerExcess;
    }

    struct Plan {
        Outcome outcome;
        Fill[] fills;
        uint8 fillCount;
        uint256 debtAfter;
        uint256 collateralAfter;
        uint256 borrowerExcess;
    }

    struct PlanInput {
        uint256 debtAmount;
        uint256 collateralShares;
        uint256 benchmarkPrice;
        uint16 triggerLtvBps;
        uint16 targetLtvBps;
    }

    struct TargetInput {
        uint256 debtAmount;
        uint256 collateralShares;
        uint256 benchmarkPrice;
        uint16 targetLtvBps;
        LotState lot;
        uint256 remainingLotShares;
    }

    function cashOwed(uint256 cumulativeShares, uint256 strike) internal pure returns (uint256 cash) {
        _validateShares(cumulativeShares);
        _validatePrice(strike);
        cash = FixedPointMath.mulDivUp(cumulativeShares, strike, SHARE_SCALE);
        _validateCash(cash);
    }

    function cashDelta(uint256 oldCumulativeShares, uint256 newCumulativeShares, uint256 strike)
        internal
        pure
        returns (uint256)
    {
        if (newCumulativeShares < oldCumulativeShares) revert Errors.CumulativeSharesDecrease();
        return cashOwed(newCumulativeShares, strike) - cashOwed(oldCumulativeShares, strike);
    }

    function minimumSharesForCash(uint256 oldCumulativeShares, uint256 lotShares, uint256 strike, uint256 targetCash)
        internal
        pure
        returns (uint256 additionalShares, uint256 chargedCash)
    {
        _validateShares(oldCumulativeShares);
        _validateShares(lotShares);
        _validateCash(targetCash);
        _validatePrice(strike);
        if (strike == 0) revert Errors.ZeroStrike();
        if (oldCumulativeShares > lotShares) revert Errors.InvalidLotShares();
        if (targetCash == 0 || oldCumulativeShares == lotShares) return (0, 0);

        uint256 oldCash = cashOwed(oldCumulativeShares, strike);
        uint256 desiredCumulativeCash = oldCash + targetCash;
        _validateCash(desiredCumulativeCash);

        uint256 minimumCumulativeShares = FixedPointMath.mulDivDown(desiredCumulativeCash - 1, SHARE_SCALE, strike) + 1;
        if (minimumCumulativeShares > lotShares) minimumCumulativeShares = lotShares;
        if (minimumCumulativeShares <= oldCumulativeShares) return (0, 0);

        additionalShares = minimumCumulativeShares - oldCumulativeShares;
        chargedCash = cashDelta(oldCumulativeShares, minimumCumulativeShares, strike);
    }

    function isUnsafe(uint256 debtAmount, uint256 collateralShares, uint256 benchmarkPrice, uint16 triggerLtvBps)
        internal
        pure
        returns (bool)
    {
        _validatePosition(debtAmount, collateralShares, benchmarkPrice);
        if (triggerLtvBps > Types.BPS) revert Errors.InvalidSettlementLtv();
        uint256 debtSide = debtAmount * uint256(Types.BPS) * SHARE_SCALE;
        uint256 collateralSide = collateralShares * benchmarkPrice * uint256(triggerLtvBps);
        return debtSide > collateralSide;
    }

    function isAtOrBelowTarget(
        uint256 debtAmount,
        uint256 collateralShares,
        uint256 benchmarkPrice,
        uint16 targetLtvBps
    ) internal pure returns (bool) {
        _validatePosition(debtAmount, collateralShares, benchmarkPrice);
        if (targetLtvBps > Types.BPS) revert Errors.InvalidSettlementLtv();
        uint256 debtSide = debtAmount * uint256(Types.BPS) * SHARE_SCALE;
        uint256 collateralSide = collateralShares * benchmarkPrice * uint256(targetLtvBps);
        return debtSide <= collateralSide;
    }

    function planNormal(
        uint256 debtAmount,
        uint256 collateralShares,
        uint256 benchmarkPrice,
        uint16 triggerLtvBps,
        uint16 targetLtvBps,
        LotState[] memory lots
    ) internal pure returns (Plan memory plan) {
        return _planNormal(
            PlanInput({
                debtAmount: debtAmount,
                collateralShares: collateralShares,
                benchmarkPrice: benchmarkPrice,
                triggerLtvBps: triggerLtvBps,
                targetLtvBps: targetLtvBps
            }),
            lots
        );
    }

    function _planNormal(PlanInput memory input, LotState[] memory lots) private pure returns (Plan memory plan) {
        _validatePosition(input.debtAmount, input.collateralShares, input.benchmarkPrice);
        if (input.targetLtvBps == 0 || input.targetLtvBps >= input.triggerLtvBps || input.triggerLtvBps > Types.BPS) {
            revert Errors.InvalidSettlementLtv();
        }
        if (lots.length > Types.REQUIRED_MAX_FILLS) revert Errors.TooManyFills(lots.length);
        _validateLots(lots);

        plan.fills = new Fill[](lots.length);
        plan.debtAfter = input.debtAmount;
        plan.collateralAfter = input.collateralShares;

        if (!isUnsafe(input.debtAmount, input.collateralShares, input.benchmarkPrice, input.triggerLtvBps)) {
            plan.outcome = Outcome.HEALTHY;
            return plan;
        }

        uint256 originalDebt = input.debtAmount;
        bool forceFullClosure = input.benchmarkPrice == 0;

        for (uint256 i; i < lots.length && plan.debtAfter != 0; ++i) {
            LotState memory lot = lots[i];
            uint256 remainingLotShares = lot.totalShares - lot.exercisedShares;
            if (remainingLotShares == 0 || plan.collateralAfter == 0) continue;
            if (remainingLotShares > plan.collateralAfter) remainingLotShares = plan.collateralAfter;

            uint256 additionalShares;
            uint256 chargedCash;

            if (!forceFullClosure) {
                if (!_isImprovingLot(lot.strike, input.benchmarkPrice, input.targetLtvBps)) {
                    forceFullClosure = true;
                } else {
                    TargetInput memory targetInput;
                    targetInput.debtAmount = plan.debtAfter;
                    targetInput.collateralShares = plan.collateralAfter;
                    targetInput.benchmarkPrice = input.benchmarkPrice;
                    targetInput.targetLtvBps = input.targetLtvBps;
                    targetInput.lot = lot;
                    targetInput.remainingLotShares = remainingLotShares;
                    (bool found, uint256 targetShares, uint256 targetCash) = _findTargetInLot(targetInput);
                    if (found) {
                        _applyFill(plan, i, targetShares, targetCash);
                        plan.outcome = plan.debtAfter == 0 ? Outcome.FULL_CLOSURE : Outcome.TARGET_REACHED;
                        return plan;
                    }
                }
            }

            if (forceFullClosure) {
                (additionalShares, chargedCash) = minimumSharesForCash(
                    lot.exercisedShares, lot.exercisedShares + remainingLotShares, lot.strike, plan.debtAfter
                );
            } else {
                uint256 cappedLotShares = lot.exercisedShares + remainingLotShares;
                uint256 capacityCash = cashDelta(lot.exercisedShares, cappedLotShares, lot.strike);
                (additionalShares, chargedCash) =
                    minimumSharesForCash(lot.exercisedShares, cappedLotShares, lot.strike, capacityCash);
            }

            if (additionalShares == 0 || chargedCash == 0) continue;
            _applyFill(plan, i, additionalShares, chargedCash);

            if (plan.debtAfter == 0) {
                plan.outcome = Outcome.FULL_CLOSURE;
                return plan;
            }
            if (
                !forceFullClosure
                    && isAtOrBelowTarget(plan.debtAfter, plan.collateralAfter, input.benchmarkPrice, input.targetLtvBps)
            ) {
                plan.outcome = Outcome.TARGET_REACHED;
                return plan;
            }
        }

        revert Errors.InsufficientFundedCapacity(originalDebt - plan.debtAfter, originalDebt);
    }

    function _findTargetInLot(TargetInput memory input)
        private
        pure
        returns (bool found, uint256 additionalShares, uint256 chargedCash)
    {
        uint256 cappedLotShares = input.lot.exercisedShares + input.remainingLotShares;
        uint256 capacityCash = cashDelta(input.lot.exercisedShares, cappedLotShares, input.lot.strike);
        uint256 maximumTargetCash = capacityCash < input.debtAmount ? capacityCash : input.debtAmount;
        if (maximumTargetCash == 0) return (false, 0, 0);

        (bool maximumSatisfied,,) = _targetAtCash(input, cappedLotShares, maximumTargetCash);
        if (!maximumSatisfied) return (false, 0, 0);

        uint256 low = 1;
        uint256 high = maximumTargetCash;
        while (low < high) {
            uint256 middle = low + (high - low) / 2;
            (bool satisfied,,) = _targetAtCash(input, cappedLotShares, middle);
            if (satisfied) {
                high = middle;
            } else {
                low = middle + 1;
            }
        }

        (additionalShares, chargedCash) =
            minimumSharesForCash(input.lot.exercisedShares, cappedLotShares, input.lot.strike, low);
        return (true, additionalShares, chargedCash);
    }

    function _targetAtCash(TargetInput memory input, uint256 cappedLotShares, uint256 requestedCash)
        private
        pure
        returns (bool satisfied, uint256 additionalShares, uint256 chargedCash)
    {
        (additionalShares, chargedCash) =
            minimumSharesForCash(input.lot.exercisedShares, cappedLotShares, input.lot.strike, requestedCash);
        uint256 applied = chargedCash < input.debtAmount ? chargedCash : input.debtAmount;
        satisfied = isAtOrBelowTarget(
            input.debtAmount - applied,
            input.collateralShares - additionalShares,
            input.benchmarkPrice,
            input.targetLtvBps
        );
    }

    function _isImprovingLot(uint256 strike, uint256 benchmarkPrice, uint16 targetLtvBps) private pure returns (bool) {
        uint256 sharesPerCashUnit = FixedPointMath.mulDivUp(SHARE_SCALE, 1, strike);
        uint256 costOfOneCashUnit = sharesPerCashUnit * benchmarkPrice * uint256(targetLtvBps);
        return costOfOneCashUnit <= uint256(Types.BPS) * SHARE_SCALE;
    }

    function _applyFill(Plan memory plan, uint256 lotIndex, uint256 additionalShares, uint256 chargedCash)
        private
        pure
    {
        uint256 debtApplied = chargedCash < plan.debtAfter ? chargedCash : plan.debtAfter;
        uint256 excess = chargedCash - debtApplied;
        plan.fills[lotIndex] = Fill({
            additionalShares: additionalShares,
            cashCharged: chargedCash,
            debtApplied: debtApplied,
            borrowerExcess: excess
        });
        plan.fillCount += 1;
        plan.debtAfter -= debtApplied;
        plan.collateralAfter -= additionalShares;
        plan.borrowerExcess += excess;
    }

    function _validateLots(LotState[] memory lots) private pure {
        for (uint256 i; i < lots.length; ++i) {
            _validatePrice(lots[i].strike);
            if (lots[i].strike == 0) revert Errors.ZeroStrike();
            _validateShares(lots[i].totalShares);
            _validateShares(lots[i].exercisedShares);
            if (lots[i].exercisedShares > lots[i].totalShares) revert Errors.InvalidLotShares();
            cashOwed(lots[i].totalShares, lots[i].strike);
        }
    }

    function _validatePosition(uint256 debtAmount, uint256 collateralShares, uint256 benchmarkPrice) private pure {
        _validateCash(debtAmount);
        _validateShares(collateralShares);
        _validatePrice(benchmarkPrice);
    }

    function _validateCash(uint256 amount) private pure {
        if (amount > MAX_CASH) revert Errors.UnsupportedCashAmount();
    }

    function _validateShares(uint256 amount) private pure {
        if (amount > MAX_SHARES) revert Errors.UnsupportedShareAmount();
    }

    function _validatePrice(uint256 price) private pure {
        if (price > MAX_PRICE) revert Errors.UnsupportedPrice();
    }
}
