// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {LoanVault} from "../../src/LoanVault.sol";

// Exposes the production inspection helper with synthetic terms, never monetary admission.
contract ConversionInspectionHarness is LoanVault {
    DebtTerms private syntheticTerms;
    constructor() LoanVault(msg.sender) {}

    function inspect(uint256 amount, uint128 snapN, uint128 snapD, uint128 reportN, uint128 reportD)
        external
        returns (uint256)
    {
        syntheticTerms.snapshotMultiplierNumerator = snapN;
        syntheticTerms.snapshotMultiplierDenominator = snapD;
        return _convertedUnits(syntheticTerms, amount, reportN, reportD);
    }
}
