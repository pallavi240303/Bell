// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {SessionOracle} from "../../src/SessionOracle.sol";
import {Types} from "../../src/lib/Types.sol";

contract MarketSnapshotTest is Test {
    SessionOracle oracle;
    bytes32 constant ASSET = keccak256("snapshot-asset");
    bytes32 constant CONFIG = keccak256("snapshot-config");
    bytes32 constant PRIOR = keccak256("snapshot-prior");
    bytes32 constant ACTIVE = keccak256("snapshot-active");

    function setUp() public {
        vm.warp(1000);
        oracle = new SessionOracle(address(this));
        oracle.bindReceiver(address(this));
    }

    function _accept(Types.MarketEventKind kind, bytes32 sessionId, uint64 open, uint64 close) internal {
        Types.AssetState memory s = oracle.assetState(ASSET);
        Types.MarketEventReport memory r;
        r.schemaVersion = 1;
        r.kind = kind;
        r.chainId = block.chainid;
        r.oracle = address(oracle);
        r.assetId = ASSET;
        r.sessionId = sessionId;
        r.configHash = CONFIG;
        r.nonce = s.nextNonce;
        r.previousStateHash = s.stateHash;
        r.observedAt = uint64(block.timestamp);
        r.validUntil = uint64(block.timestamp + 1000);
        r.scheduledOpen = open;
        r.scheduledClose = close;
        r.primarySourceHash = keccak256("p");
        r.secondarySourceHash = keccak256("s");
        if (kind == Types.MarketEventKind.MARKET_PRICE || kind == Types.MarketEventKind.REOPEN_BENCHMARK) {
            r.benchmarkPrice = 100e6;
            r.multiplierNumerator = 1;
            r.multiplierDenominator = 1;
        }
        if (kind == Types.MarketEventKind.HALT) r.halted = true;
        oracle.acceptReport(r);
    }

    function _compare(bytes32 asset, bytes32 target, bytes32 previous) internal view {
        (bool ok, bytes memory actual) =
            address(oracle).staticcall(abi.encodeCall(oracle.marketSnapshot, (asset, target, previous)));
        assertTrue(ok);
        assertEq(actual.length, 2112);
        bytes memory expected = abi.encode(
            oracle.assetState(asset),
            oracle.sessionFact(target),
            oracle.sessionFact(oracle.assetState(asset).activeSessionId),
            oracle.benchmarkOf(target),
            oracle.benchmarkOf(previous),
            oracle.latestCorporateAction(asset),
            oracle.latestReference(asset)
        );
        assertEq(actual, expected);
    }

    function testEmptySnapshotNormalizesNonceAndPreservesZeroTuples() public view {
        _compare(ASSET, ACTIVE, PRIOR);
        assertEq(oracle.assetState(ASSET).nextNonce, 1);
    }

    function testPopulatedDistinctTargetActiveAndReferenceAreExactViews() public {
        _accept(Types.MarketEventKind.SESSION_SCHEDULED, PRIOR, 1100, 1200);
        vm.warp(1200);
        _accept(Types.MarketEventKind.CLOSE_CONFIRMED, PRIOR, 1100, 1200);
        vm.warp(1201);
        _accept(Types.MarketEventKind.REOPEN_BENCHMARK, PRIOR, 1100, 1200);
        _accept(Types.MarketEventKind.SESSION_SCHEDULED, ACTIVE, 1300, 3000);
        vm.warp(1400);
        _accept(Types.MarketEventKind.MARKET_PRICE, bytes32(0), 1300, 3000);
        bytes32 state = oracle.assetState(ASSET).stateHash;
        _compare(ASSET, keccak256("third-target"), PRIOR);
        _compare(ASSET, ACTIVE, ACTIVE);
        _compare(ASSET, bytes32(0), bytes32(0));
        assertEq(oracle.assetState(ASSET).stateHash, state);
    }

    function testSnapshotStillInspectsInvalidatedExpiredReference() public {
        _accept(Types.MarketEventKind.SESSION_SCHEDULED, ACTIVE, 1100, 3000);
        vm.warp(1200);
        _accept(Types.MarketEventKind.MARKET_PRICE, bytes32(0), 1100, 3000);
        bytes32 before = oracle.latestReference(ASSET).reportHash;
        _accept(Types.MarketEventKind.HALT, bytes32(0), 0, 0);
        vm.warp(4000);
        _compare(ASSET, ACTIVE, PRIOR);
        assertEq(oracle.latestReference(ASSET).reportHash, before);
    }

    function testFuzzUnseenReadKeysNeverChangeNonce(bytes32 asset, bytes32 target, bytes32 previous) public view {
        _compare(asset, target, previous);
    }
}
