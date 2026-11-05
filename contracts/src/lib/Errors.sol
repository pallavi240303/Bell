// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Types} from "./Types.sol";

library Errors {
    error Unauthorized(address caller);
    error UnauthorizedReceiver(address caller);
    error ZeroAddress();
    error ZeroAssetId();
    error ZeroSessionId();
    error ZeroConfigHash();
    error InvalidEffectiveTime(uint64 effectiveAt);
    error InvalidDecimals(uint8 stockTokenDecimals, uint8 cashTokenDecimals);
    error InvalidLtvOrder(uint16 originationLtvBps, uint16 targetLtvBps, uint16 triggerLtvBps);
    error InvalidRate(uint32 rateNumerator, uint64 rateDenominator);
    error InvalidMaxFills(uint8 maxFills);
    error InvalidMaxActiveReceipts(uint8 maxActiveReceipts);
    error UnsupportedCorporateActions(uint8 actionMask);
    error UnknownConfig(bytes32 assetId, uint64 version);
    error ReceiverAlreadyBound();
    error InvalidSchemaVersion(uint8 version);
    error InvalidReportKind();
    error WrongReportDomain();
    error ReportExpired(uint64 validUntil, uint64 currentTime);
    error FutureObservation(uint64 observedAt, uint64 currentTime);
    error InvalidNonce(uint64 expected, uint64 actual);
    error InvalidPreviousState(bytes32 expected, bytes32 actual);
    error InvalidSessionTiming();
    error InvalidSessionTransition(Types.SessionPhase current, Types.MarketEventKind attempted);
    error ActiveSessionNotFinal(bytes32 sessionId, Types.SessionPhase phase);
    error SessionIdentityMismatch(bytes32 sessionId);
    error AssetConfigMismatch(bytes32 expected, bytes32 actual);
    error FinalBenchmarkAlreadyAccepted(bytes32 sessionId);
    error ZeroBenchmarkPrice();
    error InvalidMultiplier();
    error MissingSourceEvidence();
    error UnsupportedCorporateAction(Types.CorporateAction action);
    error ZeroActionId();
}
