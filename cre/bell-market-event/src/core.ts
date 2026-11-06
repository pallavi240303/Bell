import { encodeAbiParameters, keccak256, parseAbiParameters, toHex, zeroAddress, zeroHash, type Hex } from 'viem';
import { configSchema, bundleSchema, stateSchema, type Config, type Evidence, type ArcState, type ObservationBundle } from './schema.ts';
export const reportAbi = parseAbiParameters('uint8 schemaVersion,uint8 kind,uint256 chainId,address oracle,bytes32 assetId,bytes32 sessionId,bytes32 configHash,uint64 nonce,bytes32 previousStateHash,uint64 observedAt,uint64 validUntil,uint64 scheduledOpen,uint64 scheduledClose,uint256 benchmarkPrice,uint8 corporateAction,bytes32 actionId,uint128 multiplierNumerator,uint128 multiplierDenominator,bool halted,bytes32 primarySourceHash,bytes32 secondarySourceHash');
export interface MarketEventReport {
    schemaVersion: number;
    kind: number;
    chainId: bigint;
    oracle: Hex;
    assetId: Hex;
    sessionId: Hex;
    configHash: Hex;
    nonce: bigint;
    previousStateHash: Hex;
    observedAt: bigint;
    validUntil: bigint;
    scheduledOpen: bigint;
    scheduledClose: bigint;
    benchmarkPrice: bigint;
    corporateAction: number;
    actionId: Hex;
    multiplierNumerator: bigint;
    multiplierDenominator: bigint;
    halted: boolean;
    primarySourceHash: Hex;
    secondarySourceHash: Hex;
}
export function encodeReport(r: MarketEventReport): Hex {
    return encodeAbiParameters(reportAbi, [r.schemaVersion, r.kind, r.chainId, r.oracle, r.assetId, r.sessionId, r.configHash, r.nonce, r.previousStateHash, r.observedAt, r.validUntil, r.scheduledOpen, r.scheduledClose, r.benchmarkPrice, r.corporateAction, r.actionId, r.multiplierNumerator, r.multiplierDenominator, r.halted, r.primarySourceHash, r.secondarySourceHash]);
}
// Canonical JSON: recursively sorted object keys, array order retained, no whitespace.
export function canonical(value: unknown): string {
    if (Array.isArray(value))
        return `[${value.map(canonical).join(',')}]`;
    if (value !== null && typeof value === 'object')
        return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
    const result = JSON.stringify(value);
    if (result === undefined)
        throw new Error('INVALID_CONFIG');
    return result;
}
export const configurationHash = (config: unknown): Hex => keccak256(toHex(canonical(configSchema.parse(config))));
function requireThat(condition: unknown, code: string): asserts condition { if (!condition)
    throw new Error(code); }
