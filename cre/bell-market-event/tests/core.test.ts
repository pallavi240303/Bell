import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeAbiParameters, keccak256, parseAbiParameters, zeroHash } from 'viem';
import { decide, encodeReport, configurationHash, execute } from '../src/core.ts';
import { fixture, hash, address } from './fixtures.ts';
test('valid reopen produces the exact 21-word Solidity payload with Arc identity', () => {
    const f = fixture();
    const d = decide(f.config, f.bundle, f.state, f.now);
    assert.equal(d?.status, 'submit');
    const bytes = encodeReport(d.report);
    assert.equal((bytes.length - 2) / 2, 672);
    const fields = decodeAbiParameters(parseAbiParameters('uint8,uint8,uint256,address,bytes32,bytes32,bytes32,uint64,bytes32,uint64,uint64,uint64,uint64,uint256,uint8,bytes32,uint128,uint128,bool,bytes32,bytes32'), bytes);
    assert.deepEqual(fields, [1, 3, 31337n, address(1), f.state.assetId, f.bundle.sessionId, f.state.configHash, 3n, f.state.stateHash, 1000n, 1100n, 800n, 900n, 125000000n, 0, zeroHash, 1n, 1n, false, hash('primary'), hash('secondary')]);
    assert.equal(d.reportHash, keccak256(bytes));
});
const invalid: [
    string,
    (f: ReturnType<typeof fixture>) => void
][] = [
    ['unapproved credential configuration', f => { (f.config.providers.primary as any).secretName = 'PROVIDER_KEY'; }],
    ['missing primary', f => { delete (f.bundle as any).primary; }],
    ['missing time', f => { delete (f.bundle.primary as any).observedAt; }],
    ['future time', f => { f.bundle.primary.observedAt = '1001'; }],
    ['stale calendar', f => { f.now = 3000n; }],
    ['expired validity', f => { f.bundle.calendar.validUntil = '999'; }],
    ['excess validity', f => { f.bundle.calendar.validUntil = '999999'; }],
    ['wrong asset', f => { f.bundle.assetId = hash('wrong'); }],
    ['wrong session', f => { f.bundle.sessionId = hash('wrong'); }],
    ['wrong config', f => { f.bundle.configHash = hash('wrong'); }],
    ['wrong chain', f => { f.state.chainId = '1'; }],
    ['wrong oracle', f => { f.state.oracle = address(99); }],
    ['wrong receiver', f => { f.state.receiver = f.config.liveReceiver; }],
    ['wrong forwarder', f => { f.state.forwarder = f.config.liveForwarder; }],
    ['inactive config', f => { f.state.configEffectiveAt = '1001'; }],
    ['unpinned config', f => { f.state.configHash = hash('wrong'); }],
    ['wrong session fact identity', f => { f.state.session.assetId = hash('wrong'); }],
    ['wrong active session', f => { f.state.activeSessionId = hash('wrong'); }],
    ['invalid transition', f => { f.state.session.phase = 1; }],
    ['closed market', f => { f.bundle.calendar.status = 'CLOSED'; }],
    ['halted asset', f => { f.state.halted = true; }],
    ['reopen too early', f => { f.bundle.calendar.scheduledReopen = '1001'; }],
    ['changed schedule', f => { f.bundle.calendar.scheduledClose = '901'; }],
    ['zero price', f => { f.bundle.primary.price = '0'; }],
    ['missing reference', f => { f.state.referencePrice = '0'; }],
    ['zero numerator', f => { f.bundle.corporate.multiplierNumerator = '0'; }],
    ['wrong multiplier', f => { f.bundle.corporate.multiplierNumerator = '2'; }],
    ['missing corporate action', f => { delete (f.bundle as any).corporate; }],
    ['missing secondary', f => { delete (f.bundle as any).secondary; }],
    ['duplicate provider', f => { f.bundle.secondary.providerId = 'primary'; }],
    ['duplicate URL', f => { f.bundle.secondary.url = f.bundle.primary.url; }],
    ['duplicate hash', f => { f.bundle.secondary.responseHash = f.bundle.primary.responseHash; }],
    ['missing primary hash', f => { f.bundle.primary.responseHash = zeroHash; }],
    ['unapproved provider', f => { f.bundle.primary.providerId = 'unknown'; }],
    ['disagreeing prices', f => { f.bundle.secondary.price = '126250001'; }],
    ['stale secondary', f => { f.bundle.secondary.observedAt = '0'; }],
    ['secondary predates official reopen', f => { f.bundle.secondary.observedAt = '999'; }],
    ['same origin posing as another provider', f => { f.config.providers.secondary.url = 'https://primary.example/other'; f.bundle.secondary.url = f.config.providers.secondary.url; }],
    ['extreme uncorroborated', f => { f.state.referencePrice = '200000000'; f.bundle.secondary.corroborated = false; }],
    ['unsafe integer', f => { f.bundle.primary.price = '1.5'; }],
    ['nonce overflow', f => { f.state.nextNonce = (2n ** 64n - 1n).toString(); }],
];
for (const [name, mutate] of invalid)
    test(`rejects ${name}`, () => {
        const f = fixture();
        mutate(f);
        assert.equal(decide(f.config, f.bundle, f.state, f.now)?.status, 'reject');
    });
