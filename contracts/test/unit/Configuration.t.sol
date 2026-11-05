// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, Vm} from "forge-std/Test.sol";

import {AssetRegistry} from "../../src/AssetRegistry.sol";
import {Errors} from "../../src/lib/Errors.sol";
import {Events} from "../../src/lib/Events.sol";
import {Types} from "../../src/lib/Types.sol";

contract ConfigurationTest is Test {
    bytes32 internal constant ASSET_ID = keccak256("BELL_STOCK");
    address internal constant ASSET_TOKEN = address(0xA551);
    address internal constant ATTACKER = address(0xBAD);

    AssetRegistry internal registry;

    function setUp() public {
        vm.warp(100_000);
        registry = new AssetRegistry(address(this));
    }

    function testSchedulesDefaultConfigurationAndKeepsStableIdentity() public {
        Types.AssetConfig memory config = _defaultConfig();
        uint64 effectiveAt = uint64(block.timestamp + 100);

        uint64 version = registry.scheduleAssetConfig(ASSET_ID, config, effectiveAt);
        assertEq(version, 1);
        assertEq(registry.latestVersion(ASSET_ID), 1);

        (Types.AssetConfig memory stored, uint64 storedEffectiveAt, bytes32 storedHash) =
            registry.getConfig(ASSET_ID, version);
        _assertConfigEq(stored, config);
        assertEq(storedEffectiveAt, effectiveAt);
        assertTrue(storedHash != bytes32(0));
        assertEq(registry.configHash(ASSET_ID, version), storedHash);
    }

    function testNewVersionCannotMutateSnapshottedVersion() public {
        Types.AssetConfig memory first = _defaultConfig();
        uint64 firstEffectiveAt = uint64(block.timestamp + 100);
        uint64 firstVersion = registry.scheduleAssetConfig(ASSET_ID, first, firstEffectiveAt);
        bytes32 firstHash = registry.configHash(ASSET_ID, firstVersion);

        Types.AssetConfig memory second = _defaultConfig();
        second.rateNumerator = 900;
        uint64 secondVersion = registry.scheduleAssetConfig(ASSET_ID, second, uint64(block.timestamp + 200));

        assertEq(secondVersion, 2);
        (Types.AssetConfig memory stillFirst, uint64 stillFirstEffectiveAt, bytes32 stillFirstHash) =
            registry.getConfig(ASSET_ID, firstVersion);
        _assertConfigEq(stillFirst, first);
        assertEq(stillFirstEffectiveAt, firstEffectiveAt);
        assertEq(stillFirstHash, firstHash);
        assertTrue(registry.configHash(ASSET_ID, secondVersion) != firstHash);
    }

    function testScheduleEmitsVersionAndHashEvidence() public {
        vm.recordLogs();
        registry.scheduleAssetConfig(ASSET_ID, _defaultConfig(), uint64(block.timestamp + 100));
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 1);
        assertEq(logs[0].emitter, address(registry));
        assertEq(logs[0].topics[0], Events.ASSET_CONFIG_SCHEDULED_TOPIC);
        assertEq(logs[0].topics[1], ASSET_ID);
        assertEq(uint256(logs[0].topics[2]), 1);
        (, bytes32 emittedHash) = abi.decode(logs[0].data, (uint64, bytes32));
        assertEq(emittedHash, registry.configHash(ASSET_ID, 1));
    }

    function testOnlyOwnerCanSchedule() public {
        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Errors.Unauthorized.selector, ATTACKER));
        registry.scheduleAssetConfig(ASSET_ID, _defaultConfig(), uint64(block.timestamp + 100));
    }

    function testRejectsZeroAssetIdAndToken() public {
        vm.expectRevert(Errors.ZeroAssetId.selector);
        registry.scheduleAssetConfig(bytes32(0), _defaultConfig(), uint64(block.timestamp + 100));

        Types.AssetConfig memory config = _defaultConfig();
        config.assetToken = address(0);
        vm.expectRevert(Errors.ZeroAddress.selector);
        registry.scheduleAssetConfig(ASSET_ID, config, uint64(block.timestamp + 100));
    }

    function testRejectsPresentOrNonIncreasingEffectiveTime() public {
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidEffectiveTime.selector, uint64(block.timestamp)));
        registry.scheduleAssetConfig(ASSET_ID, _defaultConfig(), uint64(block.timestamp));

        registry.scheduleAssetConfig(ASSET_ID, _defaultConfig(), uint64(block.timestamp + 200));
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidEffectiveTime.selector, uint64(block.timestamp + 150)));
        registry.scheduleAssetConfig(ASSET_ID, _defaultConfig(), uint64(block.timestamp + 150));
    }

    function testRejectsInvalidDecimals() public {
        Types.AssetConfig memory config = _defaultConfig();
        config.cashTokenDecimals = 5;
        _expectInvalidDecimals(config);

        config = _defaultConfig();
        config.cashTokenDecimals = 7;
        _expectInvalidDecimals(config);

        config = _defaultConfig();
        config.stockTokenDecimals = 0;
        _expectInvalidDecimals(config);

        config = _defaultConfig();
        config.stockTokenDecimals = 19;
        _expectInvalidDecimals(config);
    }

    function testRejectsInvalidLtvOrderingAndRange() public {
        Types.AssetConfig memory config = _defaultConfig();
        config.originationLtvBps = config.targetLtvBps;
        _expectInvalidLtv(config);

        config = _defaultConfig();
        config.targetLtvBps = config.triggerLtvBps;
        _expectInvalidLtv(config);

        config = _defaultConfig();
        config.triggerLtvBps = 10_001;
        _expectInvalidLtv(config);
    }

    function testRejectsInvalidRate() public {
        Types.AssetConfig memory config = _defaultConfig();
        config.rateNumerator = 0;
        _expectInvalidRate(config);

        config = _defaultConfig();
        config.rateNumerator = 10_001;
        _expectInvalidRate(config);

        config = _defaultConfig();
        config.rateDenominator = 0;
        _expectInvalidRate(config);
    }

    function testRejectsWrongProtocolBounds() public {
        Types.AssetConfig memory config = _defaultConfig();
        config.maxFills = 7;
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidMaxFills.selector, uint8(7)));
        registry.scheduleAssetConfig(ASSET_ID, config, uint64(block.timestamp + 100));

        config = _defaultConfig();
        config.maxActiveReceipts = 31;
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidMaxActiveReceipts.selector, uint8(31)));
        registry.scheduleAssetConfig(ASSET_ID, config, uint64(block.timestamp + 100));
    }

    function testRejectsUnsupportedCorporateActions() public {
        Types.AssetConfig memory config = _defaultConfig();
        config.supportedCorporateActions |= Types.CASH_DIVIDEND_ACTION_MASK;

        vm.expectRevert(
            abi.encodeWithSelector(Errors.UnsupportedCorporateActions.selector, config.supportedCorporateActions)
        );
        registry.scheduleAssetConfig(ASSET_ID, config, uint64(block.timestamp + 100));
    }

    function _defaultConfig() internal pure returns (Types.AssetConfig memory config) {
        config = Types.AssetConfig({
            assetToken: ASSET_TOKEN,
            stockTokenDecimals: 18,
            cashTokenDecimals: 6,
            originationLtvBps: 6_000,
            targetLtvBps: 6_500,
            triggerLtvBps: 7_500,
            rateNumerator: 800,
            rateDenominator: 315_360_000_000,
            maxFills: 8,
            maxActiveReceipts: 32,
            supportedCorporateActions: Types.SUPPORTED_CORPORATE_ACTIONS
        });
    }

    function _expectInvalidDecimals(Types.AssetConfig memory config) internal {
        vm.expectRevert(
            abi.encodeWithSelector(Errors.InvalidDecimals.selector, config.stockTokenDecimals, config.cashTokenDecimals)
        );
        registry.scheduleAssetConfig(ASSET_ID, config, uint64(block.timestamp + 100));
    }

    function _expectInvalidLtv(Types.AssetConfig memory config) internal {
        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InvalidLtvOrder.selector, config.originationLtvBps, config.targetLtvBps, config.triggerLtvBps
            )
        );
        registry.scheduleAssetConfig(ASSET_ID, config, uint64(block.timestamp + 100));
    }

    function _expectInvalidRate(Types.AssetConfig memory config) internal {
        vm.expectRevert(
            abi.encodeWithSelector(Errors.InvalidRate.selector, config.rateNumerator, config.rateDenominator)
        );
        registry.scheduleAssetConfig(ASSET_ID, config, uint64(block.timestamp + 100));
    }

    function _assertConfigEq(Types.AssetConfig memory actual, Types.AssetConfig memory expected) internal pure {
        assertEq(actual.assetToken, expected.assetToken);
        assertEq(actual.stockTokenDecimals, expected.stockTokenDecimals);
        assertEq(actual.cashTokenDecimals, expected.cashTokenDecimals);
        assertEq(actual.originationLtvBps, expected.originationLtvBps);
        assertEq(actual.targetLtvBps, expected.targetLtvBps);
        assertEq(actual.triggerLtvBps, expected.triggerLtvBps);
        assertEq(actual.rateNumerator, expected.rateNumerator);
        assertEq(actual.rateDenominator, expected.rateDenominator);
        assertEq(actual.maxFills, expected.maxFills);
        assertEq(actual.maxActiveReceipts, expected.maxActiveReceipts);
        assertEq(actual.supportedCorporateActions, expected.supportedCorporateActions);
    }
}
