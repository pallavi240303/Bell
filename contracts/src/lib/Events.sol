// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Types} from "./Types.sol";

library Events {
    event ReceiverReportAccepted(
        bytes32 indexed reportHash, bytes32 workflowId, bytes10 workflowName, address workflowOwner, uint8 mode
    );
    event AssetConfigScheduled(bytes32 indexed assetId, uint64 indexed version, uint64 effectiveAt, bytes32 configHash);
    event ReceiverBound(address indexed receiver);
    event MarketEventAccepted(
        bytes32 indexed assetId,
        bytes32 indexed sessionId,
        Types.MarketEventKind indexed kind,
        uint64 nonce,
        bytes32 reportHash,
        bytes32 newStateHash
    );

    bytes32 internal constant ASSET_CONFIG_SCHEDULED_TOPIC =
        keccak256("AssetConfigScheduled(bytes32,uint64,uint64,bytes32)");
    bytes32 internal constant MARKET_EVENT_ACCEPTED_TOPIC =
        keccak256("MarketEventAccepted(bytes32,bytes32,uint8,uint64,bytes32,bytes32)");
}
