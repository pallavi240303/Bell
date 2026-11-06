import { keccak256, toHex, zeroHash } from 'viem';
import replay from '../fixtures/reopen.json' with { type: 'json' };
export const hash = (s: string) => keccak256(toHex(s));
export const address = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as const;
export function fixture() {
    const assetId = hash('asset');
    const sessionId = hash('session');
    const configHash = hash('asset-config');
    const providers = Object.fromEntries(['calendar', 'primary', 'secondary', 'corporate'].map((id) => [id, { id, url: `https://${id}.example/evidence` }]));
    const config = {
        mode: 'replay', chainName: 'local-test', chainSelector: '1', chainId: '31337',
        oracle: address(1), registry: address(2), configVersion: '1', assetId, sessionId,
        referenceSessionId: hash('previous-session'), liveReceiver: address(3), simulationReceiver: address(4),
        liveForwarder: address(5), simulationForwarder: address(6), workflowId: hash('workflow'), workflowOwner: address(7),
        cron: '*/30 * * * * *', maxAgeSeconds: '1800', maxValiditySeconds: '1800',
        agreementBps: '100', extremeMoveBps: '2000', maxReadAttempts: 3, gasLimit: '1000000', providers,
    };
    const bundle = structuredClone(replay);
    const state = {
        chainId: '31337', oracle: address(1), receiver: address(4), forwarder: address(6),
        workflowId: hash('workflow'), workflowOwner: address(7), assetId, registryConfigHash: configHash, configEffectiveAt: '1', supportedCorporateActions: 6,
        nextNonce: '3', stateHash: hash('closed-state'), configHash, activeSessionId: sessionId, activePhase: 2, halted: false,
        session: { assetId, configHash, scheduledOpen: '800', scheduledClose: '900', closeObservedAt: '900', phase: 2 },
        benchmarkFinalized: false, referencePrice: '140000000',
        corporate: { action: 0, actionId: zeroHash, multiplierNumerator: '0', multiplierDenominator: '0', observedAt: '0', reportHash: zeroHash },
        latestCorporateActionHash: zeroHash,
        activeSession: { assetId, configHash, scheduledOpen: '800', scheduledClose: '900', closeObservedAt: '900', phase: 2 },
        latestReference: { assetId: zeroHash, sessionId: zeroHash, configHash: zeroHash, price: '0', multiplierNumerator: '0', multiplierDenominator: '0', observedAt: '0', validUntil: '0', corporateActionHash: zeroHash, primarySourceHash: zeroHash, secondarySourceHash: zeroHash, reportHash: zeroHash },
    };
    return { config, bundle, state, now: 1000n };
}
