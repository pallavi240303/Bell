// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {SessionOracle} from "../SessionOracle.sol";
import {Types} from "../lib/Types.sol";
import {Errors} from "../lib/Errors.sol";
import {Events} from "../lib/Events.sol";

contract DemoReportAdapter {
    SessionOracle public immutable oracle;
    address public immutable trustedEoa;

    constructor(SessionOracle oracle_, address trustedEoa_) {
        if (address(oracle_) == address(0) || trustedEoa_ == address(0)) revert Errors.ZeroAddress();
        if (trustedEoa_.code.length != 0) revert Errors.InvalidDemoAuthority();
        oracle = oracle_;
        trustedEoa = trustedEoa_;
    }

    function submit(Types.MarketEventReport calldata report) external {
        if (msg.sender != trustedEoa || msg.sender != tx.origin) revert Errors.UnauthorizedReceiver(msg.sender);
        oracle.acceptReport(report);
        emit Events.ReceiverReportAccepted(keccak256(abi.encode(report)), bytes32(0), bytes10(0), msg.sender, 2);
    }
}
