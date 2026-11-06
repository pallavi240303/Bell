import { keccak256, toHex, zeroHash, type Hex } from 'viem';
import { bundleSchema, stateSchema, type Config, type ObservationBundle, type ArcState } from './schema.ts';
import { canonical, validateConfig } from './core.ts';
function object(value: unknown): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new Error('INVALID_RESPONSE');
    return value as Record<string, unknown>;
}
export function publicEvidence(c: Config, key: keyof Config['providers'], raw: string): Record<string, unknown> {
    if (raw.length > 32768) throw new Error('RESPONSE_TOO_LARGE');
    return { ...object(JSON.parse(raw)), providerId: c.providers[key].id, url: c.providers[key].url, responseHash: keccak256(toHex(raw)) };
}
export function observeLive(input: unknown, get: (key: keyof Config['providers']) => string): ObservationBundle {
    const c = validateConfig(input);
    function fetch(key: keyof Config['providers']): Record<string, unknown> {
        return publicEvidence(c, key, get(key));
    }
    const calendar = fetch('calendar');
    const b: Record<string, unknown> = { kind: calendar.kind, assetId: calendar.assetId, sessionId: calendar.sessionId, configHash: calendar.configHash, calendar };
    if (calendar.kind === 6) b.sessionId = zeroHash;
    if (calendar.kind === 3 || calendar.kind === 6) {
        b.primary = fetch('primary');
        b.secondary = fetch('secondary');
        b.corporate = fetch('corporate');
    }
    if (calendar.kind === 4)
        b.corporate = fetch('corporate');
    return bundleSchema.parse(b);
}
export const observeReplay = (input: unknown): ObservationBundle => bundleSchema.parse(input);
export type ReadContract = (target: Hex, method: string, args: readonly unknown[]) => unknown;
export function readArcState(input: unknown, networkChainId: string, read: ReadContract): ArcState {
    const c = validateConfig(input);
    if (networkChainId !== c.chainId)
        throw new Error('CHAIN_ID_MISMATCH');
    const receiver = c.mode === 'live' ? c.liveReceiver : c.simulationReceiver;
    const oracle = read(receiver, 'oracle', []);
    if (typeof oracle !== 'string' || oracle.toLowerCase() !== c.oracle)
        throw new Error('ORACLE_MISMATCH');
    const s = object(read(c.oracle, 'assetState', [c.assetId]));
    const aggregate = read(c.oracle, 'marketSnapshot', [c.assetId, c.sessionId, c.referenceSessionId]);
    if (!Array.isArray(aggregate) || aggregate.length !== 7) throw new Error('INVALID_SNAPSHOT_RESPONSE');
    const normalize = (v: unknown) => JSON.parse(JSON.stringify(v, (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value));
    if (canonical(normalize(s)) !== canonical(normalize(aggregate[0]))) throw new Error('ARC_STATE_INCONSISTENT');
    const session = object(aggregate[1]), activeSession = object(aggregate[2]);
    const activePhase = s.activeSessionId === zeroHash ? 0 : activeSession.phase;
    const benchmark = object(aggregate[3]), corporate = object(aggregate[5]), latestReference = object(aggregate[6]);
    const config = read(c.registry, 'getConfig', [c.assetId, BigInt(c.configVersion)]);
    if (!Array.isArray(config) || config.length !== 3)
        throw new Error('INVALID_CONFIG_RESPONSE');
    let referencePrice: unknown = '0';
    if (c.referenceSessionId !== zeroHash && c.referenceSessionId !== c.sessionId) {
        const ref = object(aggregate[4]);
        if (ref.finalized === true && ref.assetId === c.assetId && ref.sessionId === c.referenceSessionId)
            referencePrice = ref.price;
    }
    const raw = { chainId: networkChainId, oracle, receiver: read(c.oracle, 'receiver', []), forwarder: read(receiver, 'forwarder', []), workflowId: c.mode === 'live' ? read(receiver, 'workflowId', []) : c.workflowId, workflowOwner: c.mode === 'live' ? read(receiver, 'workflowOwner', []) : c.workflowOwner, assetId: c.assetId, registryConfigHash: config[2], configEffectiveAt: config[1], supportedCorporateActions: object(config[0]).supportedCorporateActions, ...s, session, activePhase, benchmarkFinalized: benchmark.finalized, referencePrice, corporate, activeSession, latestReference };
    // ABI uint64+ values become decimal strings; enum/uint8 fields remain numbers.
    return stateSchema.parse(JSON.parse(JSON.stringify(raw, (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value)));
}
