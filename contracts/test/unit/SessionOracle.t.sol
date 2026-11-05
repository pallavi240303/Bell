// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, Vm} from "forge-std/Test.sol";

import {SessionOracle} from "../../src/SessionOracle.sol";
import {Errors} from "../../src/lib/Errors.sol";
import {Events} from "../../src/lib/Events.sol";
import {Types} from "../../src/lib/Types.sol";

contract SessionOracleTest is Test {
    bytes32 internal constant ASSET_ID = keccak256("BELL_STOCK");
    bytes32 internal constant SESSION_ID = keccak256("PRIMARY_SESSION");
    bytes32 internal constant CONFIG_HASH = keccak256("CONFIG_V1");
    bytes32 internal constant NEXT_CONFIG_HASH = keccak256("CONFIG_V2");
    bytes32 internal constant PRIMARY_SOURCE_HASH = keccak256("PRIMARY_SOURCE");
    bytes32 internal constant SECONDARY_SOURCE_HASH = keccak256("SECONDARY_SOURCE");
    address internal constant RECEIVER = address(0xCE1);
    address internal constant ATTACKER = address(0xBAD);

    SessionOracle internal oracle;

    function setUp() public {
        vm.warp(100_000);
        oracle = new SessionOracle(address(this));
        oracle.bindReceiver(RECEIVER);
    }

    function testReceiverBindingIsOwnerOnlyNonzeroAndOneShot() public {
        SessionOracle fresh = new SessionOracle(address(this));

        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Errors.Unauthorized.selector, ATTACKER));
        fresh.bindReceiver(RECEIVER);

        vm.expectRevert(Errors.ZeroAddress.selector);
        fresh.bindReceiver(address(0));

        fresh.bindReceiver(RECEIVER);
        assertEq(fresh.receiver(), RECEIVER);
        vm.expectRevert(Errors.ReceiverAlreadyBound.selector);
        fresh.bindReceiver(address(0xCE2));
    }

    function testOnlyReceiverCanAcceptReportsIncludingOwner() public {
        Types.MarketEventReport memory report = _scheduledReport();

        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedReceiver.selector, address(this)));
        oracle.acceptReport(report);

        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedReceiver.selector, ATTACKER));
        oracle.acceptReport(report);
    }

    function testAcceptsTypedProgressionAndExposesFinalBenchmark() public {
        Types.MarketEventReport memory scheduled = _scheduledReport();
        _accept(scheduled);
        assertEq(uint8(oracle.sessionPhase(SESSION_ID)), uint8(Types.SessionPhase.SCHEDULED));

        Types.MarketEventReport memory closed = _nextReport(scheduled, Types.MarketEventKind.CLOSE_CONFIRMED);
        closed.observedAt = scheduled.scheduledClose;
        closed.validUntil = closed.observedAt + 100;
        vm.warp(closed.observedAt);
        _accept(closed);
        assertEq(uint8(oracle.sessionPhase(SESSION_ID)), uint8(Types.SessionPhase.CLOSE_CONFIRMED));

        Types.MarketEventReport memory reopened = _nextReport(closed, Types.MarketEventKind.REOPEN_BENCHMARK);
        reopened.observedAt = closed.observedAt + 10;
        reopened.validUntil = reopened.observedAt + 100;
        reopened.benchmarkPrice = 125_000_000;
        reopened.multiplierNumerator = 1;
        reopened.multiplierDenominator = 1;
        reopened.primarySourceHash = PRIMARY_SOURCE_HASH;
        reopened.secondarySourceHash = SECONDARY_SOURCE_HASH;
        vm.warp(reopened.observedAt);
        _accept(reopened);

        assertEq(uint8(oracle.sessionPhase(SESSION_ID)), uint8(Types.SessionPhase.REOPEN_BENCHMARK));
        Types.Benchmark memory benchmark = oracle.benchmarkOf(SESSION_ID);
        assertTrue(benchmark.finalized);
        assertEq(benchmark.assetId, ASSET_ID);
        assertEq(benchmark.sessionId, SESSION_ID);
        assertEq(benchmark.configHash, CONFIG_HASH);
        assertEq(benchmark.price, reopened.benchmarkPrice);
        assertEq(benchmark.multiplierNumerator, 1);
        assertEq(benchmark.multiplierDenominator, 1);
        assertEq(benchmark.reportHash, keccak256(abi.encode(reopened)));
    }

    function testAcceptedReportEmitsDomainAndStateEvidence() public {
        Types.MarketEventReport memory report = _scheduledReport();
        vm.recordLogs();
        _accept(report);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 1);
        assertEq(logs[0].emitter, address(oracle));
        assertEq(logs[0].topics[0], Events.MARKET_EVENT_ACCEPTED_TOPIC);
        assertEq(logs[0].topics[1], ASSET_ID);
        assertEq(logs[0].topics[2], SESSION_ID);
        assertEq(uint256(logs[0].topics[3]), uint8(Types.MarketEventKind.SESSION_SCHEDULED));
        (uint64 nonce, bytes32 reportHash, bytes32 newStateHash) = abi.decode(logs[0].data, (uint64, bytes32, bytes32));
        assertEq(nonce, 1);
        assertEq(reportHash, keccak256(abi.encode(report)));
        assertEq(newStateHash, oracle.assetState(ASSET_ID).stateHash);
    }

    function testRejectsWrongChainAndOracleDomain() public {
        Types.MarketEventReport memory report = _scheduledReport();
        report.chainId = block.chainid + 1;
        vm.expectRevert(Errors.WrongReportDomain.selector);
        _accept(report);

        report = _scheduledReport();
        report.oracle = address(0xBEEF);
        vm.expectRevert(Errors.WrongReportDomain.selector);
        _accept(report);
    }

    function testRejectsZeroAssetSessionAndConfigIdentity() public {
        Types.MarketEventReport memory report = _scheduledReport();
        report.assetId = bytes32(0);
        vm.expectRevert(Errors.ZeroAssetId.selector);
        _accept(report);

        report = _scheduledReport();
        report.sessionId = bytes32(0);
        vm.expectRevert(Errors.ZeroSessionId.selector);
        _accept(report);

        report = _scheduledReport();
        report.configHash = bytes32(0);
        vm.expectRevert(Errors.ZeroConfigHash.selector);
        _accept(report);
    }

    function testRejectsExpiredAndFutureObservation() public {
        Types.MarketEventReport memory report = _scheduledReport();
        report.validUntil = uint64(block.timestamp - 1);
        vm.expectRevert(
            abi.encodeWithSelector(Errors.ReportExpired.selector, report.validUntil, uint64(block.timestamp))
        );
        _accept(report);

        report = _scheduledReport();
        report.observedAt = uint64(block.timestamp + 1);
        vm.expectRevert(
            abi.encodeWithSelector(Errors.FutureObservation.selector, report.observedAt, uint64(block.timestamp))
        );
        _accept(report);
    }

    function testRejectsInvalidSessionTimingAndWrongTransition() public {
        Types.MarketEventReport memory report = _scheduledReport();
        report.scheduledOpen = report.scheduledClose;
        vm.expectRevert(Errors.InvalidSessionTiming.selector);
        _accept(report);

        report = _scheduledReport();
        report.kind = Types.MarketEventKind.CLOSE_CONFIRMED;
        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InvalidSessionTransition.selector, Types.SessionPhase.NONE, Types.MarketEventKind.CLOSE_CONFIRMED
            )
        );
        _accept(report);
    }

    function testRejectsNonceAndPreviousStateMismatch() public {
        Types.MarketEventReport memory report = _scheduledReport();
        report.nonce = 2;
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidNonce.selector, uint64(1), uint64(2)));
        _accept(report);

        report = _scheduledReport();
        report.previousStateHash = keccak256("WRONG_STATE");
        vm.expectRevert(
            abi.encodeWithSelector(Errors.InvalidPreviousState.selector, bytes32(0), report.previousStateHash)
        );
        _accept(report);
    }

    function testRejectsDuplicateReport() public {
        Types.MarketEventReport memory report = _scheduledReport();
        _accept(report);

        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidNonce.selector, uint64(2), uint64(1)));
        _accept(report);
    }

    function testRejectsConflictingFinalBenchmark() public {
        Types.MarketEventReport memory finalized = _finalizeBenchmark();

        Types.MarketEventReport memory conflict = finalized;
        Types.AssetState memory state = oracle.assetState(ASSET_ID);
        conflict.nonce = state.nextNonce;
        conflict.previousStateHash = state.stateHash;
        conflict.benchmarkPrice += 1;
        conflict.observedAt = uint64(block.timestamp);
        conflict.validUntil = uint64(block.timestamp + 100);

        vm.expectRevert(abi.encodeWithSelector(Errors.FinalBenchmarkAlreadyAccepted.selector, SESSION_ID));
        _accept(conflict);
    }

    function testRejectsZeroBenchmarkOrMultiplier() public {
        Types.MarketEventReport memory closed = _closeSession();
        Types.MarketEventReport memory report = _nextReport(closed, Types.MarketEventKind.REOPEN_BENCHMARK);
        report.observedAt = uint64(block.timestamp);
        report.validUntil = uint64(block.timestamp + 100);
        report.primarySourceHash = PRIMARY_SOURCE_HASH;
        report.secondarySourceHash = SECONDARY_SOURCE_HASH;
        report.multiplierNumerator = 1;
        report.multiplierDenominator = 1;

        vm.expectRevert(Errors.ZeroBenchmarkPrice.selector);
        _accept(report);

        report.benchmarkPrice = 125_000_000;
        report.multiplierDenominator = 0;
        vm.expectRevert(Errors.InvalidMultiplier.selector);
        _accept(report);
    }

    function testRejectsBenchmarkBeforeConfirmedCloseOrWithChangedSchedule() public {
        Types.MarketEventReport memory closed = _closeSession();
        Types.MarketEventReport memory report = _nextReport(closed, Types.MarketEventKind.REOPEN_BENCHMARK);
        report.observedAt = closed.observedAt - 1;
        report.validUntil = uint64(block.timestamp + 100);
        report.benchmarkPrice = 125_000_000;
        report.multiplierNumerator = 1;
        report.multiplierDenominator = 1;
        report.primarySourceHash = PRIMARY_SOURCE_HASH;
        report.secondarySourceHash = SECONDARY_SOURCE_HASH;

        vm.expectRevert(Errors.InvalidSessionTiming.selector);
        _accept(report);

        report.observedAt = uint64(block.timestamp);
        report.scheduledClose += 1;
        vm.expectRevert(Errors.InvalidSessionTiming.selector);
        _accept(report);
    }

    function testHaltAndCorporateActionUpdateAssetFactsWithoutClosingSession() public {
        Types.MarketEventReport memory scheduled = _scheduledReport();
        _accept(scheduled);

        Types.MarketEventReport memory halt = _assetReport(scheduled, Types.MarketEventKind.HALT);
        halt.halted = true;
        _accept(halt);
        Types.AssetState memory halted = oracle.assetState(ASSET_ID);
        assertTrue(halted.halted);
        assertEq(uint8(oracle.sessionPhase(SESSION_ID)), uint8(Types.SessionPhase.SCHEDULED));

        Types.MarketEventReport memory action = _assetReport(halt, Types.MarketEventKind.CORPORATE_ACTION);
        action.corporateAction = Types.CorporateAction.SPLIT;
        action.multiplierNumerator = 2;
        action.multiplierDenominator = 1;
        action.actionId = keccak256("SPLIT_ACTION");
        _accept(action);

        Types.CorporateActionFact memory stored = oracle.latestCorporateAction(ASSET_ID);
        assertEq(stored.actionId, action.actionId);
        assertEq(uint8(stored.action), uint8(Types.CorporateAction.SPLIT));
        assertEq(stored.multiplierNumerator, 2);
        assertEq(stored.multiplierDenominator, 1);
        assertEq(uint8(oracle.sessionPhase(SESSION_ID)), uint8(Types.SessionPhase.SCHEDULED));
    }

    function testRejectsUnsupportedCorporateAction() public {
        Types.MarketEventReport memory base = _scheduledReport();
        Types.MarketEventReport memory report = _assetReport(base, Types.MarketEventKind.CORPORATE_ACTION);
        report.corporateAction = Types.CorporateAction.CASH_DIVIDEND;
        report.multiplierNumerator = 1;
        report.multiplierDenominator = 1;
        report.actionId = keccak256("UNSUPPORTED_ACTION");

        vm.expectRevert(
            abi.encodeWithSelector(Errors.UnsupportedCorporateAction.selector, Types.CorporateAction.CASH_DIVIDEND)
        );
        _accept(report);
    }

    function testFinalizedSessionAllowsNextSessionToPinNewConfig() public {
        _finalizeBenchmark();
        Types.AssetState memory previousState = oracle.assetState(ASSET_ID);

        Types.MarketEventReport memory nextSession = _scheduledReport();
        nextSession.sessionId = keccak256("NEXT_SESSION");
        nextSession.configHash = NEXT_CONFIG_HASH;
        nextSession.nonce = previousState.nextNonce;
        nextSession.previousStateHash = previousState.stateHash;
        nextSession.observedAt = uint64(block.timestamp);
        nextSession.validUntil = uint64(block.timestamp + 100);
        nextSession.scheduledOpen = uint64(block.timestamp + 10);
        nextSession.scheduledClose = uint64(block.timestamp + 20);

        _accept(nextSession);
        Types.AssetState memory rotatedState = oracle.assetState(ASSET_ID);
        assertEq(rotatedState.configHash, NEXT_CONFIG_HASH);
        assertEq(rotatedState.activeSessionId, nextSession.sessionId);
        assertEq(uint8(oracle.sessionPhase(nextSession.sessionId)), uint8(Types.SessionPhase.SCHEDULED));

        Types.MarketEventReport memory wrongConfigClose =
            _nextReport(nextSession, Types.MarketEventKind.CLOSE_CONFIRMED);
        wrongConfigClose.configHash = CONFIG_HASH;
        wrongConfigClose.observedAt = nextSession.scheduledClose;
        wrongConfigClose.validUntil = wrongConfigClose.observedAt + 100;
        vm.warp(wrongConfigClose.observedAt);

        vm.expectRevert(abi.encodeWithSelector(Errors.AssetConfigMismatch.selector, NEXT_CONFIG_HASH, CONFIG_HASH));
        _accept(wrongConfigClose);
    }

    function testCannotScheduleNextSessionBeforeCurrentSessionIsFinal() public {
        Types.MarketEventReport memory current = _scheduledReport();
        _accept(current);
        Types.AssetState memory state = oracle.assetState(ASSET_ID);

        Types.MarketEventReport memory nextSession = _scheduledReport();
        nextSession.sessionId = keccak256("NEXT_SESSION");
        nextSession.configHash = NEXT_CONFIG_HASH;
        nextSession.nonce = state.nextNonce;
        nextSession.previousStateHash = state.stateHash;

        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.ActiveSessionNotFinal.selector, current.sessionId, Types.SessionPhase.SCHEDULED
            )
        );
        _accept(nextSession);
    }

    function _scheduledReport() internal view returns (Types.MarketEventReport memory report) {
        report = Types.MarketEventReport({
            schemaVersion: 1,
            kind: Types.MarketEventKind.SESSION_SCHEDULED,
            chainId: block.chainid,
            oracle: address(oracle),
            assetId: ASSET_ID,
            sessionId: SESSION_ID,
            configHash: CONFIG_HASH,
            nonce: 1,
            previousStateHash: bytes32(0),
            observedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 100),
            scheduledOpen: uint64(block.timestamp + 10),
            scheduledClose: uint64(block.timestamp + 20),
            benchmarkPrice: 0,
            corporateAction: Types.CorporateAction.NONE,
            actionId: bytes32(0),
            multiplierNumerator: 0,
            multiplierDenominator: 0,
            halted: false,
            primarySourceHash: PRIMARY_SOURCE_HASH,
            secondarySourceHash: bytes32(0)
        });
    }

    function _nextReport(Types.MarketEventReport memory previous, Types.MarketEventKind kind)
        internal
        view
        returns (Types.MarketEventReport memory report)
    {
        report = previous;
        Types.AssetState memory state = oracle.assetState(ASSET_ID);
        report.kind = kind;
        report.nonce = state.nextNonce;
        report.previousStateHash = state.stateHash;
        report.benchmarkPrice = 0;
        report.corporateAction = Types.CorporateAction.NONE;
        report.actionId = bytes32(0);
        report.multiplierNumerator = 0;
        report.multiplierDenominator = 0;
        report.halted = false;
    }

    function _assetReport(Types.MarketEventReport memory previous, Types.MarketEventKind kind)
        internal
        view
        returns (Types.MarketEventReport memory report)
    {
        report = _nextReport(previous, kind);
        report.sessionId = bytes32(0);
        report.scheduledOpen = 0;
        report.scheduledClose = 0;
        report.observedAt = uint64(block.timestamp);
        report.validUntil = uint64(block.timestamp + 100);
    }

    function _closeSession() internal returns (Types.MarketEventReport memory closed) {
        Types.MarketEventReport memory scheduled = _scheduledReport();
        _accept(scheduled);
        closed = _nextReport(scheduled, Types.MarketEventKind.CLOSE_CONFIRMED);
        closed.observedAt = scheduled.scheduledClose;
        closed.validUntil = closed.observedAt + 100;
        vm.warp(closed.observedAt);
        _accept(closed);
    }

    function _finalizeBenchmark() internal returns (Types.MarketEventReport memory reopened) {
        Types.MarketEventReport memory closed = _closeSession();
        reopened = _nextReport(closed, Types.MarketEventKind.REOPEN_BENCHMARK);
        reopened.observedAt = uint64(block.timestamp + 10);
        reopened.validUntil = reopened.observedAt + 100;
        reopened.benchmarkPrice = 125_000_000;
        reopened.multiplierNumerator = 1;
        reopened.multiplierDenominator = 1;
        reopened.primarySourceHash = PRIMARY_SOURCE_HASH;
        reopened.secondarySourceHash = SECONDARY_SOURCE_HASH;
        vm.warp(reopened.observedAt);
        _accept(reopened);
    }

    function _accept(Types.MarketEventReport memory report) internal {
        vm.prank(RECEIVER);
        oracle.acceptReport(report);
    }
}
