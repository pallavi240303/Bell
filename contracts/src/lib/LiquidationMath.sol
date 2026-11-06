// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {FixedPointMath} from "./FixedPointMath.sol";
import {Errors} from "./Errors.sol";

/// @notice Existing 550-bps liquidation policy, with wide debt and an early insolvency branch.
library LiquidationMath {
    struct Result {
        uint256 repaid;
        uint256 shares;
        uint256 badDebt;
    }
    error HealthyLoan();
    error UnsupportedLiquidationTarget();

    function debtLimit(uint256 shares, uint256 price, uint16 ltv) internal pure returns (uint256) {
        if (shares > type(uint128).max) revert Errors.UnsupportedShareAmount();
        return FixedPointMath.mulDivDown(shares * ltv, price, 10000 * 1e18);
    }

    function plan(uint256 debt, uint256 shares, uint256 price, uint16 trigger, uint16 target)
        internal
        pure
        returns (Result memory result)
    {
        if (debt <= debtLimit(shares, price, trigger)) revert HealthyLoan();
        if (uint256(target) * 10550 >= 1e8) revert UnsupportedLiquidationTarget();
        uint256 value = FixedPointMath.mulDivDown(shares, price, 1e18);
        uint256 targetDebt = FixedPointMath.mulDivDown(value, target, 10000);
        uint256 repayment = FixedPointMath.mulDivUp(debt - targetDebt, 1e8, 1e8 - uint256(target) * 10550);
        if (repayment > debt) repayment = debt;
        uint256 allThreshold = FixedPointMath.mulDivUp(shares * 10000, price, 10550 * 1e18);
        if (repayment >= allThreshold) {
            result.repaid = FixedPointMath.mulDivDown(value, 10000, 10550);
            result.shares = shares;
            result.badDebt = debt - result.repaid;
        } else {
            if (price > type(uint256).max / 10000) revert Errors.UnsupportedPrice();
            result.repaid = repayment;
            result.shares = FixedPointMath.mulDivDown(repayment, 10550 * 1e18, 10000 * price);
        }
    }
}
