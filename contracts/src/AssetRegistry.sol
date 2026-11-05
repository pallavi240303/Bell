// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Errors} from "./lib/Errors.sol";
import {Events} from "./lib/Events.sol";
import {Types} from "./lib/Types.sol";

contract AssetRegistry {
    address public immutable owner;

    mapping(bytes32 assetId => uint64 version) public latestVersion;
    mapping(bytes32 assetId => mapping(uint64 version => Types.AssetConfigRecord record)) private _configs;

    constructor(address owner_) {
        if (owner_ == address(0)) revert Errors.ZeroAddress();
        owner = owner_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Errors.Unauthorized(msg.sender);
        _;
    }

    function scheduleAssetConfig(bytes32 assetId, Types.AssetConfig calldata config, uint64 effectiveAt)
        external
        onlyOwner
        returns (uint64 version)
    {
        if (assetId == bytes32(0)) revert Errors.ZeroAssetId();
        _validateConfig(config);

        uint64 previousVersion = latestVersion[assetId];
        if (
            // forge-lint: disable-next-line(block-timestamp)
            effectiveAt <= block.timestamp
                || (previousVersion != 0 && effectiveAt <= _configs[assetId][previousVersion].effectiveAt)
        ) {
            revert Errors.InvalidEffectiveTime(effectiveAt);
        }

        version = previousVersion + 1;
        bytes32 identity = keccak256(abi.encode(assetId, version, effectiveAt, config));
        _configs[assetId][version] =
            Types.AssetConfigRecord({config: config, effectiveAt: effectiveAt, configHash: identity});
        latestVersion[assetId] = version;

        emit Events.AssetConfigScheduled(assetId, version, effectiveAt, identity);
    }

    function getConfig(bytes32 assetId, uint64 version)
        external
        view
        returns (Types.AssetConfig memory config, uint64 effectiveAt, bytes32 identity)
    {
        Types.AssetConfigRecord storage record = _configs[assetId][version];
        if (record.configHash == bytes32(0)) revert Errors.UnknownConfig(assetId, version);
        return (record.config, record.effectiveAt, record.configHash);
    }

    function configHash(bytes32 assetId, uint64 version) external view returns (bytes32) {
        bytes32 identity = _configs[assetId][version].configHash;
        if (identity == bytes32(0)) revert Errors.UnknownConfig(assetId, version);
        return identity;
    }

    function _validateConfig(Types.AssetConfig calldata config) private pure {
        if (config.assetToken == address(0)) revert Errors.ZeroAddress();
        if (config.cashTokenDecimals != 6 || config.stockTokenDecimals == 0 || config.stockTokenDecimals > 18) {
            revert Errors.InvalidDecimals(config.stockTokenDecimals, config.cashTokenDecimals);
        }
        if (
            config.originationLtvBps >= config.targetLtvBps || config.targetLtvBps >= config.triggerLtvBps
                || config.triggerLtvBps > Types.BPS
        ) {
            revert Errors.InvalidLtvOrder(config.originationLtvBps, config.targetLtvBps, config.triggerLtvBps);
        }
        if (config.rateNumerator == 0 || config.rateNumerator > Types.BPS || config.rateDenominator == 0) {
            revert Errors.InvalidRate(config.rateNumerator, config.rateDenominator);
        }
        if (config.maxFills != Types.REQUIRED_MAX_FILLS) {
            revert Errors.InvalidMaxFills(config.maxFills);
        }
        if (config.maxActiveReceipts != Types.REQUIRED_MAX_ACTIVE_RECEIPTS) {
            revert Errors.InvalidMaxActiveReceipts(config.maxActiveReceipts);
        }

        if ((config.supportedCorporateActions & ~Types.SUPPORTED_CORPORATE_ACTIONS) != 0) {
            revert Errors.UnsupportedCorporateActions(config.supportedCorporateActions);
        }
    }
}
