// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {SessionOracle} from "../SessionOracle.sol";
import {IReceiver} from "../interfaces/IReceiver.sol";
import {Types} from "../lib/Types.sol";
import {Errors} from "../lib/Errors.sol";
import {Events} from "../lib/Events.sol";

contract SimulationMarketEventReceiver is IReceiver {
    SessionOracle public immutable oracle;
    address public immutable forwarder;

    constructor(SessionOracle oracle_, address forwarder_) {
        if (address(oracle_) == address(0) || forwarder_ == address(0)) revert Errors.ZeroAddress();
        oracle = oracle_;
        forwarder = forwarder_;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == 0x01ffc9a7;
    }

    function onReport(bytes calldata metadata, bytes calldata report) external {
        if (msg.sender != forwarder) revert Errors.UnauthorizedReceiver(msg.sender);
        if (metadata.length != 0 && metadata.length != 62 && metadata.length != 64) {
            revert Errors.InvalidMetadataLength(metadata.length);
        }
        bytes32 id;
        bytes10 name;
        address owner;
        if (metadata.length != 0) {
            id = bytes32(metadata[0:32]);
            name = bytes10(metadata[32:42]);
            owner = address(bytes20(metadata[42:62]));
            // Current CRE metadata appends a two-byte report ID after the identity.
        }
        if (report.length != 21 * 32) revert Errors.InvalidReportLength(report.length);
        Types.MarketEventReport memory decoded = abi.decode(report, (Types.MarketEventReport));
        oracle.acceptReport(decoded);
        emit Events.ReceiverReportAccepted(keccak256(report), id, name, owner, 1);
    }
}
