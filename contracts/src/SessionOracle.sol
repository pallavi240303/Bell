// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Errors} from "./lib/Errors.sol";
import {Events} from "./lib/Events.sol";
import {Types} from "./lib/Types.sol";

contract SessionOracle {
    uint256 private constant MAX_REFERENCE_AGE = 1800;

    address public immutable owner;
    address public receiver;

    mapping(bytes32 assetId => Types.AssetState state) private _assetStates;
    mapping(bytes32 sessionId => Types.SessionFact fact) private _sessions;
    mapping(bytes32 sessionId => Types.Benchmark benchmark) private _benchmarks;
    mapping(bytes32 assetId => Types.CorporateActionFact fact) private _corporateActions;
    mapping(bytes32 assetId => Types.ReferencePriceFact fact) private _references;
    // A halt permanently invalidates the old fact, including after a later unhalt.
    mapping(bytes32 assetId => bool invalidated) private _referenceInvalidated;

    constructor(address owner_) {
        if (owner_ == address(0)) revert Errors.ZeroAddress();
        owner = owner_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Errors.Unauthorized(msg.sender);
        _;
    }

    function bindReceiver(address receiver_) external onlyOwner {
        if (receiver_ == address(0)) revert Errors.ZeroAddress();
        if (receiver != address(0)) revert Errors.ReceiverAlreadyBound();
        receiver = receiver_;
        emit Events.ReceiverBound(receiver_);
    }

    function acceptReport(Types.MarketEventReport calldata report) external {
        if (msg.sender != receiver || receiver == address(0)) {
            revert Errors.UnauthorizedReceiver(msg.sender);
        }
        _validateCommon(report);

        Types.AssetState storage state = _assetStates[report.assetId];
        uint64 expectedNonce = state.nextNonce == 0 ? 1 : state.nextNonce;
        if (report.nonce != expectedNonce) {
            revert Errors.InvalidNonce(expectedNonce, report.nonce);
        }
        if (report.previousStateHash != state.stateHash) {
            revert Errors.InvalidPreviousState(state.stateHash, report.previousStateHash);
        }
        if (
            report.kind != Types.MarketEventKind.SESSION_SCHEDULED && state.configHash != bytes32(0)
                && state.configHash != report.configHash
        ) {
            revert Errors.AssetConfigMismatch(state.configHash, report.configHash);
        }

        bytes32 reportHash = keccak256(abi.encode(report));
        if (report.kind == Types.MarketEventKind.SESSION_SCHEDULED) {
            _acceptScheduled(report, reportHash);
        } else if (report.kind == Types.MarketEventKind.CLOSE_CONFIRMED) {
            _acceptClose(report, reportHash);
        } else if (report.kind == Types.MarketEventKind.REOPEN_BENCHMARK) {
            _acceptBenchmark(report, reportHash);
        } else if (report.kind == Types.MarketEventKind.CORPORATE_ACTION) {
            _acceptCorporateAction(report, reportHash);
        } else if (report.kind == Types.MarketEventKind.MARKET_PRICE) {
            _acceptReference(report, reportHash);
        } else if (report.kind == Types.MarketEventKind.HALT) {
            _acceptHalt(report);
        } else {
            revert Errors.InvalidReportKind();
        }

        bytes32 newStateHash = keccak256(abi.encode(state.stateHash, reportHash));
        state.nextNonce = expectedNonce + 1;
        state.stateHash = newStateHash;
        state.configHash = report.configHash;

        emit Events.MarketEventAccepted(
            report.assetId, report.sessionId, report.kind, report.nonce, reportHash, newStateHash
        );
    }

    function assetState(bytes32 assetId) external view returns (Types.AssetState memory state) {
        state = _assetStates[assetId];
        if (state.nextNonce == 0) state.nextNonce = 1;
    }

    function sessionPhase(bytes32 sessionId) external view returns (Types.SessionPhase) {
        return _sessions[sessionId].phase;
    }

    function sessionFact(bytes32 sessionId) external view returns (Types.SessionFact memory) {
        return _sessions[sessionId];
    }

    function benchmarkOf(bytes32 sessionId) external view returns (Types.Benchmark memory) {
        return _benchmarks[sessionId];
    }

    function latestCorporateAction(bytes32 assetId) external view returns (Types.CorporateActionFact memory) {
        return _corporateActions[assetId];
    }

    function latestReference(bytes32 assetId) external view returns (Types.ReferencePriceFact memory) {
        return _references[assetId];
    }

    // Bounded inspectable facts for a single pinned CRE chain read. No freshness
    // filtering: a producer must validate the returned evidence and current clock.
    function marketSnapshot(bytes32 assetId, bytes32 sessionId, bytes32 referenceSessionId)
        external
        view
        returns (
            Types.AssetState memory state,
            Types.SessionFact memory session,
            Types.SessionFact memory activeSession,
            Types.Benchmark memory benchmark,
            Types.Benchmark memory referenceBenchmark,
            Types.CorporateActionFact memory corporate,
            Types.ReferencePriceFact memory referenceFact
        )
    {
        state = _assetStates[assetId];
        if (state.nextNonce == 0) state.nextNonce = 1;
        session = _sessions[sessionId];
        activeSession = _sessions[state.activeSessionId];
        benchmark = _benchmarks[sessionId];
        referenceBenchmark = _benchmarks[referenceSessionId];
        corporate = _corporateActions[assetId];
        referenceFact = _references[assetId];
    }

    function requireFreshReference(bytes32 assetId) external view returns (Types.ReferencePriceFact memory fact) {
        fact = _references[assetId];
        Types.AssetState storage state = _assetStates[assetId];
        if (state.halted) revert Errors.AssetHalted(assetId);
        if (
            fact.reportHash == bytes32(0) || _referenceInvalidated[assetId] || fact.sessionId != state.activeSessionId
                || fact.configHash != state.configHash || fact.corporateActionHash != state.latestCorporateActionHash
        ) revert Errors.ReferenceUnavailable(assetId);
        _requireReferenceSessionOpen(assetId, state);
        _requireReferenceTime(fact.observedAt, fact.validUntil);
    }

    function _validateCommon(Types.MarketEventReport calldata report) private view {
        if (report.schemaVersion != Types.REPORT_SCHEMA_VERSION) {
            revert Errors.InvalidSchemaVersion(report.schemaVersion);
        }
        if (report.chainId != block.chainid || report.oracle != address(this)) {
            revert Errors.WrongReportDomain();
        }
        if (report.assetId == bytes32(0)) revert Errors.ZeroAssetId();
        if (report.configHash == bytes32(0)) revert Errors.ZeroConfigHash();
        // forge-lint: disable-next-line(block-timestamp)
        if (report.observedAt > block.timestamp) {
            revert Errors.FutureObservation(report.observedAt, uint64(block.timestamp));
        }
        // forge-lint: disable-next-line(block-timestamp)
        if (report.validUntil < block.timestamp) {
            revert Errors.ReportExpired(report.validUntil, uint64(block.timestamp));
        }
        if (report.primarySourceHash == bytes32(0)) revert Errors.MissingSourceEvidence();

        bool sessionEvent = report.kind == Types.MarketEventKind.SESSION_SCHEDULED
            || report.kind == Types.MarketEventKind.CLOSE_CONFIRMED
            || report.kind == Types.MarketEventKind.REOPEN_BENCHMARK;
        if (sessionEvent && report.sessionId == bytes32(0)) revert Errors.ZeroSessionId();
        if (!sessionEvent && report.sessionId != bytes32(0)) {
            revert Errors.SessionIdentityMismatch(report.sessionId);
        }
    }

    function _acceptScheduled(Types.MarketEventReport calldata report, bytes32 reportHash) private {
        Types.AssetState storage state = _assetStates[report.assetId];
        if (state.activeSessionId != bytes32(0)) {
            Types.SessionPhase activePhase = _sessions[state.activeSessionId].phase;
            if (activePhase != Types.SessionPhase.REOPEN_BENCHMARK) {
                revert Errors.ActiveSessionNotFinal(state.activeSessionId, activePhase);
            }
        }
        Types.SessionFact storage fact = _sessions[report.sessionId];
        if (fact.phase != Types.SessionPhase.NONE) {
            revert Errors.InvalidSessionTransition(fact.phase, report.kind);
        }
        if (report.scheduledOpen <= report.observedAt || report.scheduledClose <= report.scheduledOpen) {
            revert Errors.InvalidSessionTiming();
        }
        fact.assetId = report.assetId;
        fact.configHash = report.configHash;
        fact.scheduledOpen = report.scheduledOpen;
        fact.scheduledClose = report.scheduledClose;
        fact.phase = Types.SessionPhase.SCHEDULED;
        fact.scheduledReportHash = reportHash;
        state.activeSessionId = report.sessionId;
    }

    function _acceptClose(Types.MarketEventReport calldata report, bytes32 reportHash) private {
        Types.SessionFact storage fact = _sessions[report.sessionId];
        if (fact.phase != Types.SessionPhase.SCHEDULED) {
            revert Errors.InvalidSessionTransition(fact.phase, report.kind);
        }
        _requireSessionIdentity(fact, report);
        if (
            report.scheduledOpen != fact.scheduledOpen || report.scheduledClose != fact.scheduledClose
                || report.observedAt < fact.scheduledClose
        ) {
            revert Errors.InvalidSessionTiming();
        }
        fact.closeObservedAt = report.observedAt;
        fact.phase = Types.SessionPhase.CLOSE_CONFIRMED;
        fact.closeReportHash = reportHash;
    }

    function _acceptBenchmark(Types.MarketEventReport calldata report, bytes32 reportHash) private {
        Types.SessionFact storage fact = _sessions[report.sessionId];
        if (fact.phase == Types.SessionPhase.REOPEN_BENCHMARK) {
            revert Errors.FinalBenchmarkAlreadyAccepted(report.sessionId);
        }
        if (fact.phase != Types.SessionPhase.CLOSE_CONFIRMED) {
            revert Errors.InvalidSessionTransition(fact.phase, report.kind);
        }
        _requireSessionIdentity(fact, report);
        if (
            report.scheduledOpen != fact.scheduledOpen || report.scheduledClose != fact.scheduledClose
                || report.observedAt < fact.closeObservedAt
        ) {
            revert Errors.InvalidSessionTiming();
        }
        if (report.benchmarkPrice == 0) revert Errors.ZeroBenchmarkPrice();
        if (
            report.multiplierNumerator == 0 || report.multiplierDenominator == 0
                || report.multiplierNumerator > Types.MAX_MULTIPLIER_COMPONENT
                || report.multiplierDenominator > Types.MAX_MULTIPLIER_COMPONENT
        ) {
            revert Errors.InvalidMultiplier();
        }
        if (report.secondarySourceHash == bytes32(0)) revert Errors.MissingSourceEvidence();

        fact.reopenObservedAt = report.observedAt;
        fact.phase = Types.SessionPhase.REOPEN_BENCHMARK;
        fact.reopenReportHash = reportHash;
        _benchmarks[report.sessionId] = Types.Benchmark({
            finalized: true,
            assetId: report.assetId,
            sessionId: report.sessionId,
            configHash: report.configHash,
            price: report.benchmarkPrice,
            multiplierNumerator: report.multiplierNumerator,
            multiplierDenominator: report.multiplierDenominator,
            observedAt: report.observedAt,
            primarySourceHash: report.primarySourceHash,
            secondarySourceHash: report.secondarySourceHash,
            reportHash: reportHash
        });
    }

    function _acceptReference(Types.MarketEventReport calldata report, bytes32 reportHash) private {
        Types.AssetState storage state = _assetStates[report.assetId];
        Types.SessionFact storage session = _requireReferenceSessionOpen(report.assetId, state);
        if (
            report.scheduledOpen != session.scheduledOpen || report.scheduledClose != session.scheduledClose
                || report.observedAt < session.scheduledOpen || report.observedAt >= session.scheduledClose
        ) revert Errors.InvalidSessionTiming();
        if (report.benchmarkPrice == 0 || report.benchmarkPrice > type(uint96).max) {
            revert Errors.UnsupportedPrice();
        }
        if (report.corporateAction != Types.CorporateAction.NONE || report.actionId != bytes32(0)) {
            revert Errors.InvalidReferenceAction();
        }
        Types.CorporateActionFact storage action = _corporateActions[report.assetId];
        if (action.reportHash != bytes32(0) && report.observedAt < action.observedAt) {
            revert Errors.InvalidSessionTiming();
        }
        uint128 numerator = action.reportHash == bytes32(0) ? 1 : action.multiplierNumerator;
        uint128 denominator = action.reportHash == bytes32(0) ? 1 : action.multiplierDenominator;
        if (report.multiplierNumerator != numerator || report.multiplierDenominator != denominator) {
            revert Errors.InvalidMultiplier();
        }
        if (report.secondarySourceHash == bytes32(0)) revert Errors.MissingSourceEvidence();
        if (report.primarySourceHash == report.secondarySourceHash) revert Errors.DuplicateSourceEvidence();
        _requireReferenceTime(report.observedAt, report.validUntil);
        uint64 previousObservedAt = _references[report.assetId].observedAt;
        if (report.observedAt <= previousObservedAt) {
            revert Errors.NonMonotonicReference(previousObservedAt, report.observedAt);
        }
        _references[report.assetId] = Types.ReferencePriceFact({
            assetId: report.assetId,
            sessionId: state.activeSessionId,
            configHash: report.configHash,
            price: report.benchmarkPrice,
            multiplierNumerator: report.multiplierNumerator,
            multiplierDenominator: report.multiplierDenominator,
            observedAt: report.observedAt,
            validUntil: report.validUntil,
            corporateActionHash: state.latestCorporateActionHash,
            primarySourceHash: report.primarySourceHash,
            secondarySourceHash: report.secondarySourceHash,
            reportHash: reportHash
        });
        _referenceInvalidated[report.assetId] = false;
    }

    function _requireReferenceSessionOpen(bytes32 assetId, Types.AssetState storage state)
        private
        view
        returns (Types.SessionFact storage session)
    {
        if (state.halted) revert Errors.AssetHalted(assetId);
        session = _sessions[state.activeSessionId];
        if (
            state.activeSessionId == bytes32(0) || session.phase != Types.SessionPhase.SCHEDULED
                || session.assetId != assetId || session.configHash != state.configHash
                || block.timestamp < session.scheduledOpen || block.timestamp >= session.scheduledClose
        ) revert Errors.ReferenceSessionNotOpen(state.activeSessionId);
    }

    function _requireReferenceTime(uint64 observedAt, uint64 validUntil) private view {
        if (observedAt > block.timestamp) {
            revert Errors.FutureObservation(observedAt, uint64(block.timestamp));
        }
        if (validUntil < block.timestamp) revert Errors.ReportExpired(validUntil, uint64(block.timestamp));
        if (block.timestamp - observedAt > MAX_REFERENCE_AGE) {
            revert Errors.StaleReference(observedAt, uint64(block.timestamp));
        }
        if (validUntil < observedAt || uint256(validUntil) > uint256(observedAt) + MAX_REFERENCE_AGE) {
            revert Errors.InvalidReferenceValidity();
        }
    }

    function _acceptCorporateAction(Types.MarketEventReport calldata report, bytes32 reportHash) private {
        if (
            report.corporateAction != Types.CorporateAction.SPLIT
                && report.corporateAction != Types.CorporateAction.REVERSE_SPLIT
        ) {
            revert Errors.UnsupportedCorporateAction(report.corporateAction);
        }
        if (report.actionId == bytes32(0)) revert Errors.ZeroActionId();
        if (
            report.multiplierNumerator == 0 || report.multiplierDenominator == 0
                || report.multiplierNumerator > Types.MAX_MULTIPLIER_COMPONENT
                || report.multiplierDenominator > Types.MAX_MULTIPLIER_COMPONENT
        ) {
            revert Errors.InvalidMultiplier();
        }
        _corporateActions[report.assetId] = Types.CorporateActionFact({
            action: report.corporateAction,
            actionId: report.actionId,
            multiplierNumerator: report.multiplierNumerator,
            multiplierDenominator: report.multiplierDenominator,
            observedAt: report.observedAt,
            reportHash: reportHash
        });
        _assetStates[report.assetId].latestCorporateActionHash = reportHash;
    }

    function _acceptHalt(Types.MarketEventReport calldata report) private {
        _assetStates[report.assetId].halted = report.halted;
        if (report.halted) _referenceInvalidated[report.assetId] = true;
    }

    function _requireSessionIdentity(Types.SessionFact storage fact, Types.MarketEventReport calldata report)
        private
        view
    {
        if (fact.assetId != report.assetId) revert Errors.SessionIdentityMismatch(report.sessionId);
        if (fact.configHash != report.configHash) {
            revert Errors.AssetConfigMismatch(fact.configHash, report.configHash);
        }
    }
}
