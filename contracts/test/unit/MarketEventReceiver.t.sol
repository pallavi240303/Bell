// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {SessionOracle} from "../../src/SessionOracle.sol";
import {Types} from "../../src/lib/Types.sol";
import {BELLMarketEventReceiver} from "../../src/BELLMarketEventReceiver.sol";
import {SimulationMarketEventReceiver} from "../../src/demo/SimulationMarketEventReceiver.sol";
import {DemoReportAdapter} from "../../src/demo/DemoReportAdapter.sol";
import {IReceiver, IERC165} from "../../src/interfaces/IReceiver.sol";
import {Errors} from "../../src/lib/Errors.sol";

contract MarketEventReceiverTest is Test {
    bytes32 constant ID = keccak256("workflow");
    bytes32 constant ASSET = keccak256("asset");
    bytes32 constant SESSION = keccak256("session");
    address constant FORWARDER = address(0xF0);
    address constant SIMULATOR = address(0xF1);
    address constant OWNER = address(0xA0);
    address constant EOA = address(0xE0);
    bytes10 constant NAME = 0x776f726b666c6f770000;
    bytes10 constant SIM_NAME = 0x73696d756c61746f7200;
    SessionOracle oracle;
    SessionOracle simOracle;
    SessionOracle demoOracle;
    BELLMarketEventReceiver receiver;
    SimulationMarketEventReceiver simulator;
    DemoReportAdapter demo;

    function setUp() public {
        vm.warp(100_000);
        oracle = new SessionOracle(address(this));
        simOracle = new SessionOracle(address(this));
        demoOracle = new SessionOracle(address(this));
        receiver = new BELLMarketEventReceiver(oracle, FORWARDER, ID, OWNER);
        simulator = new SimulationMarketEventReceiver(simOracle, SIMULATOR);
        demo = new DemoReportAdapter(demoOracle, EOA);
        oracle.bindReceiver(address(receiver));
        simOracle.bindReceiver(address(simulator));
        demoOracle.bindReceiver(address(demo));
    }

    function testInterfaceIdsAndNoGenericCallSurface() public {
        assertEq(type(IReceiver).interfaceId, bytes4(keccak256("onReport(bytes,bytes)")));
        assertEq(type(IERC165).interfaceId, bytes4(0x01ffc9a7));
        assertTrue(receiver.supportsInterface(0x01ffc9a7));
        assertTrue(receiver.supportsInterface(0x805f2132));
        assertFalse(receiver.supportsInterface(0xffffffff));
        assertTrue(simulator.supportsInterface(0x805f2132));
        (bool ok,) = address(receiver).call(abi.encodeWithSignature("execute(address,bytes)", address(oracle), ""));
        assertFalse(ok);
        (ok,) = address(simulator).call(abi.encodeWithSignature("execute(address,bytes)", address(oracle), ""));
        assertFalse(ok);
        (ok,) = address(demo).call(abi.encodeWithSignature("onReport(bytes,bytes)", "", ""));
        assertFalse(ok);
    }

    function testProductionAccepts64ByteMetadataWithReportId() public {
        bytes memory metadata = abi.encodePacked(ID, NAME, OWNER, bytes2(0x1234));
        assertEq(metadata.length, 64);
        vm.prank(FORWARDER);
        receiver.onReport(metadata, abi.encode(_report(oracle)));
        assertEq(uint8(oracle.sessionPhase(SESSION)), uint8(Types.SessionPhase.SCHEDULED));
        Types.MarketEventReport memory r = _report(oracle);
        r.kind = Types.MarketEventKind.CLOSE_CONFIRMED;
        r.nonce = 2;
        r.previousStateHash = oracle.assetState(ASSET).stateHash;
        r.observedAt = r.scheduledClose;
        r.validUntil = r.observedAt + 100;
        vm.warp(r.observedAt);
        vm.prank(FORWARDER);
        receiver.onReport(abi.encodePacked(ID, NAME, OWNER, bytes2(0xffff)), abi.encode(r));
        assertEq(uint8(oracle.sessionPhase(SESSION)), uint8(Types.SessionPhase.CLOSE_CONFIRMED));
    }

    function testConstructorRejectsZeroPinsAndContractDemoAuthority() public {
        vm.expectRevert(Errors.ZeroAddress.selector);
        new BELLMarketEventReceiver(SessionOracle(address(0)), FORWARDER, ID, OWNER);
        vm.expectRevert(Errors.ZeroAddress.selector);
        new BELLMarketEventReceiver(oracle, address(0), ID, OWNER);
        vm.expectRevert(Errors.ZeroWorkflowId.selector);
        new BELLMarketEventReceiver(oracle, FORWARDER, bytes32(0), OWNER);
        vm.expectRevert(Errors.ZeroAddress.selector);
        new BELLMarketEventReceiver(oracle, FORWARDER, ID, address(0));
        vm.expectRevert(Errors.ZeroAddress.selector);
        new SimulationMarketEventReceiver(simOracle, address(0));
        vm.expectRevert(Errors.ZeroAddress.selector);
        new SimulationMarketEventReceiver(SessionOracle(address(0)), SIMULATOR);
        vm.expectRevert(Errors.ZeroAddress.selector);
        new DemoReportAdapter(demoOracle, address(0));
        vm.expectRevert(Errors.ZeroAddress.selector);
        new DemoReportAdapter(SessionOracle(address(0)), EOA);
        vm.expectRevert(Errors.InvalidDemoAuthority.selector);
        new DemoReportAdapter(demoOracle, address(receiver));
        assertEq(address(receiver.oracle()), address(oracle));
        assertEq(receiver.forwarder(), FORWARDER);
        assertEq(receiver.workflowId(), ID);
        assertEq(receiver.workflowOwner(), OWNER);
    }

    function testProductionPinsForwarderMetadataOffsetsAndLengthWithRecovery() public {
        bytes memory payload = abi.encode(_report(oracle));
        bytes memory metadata = _metadata();
        assertEq(metadata.length, 64);
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedReceiver.selector, SIMULATOR));
        vm.prank(SIMULATOR);
        receiver.onReport(metadata, payload);
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidMetadataLength.selector, 0));
        vm.prank(FORWARDER);
        receiver.onReport("", payload);
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidMetadataLength.selector, 65));
        vm.prank(FORWARDER);
        receiver.onReport(bytes.concat(metadata, hex"00"), payload);
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidMetadataLength.selector, 63));
        vm.prank(FORWARDER);
        receiver.onReport(_truncate(metadata), payload);
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidMetadataLength.selector, 62));
        vm.prank(FORWARDER);
        receiver.onReport(abi.encodePacked(ID, NAME, OWNER), payload);
        vm.expectRevert(Errors.InvalidWorkflowIdentity.selector);
        vm.prank(FORWARDER);
        receiver.onReport(abi.encodePacked(bytes32(uint256(ID) ^ 1), NAME, OWNER, bytes2(0x1234)), payload);
        vm.expectRevert(Errors.InvalidWorkflowIdentity.selector);
        vm.prank(FORWARDER);
        receiver.onReport(abi.encodePacked(ID, NAME, address(0xA1), bytes2(0x1234)), payload);
        _assertUntouched();
        vm.prank(FORWARDER);
        receiver.onReport(metadata, payload);
        assertEq(uint8(oracle.sessionPhase(SESSION)), uint8(Types.SessionPhase.SCHEDULED));
    }

    function testReportLengthRejectsShortAndTrailingBytesAndRecovers() public {
        bytes memory payload = abi.encode(_report(oracle));
        assertEq(payload.length, 672);
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidReportLength.selector, 671));
        vm.prank(FORWARDER);
        receiver.onReport(_metadata(), _truncate(payload));
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidReportLength.selector, 673));
        vm.prank(FORWARDER);
        receiver.onReport(_metadata(), bytes.concat(payload, hex"00"));
        _assertUntouched();
        _send(_report(oracle));
        assertEq(oracle.assetState(ASSET).nextNonce, 2);
    }

    function testNonCanonicalBoolEncodingRevertsWithoutStateChange() public {
        bytes memory payload = abi.encode(_report(oracle));
        // The bool occupies the 19th ABI word; 2 is not a canonical bool.
        payload[18 * 32 + 31] = 0x02;
        vm.prank(FORWARDER);
        (bool ok, bytes memory reason) =
            address(receiver).call(abi.encodeCall(IReceiver.onReport, (_metadata(), payload)));
        assertFalse(ok);
        assertEq(reason.length, 0);
        _assertUntouched();
        _send(_report(oracle));
        assertEq(oracle.assetState(ASSET).nextNonce, 2);
    }

    function testOracleDomainAndReplayChecksPropagateAndRecover() public {
        Types.MarketEventReport memory r = _report(oracle);
        r.chainId++;
        _reject(r, abi.encodeWithSelector(Errors.WrongReportDomain.selector));
        r = _report(oracle);
        r.oracle = address(simOracle);
        _reject(r, abi.encodeWithSelector(Errors.WrongReportDomain.selector));
        r = _report(oracle);
        r.assetId = bytes32(0);
        _reject(r, abi.encodeWithSelector(Errors.ZeroAssetId.selector));
        r = _report(oracle);
        r.sessionId = bytes32(0);
        _reject(r, abi.encodeWithSelector(Errors.ZeroSessionId.selector));
        r = _report(oracle);
        r.configHash = bytes32(0);
        _reject(r, abi.encodeWithSelector(Errors.ZeroConfigHash.selector));
        r = _report(oracle);
        r.nonce = 2;
        _reject(r, abi.encodeWithSelector(Errors.InvalidNonce.selector, uint64(1), uint64(2)));
        r = _report(oracle);
        r.previousStateHash = bytes32(uint256(1));
        _reject(r, abi.encodeWithSelector(Errors.InvalidPreviousState.selector, bytes32(0), r.previousStateHash));
        r = _report(oracle);
        r.validUntil = 99_999;
        _reject(r, abi.encodeWithSelector(Errors.ReportExpired.selector, uint64(99_999), uint64(100_000)));
        r = _report(oracle);
        r.primarySourceHash = bytes32(0);
        _reject(r, abi.encodeWithSelector(Errors.MissingSourceEvidence.selector));
        r = _report(oracle);
        r.kind = Types.MarketEventKind.CLOSE_CONFIRMED;
        _reject(r, abi.encodeWithSelector(Errors.InvalidSessionTransition.selector, Types.SessionPhase.NONE, r.kind));
        _send(_report(oracle));
        assertEq(oracle.assetState(ASSET).nextNonce, 2);
    }

    function testWrongNonzeroAssetCannotCloseExistingSession() public {
        Types.MarketEventReport memory r = _report(oracle);
        _send(r);
        bytes32 state = oracle.assetState(ASSET).stateHash;
        bytes32 otherAsset = keccak256("other asset");
        r.kind = Types.MarketEventKind.CLOSE_CONFIRMED;
        r.assetId = otherAsset;
        r.observedAt = r.scheduledClose;
        r.validUntil = r.observedAt + 100;
        vm.warp(r.observedAt);
        vm.expectRevert(abi.encodeWithSelector(Errors.SessionIdentityMismatch.selector, SESSION));
        _send(r);
        assertEq(oracle.assetState(ASSET).stateHash, state);
        assertEq(oracle.assetState(ASSET).nextNonce, 2);
        assertEq(oracle.assetState(otherAsset).stateHash, bytes32(0));
        assertEq(oracle.assetState(otherAsset).nextNonce, 1);
        assertEq(uint8(oracle.sessionPhase(SESSION)), uint8(Types.SessionPhase.SCHEDULED));
        r.assetId = ASSET;
        r.nonce = 2;
        r.previousStateHash = state;
        _send(r);
        assertEq(uint8(oracle.sessionPhase(SESSION)), uint8(Types.SessionPhase.CLOSE_CONFIRMED));
    }

    function testWrongExistingSessionCannotCloseAsset() public {
        Types.MarketEventReport memory r = _report(oracle);
        _send(r);
        bytes32 state = oracle.assetState(ASSET).stateHash;
        bytes32 otherAsset = keccak256("other asset");
        bytes32 otherSession = keccak256("other session");
        Types.MarketEventReport memory other = _report(oracle);
        other.assetId = otherAsset;
        other.sessionId = otherSession;
        _send(other);
        bytes32 otherState = oracle.assetState(otherAsset).stateHash;
        r.kind = Types.MarketEventKind.CLOSE_CONFIRMED;
        r.sessionId = otherSession;
        r.nonce = 2;
        r.previousStateHash = state;
        r.observedAt = r.scheduledClose;
        r.validUntil = r.observedAt + 100;
        vm.warp(r.observedAt);
        vm.expectRevert(abi.encodeWithSelector(Errors.SessionIdentityMismatch.selector, otherSession));
        _send(r);
        assertEq(oracle.assetState(ASSET).stateHash, state);
        assertEq(oracle.assetState(otherAsset).stateHash, otherState);
        assertEq(uint8(oracle.sessionPhase(SESSION)), uint8(Types.SessionPhase.SCHEDULED));
        assertEq(uint8(oracle.sessionPhase(otherSession)), uint8(Types.SessionPhase.SCHEDULED));
        r.sessionId = SESSION;
        _send(r);
        assertEq(uint8(oracle.sessionPhase(SESSION)), uint8(Types.SessionPhase.CLOSE_CONFIRMED));
    }

    function testProgressionAndFinalReplayConflictPreserveState() public {
        Types.MarketEventReport memory r = _report(oracle);
        _send(r);
        r.kind = Types.MarketEventKind.CLOSE_CONFIRMED;
        r.nonce = 2;
        r.previousStateHash = oracle.assetState(ASSET).stateHash;
        r.observedAt = r.scheduledClose;
        r.validUntil = r.observedAt + 100;
        vm.warp(r.observedAt);
        bytes32 originalConfig = r.configHash;
        r.configHash = keccak256("wrong");
        vm.expectRevert(abi.encodeWithSelector(Errors.AssetConfigMismatch.selector, originalConfig, r.configHash));
        _send(r);
        assertEq(oracle.assetState(ASSET).nextNonce, 2);
        r.configHash = originalConfig;
        _send(r);
        r.kind = Types.MarketEventKind.REOPEN_BENCHMARK;
        r.nonce = 3;
        r.previousStateHash = oracle.assetState(ASSET).stateHash;
        r.benchmarkPrice = 125_000_000;
        r.multiplierNumerator = 1;
        r.multiplierDenominator = 1;
        r.secondarySourceHash = keccak256("secondary");
        _send(r);
        bytes32 state = oracle.assetState(ASSET).stateHash;
        bytes32 finalHash = oracle.benchmarkOf(SESSION).reportHash;
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidNonce.selector, uint64(4), uint64(3)));
        _send(r);
        r.nonce = 4;
        r.previousStateHash = state;
        r.benchmarkPrice++;
        vm.expectRevert(abi.encodeWithSelector(Errors.FinalBenchmarkAlreadyAccepted.selector, SESSION));
        _send(r);
        assertEq(oracle.assetState(ASSET).stateHash, state);
        assertEq(oracle.benchmarkOf(SESSION).reportHash, finalHash);
    }

    function testSimulationAndDemoAuthoritiesAreSeparate() public {
        Types.MarketEventReport memory s = _report(simOracle);
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedReceiver.selector, FORWARDER));
        vm.prank(FORWARDER);
        simulator.onReport("", abi.encode(s));
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidMetadataLength.selector, 1));
        vm.prank(SIMULATOR);
        simulator.onReport(hex"00", abi.encode(s));
        vm.prank(SIMULATOR);
        simulator.onReport("", abi.encode(s));
        assertEq(simOracle.assetState(ASSET).nextNonce, 2);
        Types.MarketEventReport memory d = _report(demoOracle);
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedReceiver.selector, FORWARDER));
        vm.prank(FORWARDER);
        demo.submit(d);
        vm.prank(EOA, EOA);
        demo.submit(d);
        assertEq(demoOracle.assetState(ASSET).nextNonce, 2);
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedReceiver.selector, EOA));
        vm.prank(EOA, EOA);
        receiver.onReport(_metadata(), abi.encode(_report(oracle)));
        _assertUntouched();
        DemoReportAdapter rogue = new DemoReportAdapter(oracle, EOA);
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedReceiver.selector, address(rogue)));
        vm.prank(EOA, EOA);
        rogue.submit(_report(oracle));
        _assertUntouched();
    }

    function testSimulationAcceptsCanonicalMetadataAndEmitsDecodedIdentity() public {
        Types.MarketEventReport memory r = _report(simOracle);
        bytes memory metadata = abi.encodePacked(ID, SIM_NAME, OWNER);
        vm.recordLogs();
        vm.prank(SIMULATOR);
        simulator.onReport(metadata, abi.encode(r));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2);
        assertEq(logs[1].emitter, address(simulator));
        assertEq(logs[1].topics[1], keccak256(abi.encode(r)));
        (bytes32 id, bytes10 name, address owner, uint8 mode) =
            abi.decode(logs[1].data, (bytes32, bytes10, address, uint8));
        assertEq(id, ID);
        assertEq(name, SIM_NAME);
        assertEq(owner, OWNER);
        assertEq(mode, 1);
    }

    function testSimulationAccepts64ByteMetadataAndEmitsIdentityWithoutReportId() public {
        Types.MarketEventReport memory r = _report(simOracle);
        bytes memory payload = abi.encode(r);
        assertEq(payload.length, 672);
        bytes memory metadata = abi.encodePacked(ID, SIM_NAME, OWNER, bytes2(0x1234));
        assertEq(metadata.length, 64);
        vm.recordLogs();
        vm.prank(SIMULATOR);
        simulator.onReport(metadata, payload);
        assertEq(simOracle.assetState(ASSET).nextNonce, 2);
        assertEq(uint8(simOracle.sessionPhase(SESSION)), uint8(Types.SessionPhase.SCHEDULED));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2);
        assertEq(logs[1].emitter, address(simulator));
        assertEq(logs[1].topics[1], keccak256(payload));
        (bytes32 id, bytes10 name, address owner, uint8 mode) =
            abi.decode(logs[1].data, (bytes32, bytes10, address, uint8));
        assertEq(id, ID);
        assertEq(name, SIM_NAME);
        assertEq(owner, OWNER);
        assertEq(mode, 1);
    }

    function testSimulation64ByteMetadataRetainsForwarderLengthPayloadAndDomainChecks() public {
        bytes memory metadata = abi.encodePacked(ID, SIM_NAME, OWNER, bytes2(0xffff));
        Types.MarketEventReport memory r = _report(simOracle);
        bytes memory payload = abi.encode(r);
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedReceiver.selector, FORWARDER));
        vm.prank(FORWARDER);
        simulator.onReport(metadata, payload);
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidMetadataLength.selector, 63));
        vm.prank(SIMULATOR);
        simulator.onReport(_truncate(metadata), payload);
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidMetadataLength.selector, 65));
        vm.prank(SIMULATOR);
        simulator.onReport(bytes.concat(metadata, hex"00"), payload);
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidReportLength.selector, 673));
        vm.prank(SIMULATOR);
        simulator.onReport(metadata, bytes.concat(payload, hex"00"));
        r.chainId++;
        vm.expectRevert(Errors.WrongReportDomain.selector);
        vm.prank(SIMULATOR);
        simulator.onReport(metadata, abi.encode(r));
        assertEq(simOracle.assetState(ASSET).nextNonce, 1);
        assertEq(simOracle.assetState(ASSET).stateHash, bytes32(0));
        assertEq(uint8(simOracle.sessionPhase(SESSION)), uint8(Types.SessionPhase.NONE));
    }

    function _metadata() internal pure returns (bytes memory) {
        return abi.encodePacked(ID, NAME, OWNER, bytes2(0x1234));
    }

    function _report(SessionOracle target) internal view returns (Types.MarketEventReport memory r) {
        r.schemaVersion = 1;
        r.kind = Types.MarketEventKind.SESSION_SCHEDULED;
        r.chainId = block.chainid;
        r.oracle = address(target);
        r.assetId = ASSET;
        r.sessionId = SESSION;
        r.configHash = keccak256("config");
        r.nonce = 1;
        r.observedAt = 100_000;
        r.validUntil = 100_100;
        r.scheduledOpen = 100_010;
        r.scheduledClose = 100_020;
        r.primarySourceHash = keccak256("source");
    }

    function _send(Types.MarketEventReport memory r) internal {
        vm.prank(FORWARDER);
        receiver.onReport(_metadata(), abi.encode(r));
    }

    function _reject(Types.MarketEventReport memory r, bytes memory reason) internal {
        vm.expectRevert(reason);
        _send(r);
        _assertUntouched();
    }

    function _assertUntouched() internal view {
        assertEq(oracle.assetState(ASSET).nextNonce, 1);
        assertEq(oracle.assetState(ASSET).stateHash, bytes32(0));
        assertEq(uint8(oracle.sessionPhase(SESSION)), uint8(Types.SessionPhase.NONE));
    }

    function _truncate(bytes memory payload) internal pure returns (bytes memory shortPayload) {
        shortPayload = new bytes(payload.length - 1);
        for (uint256 i; i < shortPayload.length; i++) {
            shortPayload[i] = payload[i];
        }
    }
}
