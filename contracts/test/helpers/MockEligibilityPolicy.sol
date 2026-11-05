// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IEligibilityPolicy} from "../../src/interfaces/IEligibilityPolicy.sol";

contract MockEligibilityPolicy is IEligibilityPolicy {
    mapping(bytes32 key => bool allowed) private _eligible;

    function setEligible(bytes32 assetId, address account, bytes32 policyHash, bool allowed) external {
        _eligible[keccak256(abi.encode(assetId, account, policyHash))] = allowed;
    }

    function isEligible(bytes32 assetId, address account, bytes32 policyHash) external view returns (bool) {
        return _eligible[keccak256(abi.encode(assetId, account, policyHash))];
    }
}