const bounded = (n: string, bits: number, positive = false): bigint => { const v = BigInt(n); requireThat(v < 2n ** BigInt(bits) && (!positive || v > 0n), 'INTEGER_RANGE'); return v; };
const delta = (a: bigint, b: bigint) => a > b ? a - b : b - a;
export type Decision = {
    status: 'submit';
    report: MarketEventReport;
    reportHash: Hex;
} | {
    status: 'reject' | 'noop';
    reason: string;
};
export function validateConfig(input: unknown): Config {
    const c = configSchema.parse(input);
    for (const h of [c.assetId, c.sessionId, c.workflowId])
        requireThat(h !== zeroHash, 'CONFIG_IDENTITY');
    for (const a of [c.oracle, c.registry, c.liveReceiver, c.simulationReceiver, c.liveForwarder, c.simulationForwarder, c.workflowOwner])
        requireThat(a !== zeroAddress, 'CONFIG_IDENTITY');
    requireThat(c.liveReceiver !== c.simulationReceiver && c.liveForwarder !== c.simulationForwarder, 'MODE_ISOLATION');
    bounded(c.chainId, 256, true);
    bounded(c.chainSelector, 64, true);
    bounded(c.configVersion, 64, true);
    bounded(c.gasLimit, 64, true);
    bounded(c.maxAgeSeconds, 64, true);
    bounded(c.maxValiditySeconds, 64, true);
    requireThat(BigInt(c.agreementBps) <= 10000n && BigInt(c.extremeMoveBps) <= 10000n, 'POLICY_RANGE');
    for (const key of ['calendar', 'primary', 'secondary', 'corporate'] as const) {
        const u = new URL(c.providers[key].url);
        requireThat(u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash, 'PUBLIC_ENDPOINT');
    }
    return c;
}
function source(e: Evidence | undefined, key: keyof Config['providers'], c: Config, now: bigint): Evidence {
    requireThat(e, 'MISSING_EVIDENCE');
    requireThat(e.providerId === c.providers[key].id && e.url === c.providers[key].url && e.responseHash !== zeroHash, 'SOURCE_IDENTITY');
    const t = bounded(e.observedAt, 64, true);
    requireThat(t <= now && now - t <= BigInt(c.maxAgeSeconds), 'SOURCE_FRESHNESS');
    return e;
}
export function decide(config: unknown, bundle: unknown, state: unknown, now: bigint): Decision {
    try {
        return validate(validateConfig(config), bundleSchema.parse(bundle), stateSchema.parse(state), now);
    }
    catch (error) {
        return { status: 'reject', reason: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'INVALID_SCHEMA' };
    }
}
function validate(c: Config, b: ObservationBundle, s: ArcState, now: bigint): Decision {
    requireThat(now > 0n && now < 2n ** 64n, 'RUNTIME_TIME');
    requireThat(s.chainId === c.chainId && s.oracle === c.oracle && s.assetId === c.assetId && b.assetId === s.assetId, 'ARC_DOMAIN');
    const target = c.mode === 'live' ? c.liveReceiver : c.simulationReceiver;
    requireThat(s.receiver === target && s.forwarder === (c.mode === 'live' ? c.liveForwarder : c.simulationForwarder), 'ARC_RECEIVER');
    if (c.mode === 'live')
        requireThat(s.workflowId === c.workflowId && s.workflowOwner === c.workflowOwner, 'WORKFLOW_IDENTITY');
    requireThat(s.registryConfigHash !== zeroHash && s.registryConfigHash === b.configHash && BigInt(s.configEffectiveAt) <= now, 'CONFIG_IDENTITY');
    if (b.kind !== 1 && s.configHash !== zeroHash)
        requireThat(s.configHash === b.configHash, 'CONFIG_IDENTITY');
    const sessionEvent = b.kind <= 3;
    requireThat(b.sessionId === (sessionEvent ? c.sessionId : zeroHash), 'SESSION_IDENTITY');
    // Bundle identity is supplied by the calendar adapter and bound to Arc above.
    // Each provider must independently name the same fact; never infer its identity.
    if (b.kind === 3) {
        requireThat(b.primary && b.secondary, 'MISSING_EVIDENCE');
        for (const benchmark of [b.primary, b.secondary])
            requireThat(benchmark.assetId === b.assetId && benchmark.sessionId === b.sessionId, 'BENCHMARK_EVIDENCE_IDENTITY');
    }
    if (b.kind === 3 || b.kind === 4)
        requireThat(b.corporate && b.corporate.assetId === b.assetId, 'CORPORATE_EVIDENCE_IDENTITY');
    const nonce = bounded(s.nextNonce, 64, true);
    requireThat(nonce < 2n ** 64n - 1n, 'NONCE_EXHAUSTED');
    const cal = source(b.calendar, 'calendar', c, now);
    const primary = b.kind === 3 ? source(b.primary, 'primary', c, now) : b.kind === 4 ? source(b.corporate, 'corporate', c, now) : cal;
    const observedAt = BigInt(primary.observedAt), validUntil = bounded(b.calendar.validUntil, 64, true);
    requireThat(validUntil >= now && validUntil >= observedAt && validUntil - observedAt <= BigInt(c.maxValiditySeconds), 'VALIDITY');
    const open = bounded(b.calendar.scheduledOpen, 64), close = bounded(b.calendar.scheduledClose, 64), reopen = bounded(b.calendar.scheduledReopen, 64);
    let price = 0n, num = 0n, den = 0n, action = 0, actionId: Hex = zeroHash, secondary: Hex = zeroHash;
    if (b.kind === 1) {
        if (s.session.phase !== 0)
            return { status: 'noop', reason: 'SESSION_ALREADY_SCHEDULED' };
        requireThat(s.activeSessionId === zeroHash || s.activePhase === 3, 'ACTIVE_SESSION_NOT_FINAL');
        requireThat(b.calendar.status === 'SCHEDULED' && open > observedAt && close > open && reopen >= close, 'CALENDAR_TIMING');
    }
    if (b.kind === 2 || b.kind === 3) {
        requireThat(s.activeSessionId === b.sessionId && s.session.assetId === b.assetId && s.session.configHash === b.configHash, 'SESSION_IDENTITY');
        requireThat(open === BigInt(s.session.scheduledOpen) && close === BigInt(s.session.scheduledClose), 'CALENDAR_TIMING');
        if (b.kind === 2 && s.session.phase >= 2)
            return { status: 'noop', reason: 'CLOSE_ALREADY_FINAL' };
        if (b.kind === 3 && (s.benchmarkFinalized || s.session.phase === 3))
            return { status: 'noop', reason: 'BENCHMARK_ALREADY_FINAL' };
        requireThat(s.session.phase === b.kind - 1, 'SESSION_TRANSITION');
        if (b.kind === 2)
            requireThat(b.calendar.status === 'CLOSED' && observedAt >= close, 'CALENDAR_TIMING');
        else {
            requireThat(!s.halted && b.calendar.status === 'OPEN' && reopen >= close && observedAt >= reopen && observedAt >= BigInt(s.session.closeObservedAt), 'MARKET_STATUS');
            const statusObservedAt = BigInt(b.calendar.observedAt);
            requireThat(statusObservedAt >= reopen && statusObservedAt >= BigInt(s.session.closeObservedAt), 'OPEN_STATUS_TIMING');
            price = bounded(primary.price ?? '0', 256, true);
            const second = source(b.secondary, 'secondary', c, now);
            secondary = second.responseHash;
            requireThat(second.providerId !== primary.providerId && new URL(second.url).origin !== new URL(primary.url).origin && second.responseHash !== primary.responseHash, 'INDEPENDENT_EVIDENCE');
            requireThat(BigInt(second.observedAt) >= reopen && BigInt(second.observedAt) >= BigInt(s.session.closeObservedAt), 'SECONDARY_TIMING');
            const other = bounded(second.price ?? '0', 256, true);
            requireThat(delta(price, other) * 10000n <= price * BigInt(c.agreementBps), 'SOURCE_AGREEMENT');
            const reference = bounded(s.referencePrice, 256, true);
            if (delta(price, reference) * 10000n > reference * BigInt(c.extremeMoveBps))
                requireThat(second.corroborated === true, 'EXTREME_CORROBORATION');
            source(b.corporate, 'corporate', c, now);
            requireThat(b.corporate, 'MISSING_MULTIPLIER');
            num = bounded(b.corporate.multiplierNumerator, 128, true);
            den = bounded(b.corporate.multiplierDenominator, 128, true);
            requireThat(b.corporate.action === s.corporate.action && b.corporate.actionId === s.corporate.actionId, 'CORPORATE_ACTION_IDENTITY');
            const n = s.corporate.action === 0 ? 1n : BigInt(s.corporate.multiplierNumerator), d = s.corporate.action === 0 ? 1n : BigInt(s.corporate.multiplierDenominator);
            requireThat(num === n && den === d, 'MULTIPLIER_MISMATCH');
        }
    }
    if (b.kind === 4) {
        requireThat(b.corporate, 'MISSING_MULTIPLIER');
        action = b.corporate.action;
        actionId = b.corporate.actionId;
        requireThat((action === 1 || action === 2) && (s.supportedCorporateActions & (1 << action)) !== 0, 'UNSUPPORTED_ACTION');
        requireThat(actionId !== zeroHash, 'ACTION_IDENTITY');
        num = bounded(b.corporate.multiplierNumerator, 128, true);
        den = bounded(b.corporate.multiplierDenominator, 128, true);
        if (actionId === s.corporate.actionId)
            return { status: 'noop', reason: 'ACTION_ALREADY_FINAL' };
        requireThat(observedAt >= BigInt(s.corporate.observedAt), 'ACTION_ORDER');
    }
    if (b.kind === 5) {
        requireThat(b.calendar.status === 'HALTED' || b.calendar.status === 'OPEN' || b.calendar.status === 'CLOSED', 'MARKET_STATUS');
        if ((b.calendar.status === 'HALTED') === s.halted)
            return { status: 'noop', reason: 'HALT_ALREADY_FINAL' };
    }
    const report: MarketEventReport = { schemaVersion: 1, kind: b.kind, chainId: BigInt(s.chainId), oracle: s.oracle, assetId: s.assetId, sessionId: b.sessionId, configHash: b.configHash, nonce, previousStateHash: s.stateHash, observedAt, validUntil, scheduledOpen: sessionEvent ? open : 0n, scheduledClose: sessionEvent ? close : 0n, benchmarkPrice: price, corporateAction: action, actionId, multiplierNumerator: num, multiplierDenominator: den, halted: b.kind === 5 && b.calendar.status === 'HALTED', primarySourceHash: primary.responseHash, secondarySourceHash: secondary };
    return { status: 'submit', report, reportHash: keccak256(encodeReport(report)) };
}
export interface Ports {
    now(): bigint;
    readState(): unknown;
    observe(): unknown;
    submit(receiver: Hex, payload: Hex): {
        status: 'success' | 'reverted' | 'fatal' | 'unknown';
        txHash?: Hex;
    };
    log(message: string): void;
}
export interface RunResult {
    status: 'submitted' | 'noop' | 'reject' | 'unavailable' | 'unknown' | 'reverted' | 'fatal';
    reason?: string;
    reportHash?: Hex;
    txHash?: Hex;
}
export function execute(input: unknown, p: Ports): RunResult {
    let c: Config;
    try {
        c = validateConfig(input);
    }
    catch {
        return { status: 'reject', reason: 'INVALID_CONFIG' };
    }
    const log = (result: RunResult, report?: MarketEventReport) => p.log(JSON.stringify({ mode: c.mode, workflowConfigHash: configurationHash(c), ...result, ...(report ? { nonce: report.nonce.toString(), previousStateHash: report.previousStateHash, primarySourceHash: report.primarySourceHash, secondarySourceHash: report.secondarySourceHash } : {}) }));
    // Immediate bounded read retries; the next cron invocation supplies backoff.
    // Never retry a write, including one whose outcome is ambiguous.
    const read = <T>(fn: () => T): T => { for (let i = 1; i <= c.maxReadAttempts; i++) {
        try {
            return fn();
        }
        catch {
            if (i === c.maxReadAttempts)
                throw new Error('UNAVAILABLE');
        }
    } throw new Error('UNAVAILABLE'); };
    let state: ArcState, bundle: unknown;
    try {
        state = stateSchema.parse(read(p.readState));
        bundle = read(p.observe);
    }
    catch {
        const r: RunResult = { status: 'unavailable', reason: 'READ_FAILED' };
        log(r);
        return r;
    }
    let d = decide(c, bundle, state, p.now());
    if (d.status !== 'submit') {
        log(d);
        return d;
    }
    try {
        const fresh = stateSchema.parse(read(p.readState));
        if (fresh.nextNonce !== state.nextNonce || fresh.stateHash !== state.stateHash) {
            const r: RunResult = { status: 'noop', reason: 'ARC_STATE_ADVANCED' };
            log(r);
            return r;
        }
        d = decide(c, bundle, fresh, p.now());
    }
    catch {
        const r: RunResult = { status: 'unavailable', reason: 'READ_FAILED' };
        log(r);
        return r;
    }
    if (d.status !== 'submit') {
        log(d);
        return d;
    }
    try {
        const tx = p.submit(c.mode === 'live' ? c.liveReceiver : c.simulationReceiver, encodeReport(d.report));
        const r: RunResult = { status: tx.status === 'success' ? 'submitted' : tx.status, reportHash: d.reportHash, ...(tx.txHash && /^0x[0-9a-fA-F]{64}$/.test(tx.txHash) ? { txHash: tx.txHash } : {}) };
        log(r, d.report);
        return r;
    }
    catch {
        const r: RunResult = { status: 'unknown', reason: 'WRITE_RESULT_UNKNOWN', reportHash: d.reportHash };
        log(r, d.report);
        return r;
    }
}
