import { parseAbi, type Abi, type AbiFunction } from 'viem';
// Read-only mirrors of the finalized contracts; checked against forge artifacts in tests.
const signatures: string[] = [
    'function latestReference(bytes32 assetId) view returns ((bytes32 assetId,bytes32 sessionId,bytes32 configHash,uint256 price,uint128 multiplierNumerator,uint128 multiplierDenominator,uint64 observedAt,uint64 validUntil,bytes32 corporateActionHash,bytes32 primarySourceHash,bytes32 secondarySourceHash,bytes32 reportHash))',
    'function assetState(bytes32 assetId) view returns ((uint64 nextNonce,bytes32 stateHash,bytes32 configHash,bytes32 activeSessionId,bool halted,bytes32 latestCorporateActionHash))',
    'function sessionPhase(bytes32 sessionId) view returns (uint8)',
    'function sessionFact(bytes32 sessionId) view returns ((bytes32 assetId,bytes32 configHash,uint64 scheduledOpen,uint64 scheduledClose,uint64 closeObservedAt,uint64 reopenObservedAt,uint8 phase,bytes32 scheduledReportHash,bytes32 closeReportHash,bytes32 reopenReportHash))',
    'function benchmarkOf(bytes32 sessionId) view returns ((bool finalized,bytes32 assetId,bytes32 sessionId,bytes32 configHash,uint256 price,uint128 multiplierNumerator,uint128 multiplierDenominator,uint64 observedAt,bytes32 primarySourceHash,bytes32 secondarySourceHash,bytes32 reportHash))',
    'function latestCorporateAction(bytes32 assetId) view returns ((uint8 action,bytes32 actionId,uint128 multiplierNumerator,uint128 multiplierDenominator,uint64 observedAt,bytes32 reportHash))',
    'function getConfig(bytes32 assetId,uint64 version) view returns ((address assetToken,uint8 stockTokenDecimals,uint8 cashTokenDecimals,uint16 originationLtvBps,uint16 targetLtvBps,uint16 triggerLtvBps,uint32 rateNumerator,uint64 rateDenominator,uint8 maxFills,uint8 maxActiveReceipts,uint8 supportedCorporateActions),uint64 effectiveAt,bytes32 identity)',
    'function receiver() view returns (address)', 'function oracle() view returns (address)',
    'function forwarder() view returns (address)', 'function workflowId() view returns (bytes32)', 'function workflowOwner() view returns (address)',
];
const getters: Abi = parseAbi(signatures);
const output = (getter: string, name: string) => {
    const fn = getters.find(item => item.type === 'function' && item.name === getter) as AbiFunction;
    return { ...fn.outputs[0]!, name };
};
// Compose the aggregate from the same small tuples. Parsing a single66-word
// signature recursively exhausts Javy's stack before workflow subscription.
export const readAbi: Abi = [...getters, {
    type: 'function', name: 'marketSnapshot', stateMutability: 'view',
    inputs: ['assetId', 'sessionId', 'referenceSessionId'].map(name => ({ name, type: 'bytes32' })),
    outputs: [output('assetState', 'state'), output('sessionFact', 'session'), output('sessionFact', 'activeSession'),
        output('benchmarkOf', 'benchmark'), output('benchmarkOf', 'referenceBenchmark'),
        output('latestCorporateAction', 'corporate'), output('latestReference', 'referenceFact')],
}];
