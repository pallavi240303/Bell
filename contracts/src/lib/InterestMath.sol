// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Errors} from "./Errors.sol";
import {FixedPointMath} from "./FixedPointMath.sol";
import {Types} from "./Types.sol";

library InterestMath {
    uint256 private constant MAX_CASH = type(uint128).max;

    function elapsed(uint64 startTime, uint64 settlementDeadline, uint64 timestamp) internal pure returns (uint64) {
        if (settlementDeadline < startTime) revert Errors.InvalidTimeRange();
        if (timestamp <= startTime) return 0;
        uint64 capped = timestamp < settlementDeadline ? timestamp : settlementDeadline;
        return capped - startTime;
    }

    function interest(uint256 originalPrincipal, uint32 rateNumerator, uint64 elapsedSeconds, uint256 rateDenominator)
        internal
        pure
        returns (uint256 accrued)
    {
        _validateCash(originalPrincipal);
        if (rateNumerator > Types.BPS) revert Errors.UnsupportedRate();
        if (rateDenominator == 0) revert Errors.ZeroDenominator();
        if (originalPrincipal == 0 || rateNumerator == 0 || elapsedSeconds == 0) return 0;

        uint256 timeWeightedRate = uint256(rateNumerator) * uint256(elapsedSeconds);
        accrued = FixedPointMath.mulDivUp(originalPrincipal, timeWeightedRate, rateDenominator);
        _validateCash(accrued);
    }

    function debt(
        uint256 originalPrincipal,
        uint32 rateNumerator,
        uint64 startTime,
        uint64 settlementDeadline,
        uint64 timestamp,
        uint256 rateDenominator,
        uint256 cumulativeDebtReduction
    ) internal pure returns (uint256) {
        _validateCash(originalPrincipal);
        _validateCash(cumulativeDebtReduction);
        uint256 accrued = interest(
            originalPrincipal, rateNumerator, elapsed(startTime, settlementDeadline, timestamp), rateDenominator
        );
        uint256 gross = originalPrincipal + accrued;
        _validateCash(gross);
        return cumulativeDebtReduction >= gross ? 0 : gross - cumulativeDebtReduction;
    }

    /// @notice Original-principal simple interest without the settlement cash-domain limit.
    /// @dev The numerator is below 2^206 for the supported principal/rate/time domain.
    function interestWide(
        uint256 originalPrincipal,
        uint32 rateNumerator,
        uint64 elapsedSeconds,
        uint256 rateDenominator
    ) internal pure returns (uint256) {
        _validateCash(originalPrincipal);
        if (rateNumerator > Types.BPS) revert Errors.UnsupportedRate();
        if (rateDenominator == 0) revert Errors.ZeroDenominator();
        return FixedPointMath.mulDivUp(originalPrincipal, uint256(rateNumerator) * elapsedSeconds, rateDenominator);
    }

    function debtWide(
        uint256 originalPrincipal,
        uint32 rateNumerator,
        uint64 startTime,
        uint64 timestamp,
        uint256 rateDenominator,
        uint256 cumulativeDebtReduction
    ) internal pure returns (uint256) {
        if (timestamp < startTime) revert Errors.InvalidTimeRange();
        uint256 gross =
            originalPrincipal + interestWide(originalPrincipal, rateNumerator, timestamp - startTime, rateDenominator);
        return cumulativeDebtReduction >= gross ? 0 : gross - cumulativeDebtReduction;
    }

    function _validateCash(uint256 amount) private pure {
        if (amount > MAX_CASH) revert Errors.UnsupportedCashAmount();
    }
}