test('agreement boundary and independently corroborated extreme moves pass', () => {
    const f = fixture();
    f.bundle.secondary.price = '126250000';
    f.state.referencePrice = '200000000';
    assert.equal(decide(f.config, f.bundle, f.state, f.now)?.status, 'submit');
});
test('every session transition and finalized no-submit follows oracle phases', () => {
    const f = fixture();
    f.bundle.kind = 1;
    f.bundle.calendar.status = 'SCHEDULED';
    f.bundle.calendar.scheduledOpen = '1010';
    f.bundle.calendar.scheduledClose = '1020';
    f.bundle.calendar.scheduledReopen = '1030';
    f.state.activeSessionId = zeroHash;
    f.state.activePhase = 0;
    f.state.session.phase = 0;
    assert.equal(decide(f.config, f.bundle, f.state, f.now)?.status, 'submit');
    f.state.activeSessionId = hash('prior');
    f.state.activePhase = 2;
    assert.equal(decide(f.config, f.bundle, f.state, f.now)?.status, 'reject');
    f.state.activePhase = 3;
    assert.equal(decide(f.config, f.bundle, f.state, f.now)?.status, 'submit');
    const c = fixture();
    c.bundle.kind = 2;
    c.bundle.calendar.status = 'CLOSED';
    c.state.session.phase = 1;
    assert.equal(decide(c.config, c.bundle, c.state, c.now)?.status, 'submit');
    c.state.session.phase = 2;
    assert.equal(decide(c.config, c.bundle, c.state, c.now)?.status, 'noop');
    const r = fixture();
    r.state.benchmarkFinalized = true;
    r.state.session.phase = 3;
    assert.equal(decide(r.config, r.bundle, r.state, r.now)?.status, 'noop');
});
test('split, reverse split and halt facts have asset-level session identity', () => {
    for (const action of [1, 2]) {
        const f = fixture();
        f.bundle.kind = 4;
        f.bundle.sessionId = zeroHash;
        f.bundle.corporate.action = action;
        f.bundle.corporate.actionId = hash('split');
        f.bundle.corporate.multiplierNumerator = action === 1 ? '10' : '1';
        f.bundle.corporate.multiplierDenominator = action === 1 ? '1' : '10';
        assert.equal(decide(f.config, f.bundle, f.state, f.now)?.status, 'submit');
        f.bundle.corporate.action = 3;
        assert.equal(decide(f.config, f.bundle, f.state, f.now)?.status, 'reject');
    }
    const f = fixture();
    f.bundle.kind = 5;
    f.bundle.sessionId = zeroHash;
    f.bundle.calendar.status = 'HALTED';
    assert.equal(decide(f.config, f.bundle, f.state, f.now)?.report.halted, true);
    f.state.halted = true;
    assert.equal(decide(f.config, f.bundle, f.state, f.now)?.status, 'noop');
});
test('canonical workflow hash ignores object insertion order but includes policy and mode', () => {
    const f = fixture();
    const h = configurationHash(f.config);
    assert.match(h ?? '', /^0x[0-9a-f]{64}$/);
    assert.equal(h, configurationHash(Object.fromEntries(Object.entries(f.config).reverse())));
    assert.notEqual(h, configurationHash({ ...f.config, agreementBps: '99' }));
    assert.notEqual(h, configurationHash({ ...f.config, mode: 'live' }));
});
test('corporate action multipliers are cumulative facts, not inferred per-action ratios', () => {
    const f = fixture();
    f.bundle.kind = 4;
    f.bundle.sessionId = zeroHash;
    f.bundle.corporate.action = 2;
    f.bundle.corporate.actionId = hash('reverse-after-split');
    f.bundle.corporate.multiplierNumerator = '2';
    f.bundle.corporate.multiplierDenominator = '1';
    f.state.corporate = { action: 1, actionId: hash('prior-split'), multiplierNumerator: '10', multiplierDenominator: '1', observedAt: '900' };
    assert.equal(decide(f.config, f.bundle, f.state, f.now)?.status, 'submit');
});
test('one path gives live/replay identical payloads and mode-specific targets', () => {
    const f = fixture();
    const reports: any[] = [];
    for (const mode of ['live', 'replay']) {
        const config = { ...f.config, mode };
        const state = { ...f.state, receiver: mode === 'live' ? config.liveReceiver : config.simulationReceiver, forwarder: mode === 'live' ? config.liveForwarder : config.simulationForwarder };
        const result = execute(config, { now: () => f.now, readState: () => state, observe: () => f.bundle, submit: (target: string, payload: string) => { reports.push({ target, payload }); return { status: 'success', txHash: hash('tx') }; }, log: () => { } });
        assert.equal(result?.status, 'submitted');
    }
    assert.equal(reports[0].payload, reports[1].payload);
    assert.deepEqual(reports.map(r => r.target), [f.config.liveReceiver, f.config.simulationReceiver]);
});
test('read retries are bounded, state reread stops races, and ambiguous writes never retry', () => {
    const f = fixture();
    let reads = 0, writes = 0;
    const logs: string[] = [];
    const ports = { now: () => f.now, readState: () => { reads++; if (reads < 3)
            throw new Error('SECRET'); return f.state; }, observe: () => f.bundle, submit: () => { writes++; throw new Error('SECRET'); }, log: (s: string) => logs.push(s) };
    assert.equal(execute(f.config, ports)?.status, 'unknown');
    assert.equal(reads, 4);
    assert.equal(writes, 1);
    assert.ok(!logs.join().includes('SECRET'));
    reads = 0;
    writes = 0;
    ports.readState = () => { reads++; return reads === 1 ? f.state : { ...f.state, nextNonce: '4', stateHash: hash('advanced') }; };
    assert.equal(execute(f.config, ports)?.status, 'noop');
    assert.equal(writes, 0);
    ports.readState = () => { reads++; throw new Error('SECRET'); };
    reads = 0;
    assert.equal(execute(f.config, ports)?.status, 'unavailable');
    assert.equal(reads, 3);
});
