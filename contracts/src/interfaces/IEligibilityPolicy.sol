// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IEligibilityPolicy {
    function isEligible(bytes32 assetId, address account, bytes32 policyHash) external view returns (bool);
}
