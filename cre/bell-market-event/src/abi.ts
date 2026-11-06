import { parseAbi } from 'viem';
// Read-only mirrors of the finalized contracts; checked against forge artifacts in tests.
export const readAbi = parseAbi([
    'function assetState(bytes32 assetId) view returns ((uint64 nextNonce,bytes32 stateHash,bytes32 configHash,bytes32 activeSessionId,bool halted,bytes32 latestCorporateActionHash))',
    'function sessionPhase(bytes32 sessionId) view returns (uint8)',
    'function sessionFact(bytes32 sessionId) view returns ((bytes32 assetId,bytes32 configHash,uint64 scheduledOpen,uint64 scheduledClose,uint64 closeObservedAt,uint64 reopenObservedAt,uint8 phase,bytes32 scheduledReportHash,bytes32 closeReportHash,bytes32 reopenReportHash))',
    'function benchmarkOf(bytes32 sessionId) view returns ((bool finalized,bytes32 assetId,bytes32 sessionId,bytes32 configHash,uint256 price,uint128 multiplierNumerator,uint128 multiplierDenominator,uint64 observedAt,bytes32 primarySourceHash,bytes32 secondarySourceHash,bytes32 reportHash))',
    'function latestCorporateAction(bytes32 assetId) view returns ((uint8 action,bytes32 actionId,uint128 multiplierNumerator,uint128 multiplierDenominator,uint64 observedAt,bytes32 reportHash))',
    'function getConfig(bytes32 assetId,uint64 version) view returns ((address assetToken,uint8 stockTokenDecimals,uint8 cashTokenDecimals,uint16 originationLtvBps,uint16 targetLtvBps,uint16 triggerLtvBps,uint32 rateNumerator,uint64 rateDenominator,uint8 maxFills,uint8 maxActiveReceipts,uint8 supportedCorporateActions),uint64 effectiveAt,bytes32 identity)',
    'function receiver() view returns (address)', 'function oracle() view returns (address)',
    'function forwarder() view returns (address)', 'function workflowId() view returns (bytes32)', 'function workflowOwner() view returns (address)',
]);
