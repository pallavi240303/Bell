// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Errors} from "./Errors.sol";

library FixedPointMath {
    function mulDivDown(uint256 x, uint256 y, uint256 denominator) internal pure returns (uint256 result) {
        if (denominator == 0) revert Errors.ZeroDenominator();

        unchecked {
            uint256 productLow;
            uint256 productHigh;
            assembly ("memory-safe") {
                let remainder := mulmod(x, y, not(0))
                productLow := mul(x, y)
                productHigh := sub(sub(remainder, productLow), lt(remainder, productLow))
            }

            if (productHigh == 0) return productLow / denominator;
            if (denominator <= productHigh) revert Errors.MathResultOverflow();

            uint256 remainder;
            assembly ("memory-safe") {
                remainder := mulmod(x, y, denominator)
                productHigh := sub(productHigh, gt(remainder, productLow))
                productLow := sub(productLow, remainder)
            }

            uint256 powerOfTwo = denominator & (0 - denominator);
            assembly ("memory-safe") {
                denominator := div(denominator, powerOfTwo)
                productLow := div(productLow, powerOfTwo)
                powerOfTwo := add(div(sub(0, powerOfTwo), powerOfTwo), 1)
            }

            productLow |= productHigh * powerOfTwo;

            uint256 inverse = (3 * denominator) ^ 2;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;

            result = productLow * inverse;
        }
    }

    function mulDivUp(uint256 x, uint256 y, uint256 denominator) internal pure returns (uint256 result) {
        result = mulDivDown(x, y, denominator);
        if (mulmod(x, y, denominator) == 0) return result;
        if (result == type(uint256).max) revert Errors.MathResultOverflow();
        unchecked {
            return result + 1;
        }
    }
}
