import assert from 'node:assert/strict';
import test from 'node:test';
import { keccak256, toHex, zeroHash } from 'viem';
import { observeLive, observeReplay, readArcState } from '../src/adapters.ts';
import { fixture, hash } from './fixtures.ts';
import { execute } from '../src/core.ts';

for (const mode of ['live', 'replay']) {
    for (const [source, field] of [['primary', 'assetId'], ['primary', 'sessionId'], ['secondary', 'assetId'], ['secondary', 'sessionId'], ['corporate', 'assetId']] as const) {
        for (const mismatch of ['missing', 'conflicting']) test(`${mode} rejects ${mismatch} ${source} ${field} without inferring calendar identity`, () => {
            const f = fixture();
            const config = { ...f.config, mode };
            const state = { ...f.state, receiver: mode === 'live' ? config.liveReceiver : config.simulationReceiver, forwarder: mode === 'live' ? config.liveForwarder : config.simulationForwarder };
            const bundle: any = structuredClone(f.bundle);
            if (mismatch === 'missing') delete bundle[source][field];
            else bundle[source][field] = hash('conflicting-identity');
            const bodies: any = { calendar: { ...bundle.calendar, kind: bundle.kind, assetId: bundle.assetId, sessionId: bundle.sessionId, configHash: bundle.configHash }, primary: bundle.primary, secondary: bundle.secondary, corporate: bundle.corporate };
            const observe = () => mode === 'live' ? observeLive(config, key => JSON.stringify(bodies[key])) : observeReplay(bundle);
            if (mismatch === 'missing') assert.throws(observe, 'missing identities must fail parsing');
            else {
                const parsed = observe();
                assert.equal((parsed[source] as any)[field], hash('conflicting-identity'), 'adapter must preserve claimed identity');
                let writes = 0;
                const result = execute(config, { now: () => f.now, readState: () => state, observe: () => parsed, submit: () => { writes++; return { status: 'success' }; }, log: () => {} });
                assert.equal(result.status, 'reject');
                assert.equal(writes, 0);
            }
        });
    }
}
test('live HTTP responses and replay enter the identical canonical bundle', () => {
    const f = fixture();
    const requests: string[] = [];
    const bodies: any = { calendar: { ...f.bundle.calendar, kind: f.bundle.kind, assetId: f.bundle.assetId, sessionId: f.bundle.sessionId, configHash: f.bundle.configHash }, primary: f.bundle.primary, secondary: f.bundle.secondary, corporate: f.bundle.corporate };
    const live = observeLive(f.config, (key: string) => { requests.push(key); return JSON.stringify(bodies[key]); });
    assert.equal(live?.kind, 3);
    assert.deepEqual(requests, ['calendar', 'primary', 'secondary', 'corporate']);
    assert.equal(live.primary.responseHash, keccak256(toHex(JSON.stringify(bodies.primary))));
    assert.deepEqual(observeReplay(live), live);
    assert.throws(() => observeReplay({ ...live, kind: 99 }));
});
test('HTTP identity comes from configured endpoint and digest, not response claims', () => {
    const f = fixture();
    const bodies: any = { calendar: { ...f.bundle.calendar, kind: 3, assetId: f.bundle.assetId, sessionId: f.bundle.sessionId, configHash: f.bundle.configHash }, primary: { ...f.bundle.primary, providerId: 'attacker', url: 'https://attacker.example', responseHash: zeroHash }, secondary: f.bundle.secondary, corporate: f.bundle.corporate };
    const b = observeLive(f.config, (key: string) => JSON.stringify(bodies[key]));
    assert.equal(b?.primary.providerId, 'primary');
    assert.equal(b.primary.url, f.config.providers.primary.url);
    assert.notEqual(b.primary.responseHash, zeroHash);
});
test('Arc reads bind receiver/oracle/config/state and use a distinct finalized reference', () => {
    const f = fixture();
    const calls: string[] = [];
    const call = (_target: string, method: string, args: any[]) => {
        calls.push(method);
        if (method === 'marketSnapshot') return [call(_target,'assetState',[]),call(_target,'sessionFact',[]),call(_target,'sessionFact',[]),call(_target,'benchmarkOf',[f.config.sessionId]),call(_target,'benchmarkOf',[f.config.referenceSessionId]),call(_target,'latestCorporateAction',[]),f.state.latestReference];
        if (method === 'assetState')
            return { nextNonce: 3n, stateHash: f.state.stateHash, configHash: f.state.configHash, activeSessionId: f.bundle.sessionId, halted: false, latestCorporateActionHash: zeroHash };
        if (method === 'sessionFact')
            return { ...f.state.session, scheduledOpen: 800n, scheduledClose: 900n, closeObservedAt: 900n, reopenObservedAt: 0n, scheduledReportHash: hash('schedule'), closeReportHash: hash('close'), reopenReportHash: zeroHash };
        if (method === 'sessionPhase')
            return 2;
        if (method === 'benchmarkOf')
            return { finalized: args[0] === f.config.referenceSessionId, assetId: f.config.assetId, sessionId: args[0], configHash: f.state.configHash, price: 140000000n, multiplierNumerator: 1n, multiplierDenominator: 1n, observedAt: 800n, primarySourceHash: hash('p'), secondarySourceHash: hash('s'), reportHash: hash('r') };
        if (method === 'getConfig')
            return [{ supportedCorporateActions: 6 }, 1n, f.state.configHash];
        if (method === 'latestCorporateAction')
            return { ...f.state.corporate, multiplierNumerator: 0n, multiplierDenominator: 0n, observedAt: 0n, reportHash: zeroHash };
        return ({ oracle: f.config.oracle, receiver: f.config.simulationReceiver, forwarder: f.config.simulationForwarder, workflowId: f.config.workflowId, workflowOwner: f.config.workflowOwner } as any)[method];
    };
    const state = readArcState(f.config, f.config.chainId, call);
    assert.deepEqual(state, f.state);
    for (const required of ['marketSnapshot', 'assetState', 'sessionFact', 'benchmarkOf', 'getConfig', 'latestCorporateAction', 'receiver', 'oracle', 'forwarder'])
        assert.ok(calls.includes(required));
    assert.throws(() => readArcState(f.config, '999', call));
});
