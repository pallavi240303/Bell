import assert from 'node:assert/strict';
import { test, newTestRuntime, EvmMock, HttpActionsMock, addContractMock } from '@chainlink/cre-sdk/test';
import { getNetwork, bytesToHex } from '@chainlink/cre-sdk';
import { zeroHash } from 'viem';
import { fixture, hash } from '../fixtures.ts';
import { readAbi } from '../../src/abi.ts';
import { runWorkflow } from '../../src/workflow.ts';
for (const outcome of [
    { name: 'confirmed receiver acceptance', receiverStatus: 'RECEIVER_CONTRACT_EXECUTION_STATUS_SUCCESS', expected: 'submitted' },
    { name: 'successful transaction with reverted receiver', receiverStatus: 'RECEIVER_CONTRACT_EXECUTION_STATUS_REVERTED', expected: 'reverted' },
    { name: 'successful transaction without receiver confirmation', receiverStatus: undefined, expected: 'unknown' },
] as const) test(`real CRE capabilities: ${outcome.name} in both modes without write retry`, () => {
    const f = fixture();
    const network = getNetwork({ chainFamily: 'evm', chainSelectorName: 'arc-testnet', isTestnet: true })!;
    const evm = EvmMock.testInstance(network.chainSelector.selector);
    const http = HttpActionsMock.testInstance();
    const calls: string[] = [];
    const payloads: string[] = [];
    const targets: string[] = [];
    let quoteStatus = 200;
    let chainReads = 0;
    let assetReads = 0;
    let stateBehavior = 'unchanged';
    const bodies: any = { calendar: { ...f.bundle.calendar, kind: 3, assetId: f.bundle.assetId, sessionId: f.bundle.sessionId, configHash: f.bundle.configHash }, primary: f.bundle.primary, secondary: f.bundle.secondary, corporate: f.bundle.corporate };
    http.sendRequest = (req) => {
        if (req.url.startsWith('https://finnhub.io/')) {
            assert.equal(req.url, 'https://finnhub.io/api/v1/quote?symbol=NVDA');
            assert.equal(req.headers['X-Finnhub-Token'], 'test-finnhub');
            return { statusCode: quoteStatus, body: Buffer.from('{"c":140,"t":1000}').toString('base64') };
        }
        if (req.url.startsWith('https://api.twelvedata.com/')) {
            assert.equal(req.url, 'https://api.twelvedata.com/quote?symbol=NVDA&apikey=test-twelve');
            return { statusCode: 200, body: Buffer.from('{"symbol":"NVDA","close":"140","timestamp":1000}').toString('base64') };
        }
        const key = Object.keys(f.config.providers).find(k => f.config.providers[k]!.url === req.url)!; calls.push(key); return { statusCode: 200, body: Buffer.from(JSON.stringify(bodies[key])).toString('base64') };
    };
    const countRead = () => { if (++chainReads > 15) throw new Error('TEST_CHAIN_READ_LIMIT'); };
    evm.headerByNumber = () => ({ header: { timestamp: '1000', blockNumber: { absVal: 'AQ==', sign: '1' } } });
    const oracle = addContractMock(evm, { address: f.config.oracle, abi: readAbi });
    oracle.assetState = () => {
        assetReads++;
        return { nextNonce: assetReads > 1 && stateBehavior === 'advanced' ? 4n : 3n, stateHash: assetReads > 1 && stateBehavior === 'advanced' ? hash('advanced') : f.state.stateHash, configHash: f.state.configHash, activeSessionId: f.bundle.sessionId, halted: false, latestCorporateActionHash: assetReads > 1 && stateBehavior === 'inconsistent' ? hash('divergent-corporate') : zeroHash };
    };
    oracle.sessionFact = () => ({ ...f.state.session, scheduledOpen: 800n, scheduledClose: 900n, closeObservedAt: 900n, reopenObservedAt: 0n, scheduledReportHash: hash('s'), closeReportHash: hash('c'), reopenReportHash: zeroHash });
    oracle.sessionPhase = () => 2;
    oracle.benchmarkOf = (session) => ({ finalized: session === f.config.referenceSessionId, assetId: f.config.assetId, sessionId: session, configHash: f.state.configHash, price: 140000000n, multiplierNumerator: 1n, multiplierDenominator: 1n, observedAt: 800n, primarySourceHash: hash('p'), secondarySourceHash: hash('s'), reportHash: hash('r') });
    oracle.latestCorporateAction = () => ({ ...f.state.corporate, multiplierNumerator: 0n, multiplierDenominator: 0n, observedAt: 0n, reportHash: zeroHash });
    oracle.marketSnapshot = () => [{ nextNonce: 3n, stateHash: f.state.stateHash, configHash: f.state.configHash, activeSessionId: f.bundle.sessionId, halted: false, latestCorporateActionHash: zeroHash }, oracle.sessionFact(f.config.sessionId), oracle.sessionFact(f.config.sessionId), oracle.benchmarkOf(f.config.sessionId), oracle.benchmarkOf(f.config.referenceSessionId), oracle.latestCorporateAction(f.config.assetId), f.state.latestReference];
    const registry = addContractMock(evm, { address: f.config.registry, abi: readAbi });
    registry.getConfig = () => [{ assetToken: f.config.oracle, stockTokenDecimals: 18, cashTokenDecimals: 6, originationLtvBps: 6000, targetLtvBps: 6500, triggerLtvBps: 7500, rateNumerator: 1, rateDenominator: 10000n, maxFills: 8, maxActiveReceipts: 32, supportedCorporateActions: 6 }, 1n, f.state.configHash];
    for (const source of ['live', 'replay', 'snapshot', 'redirect', 'missing-secret', 'official-quote', 'advanced', 'inconsistent'] as const) {
        chainReads = 0;
        assetReads = 0;
        stateBehavior = source;
        const isQuote = ['snapshot', 'redirect', 'missing-secret', 'official-quote'].includes(source);
        const mode = source === 'live' || source === 'official-quote' ? 'live' : 'replay';
        quoteStatus = source === 'redirect' ? 302 : 200;
        const target = mode === 'live' ? f.config.liveReceiver : f.config.simulationReceiver;
        oracle.receiver = () => target;
        const receiver = addContractMock(evm, { address: target, abi: readAbi });
        receiver.oracle = () => f.config.oracle;
        receiver.forwarder = () => mode === 'live' ? f.config.liveForwarder : f.config.simulationForwarder;
        receiver.workflowId = () => f.config.workflowId;
        receiver.workflowOwner = () => f.config.workflowOwner;
        receiver.writeReport = (req) => { targets.push(bytesToHex(req.receiver)); payloads.push(bytesToHex(req.report.rawReport.slice(-672))); return { txStatus: 'TX_STATUS_SUCCESS', ...(outcome.receiverStatus ? { receiverContractExecutionStatus: outcome.receiverStatus } : {}), txHash: Buffer.from(hash('tx').slice(2), 'hex').toString('base64') }; };
        const config = { ...f.config, mode, chainName: network.chainSelector.name, chainSelector: network.chainSelector.selector.toString(), chainId: network.chainId };
        // Replay is the exact canonical observation bundle produced by the live adapter.
        const { observeLive } = requireAdapter();
        const replay = observeLive(config, (key: string) => JSON.stringify(bodies[key]));
        const snapshot = isQuote ? { dataSource: 'quote-snapshot', quote: { symbol: 'NVDA', assetId: f.config.assetId, sessionId: f.config.sessionId, secretIds: { finnhub: 'FINNHUB_API_KEY', twelvedata: 'TWELVEDATA_API_KEY' } }, providers: { ...config.providers, primary: { id: 'finnhub', url: 'https://finnhub.io/api/v1/quote' }, secondary: { id: 'twelvedata', url: 'https://api.twelvedata.com/quote' } } } : {};
        const secrets = new Map([['main', new Map([['FINNHUB_API_KEY', 'test-finnhub'], ['TWELVEDATA_API_KEY', 'test-twelve']])]]);
        const runtime = newTestRuntime(source === 'missing-secret' ? null : secrets, { timeProvider: () => 1000000 }, { ...config, replay, ...snapshot });
        const capability = runtime.callCapability.bind(runtime);
        runtime.callCapability = input => {
            if (input.method === 'HeaderByNumber' || input.method === 'CallContract') countRead();
            return capability(input);
        };
        const result = runWorkflow(runtime);
        if (source === 'advanced' || source === 'inconsistent') {
            assert.deepEqual(result, source === 'advanced' ? { status: 'noop', reason: 'ARC_STATE_ADVANCED' } : { status: 'unavailable', reason: 'READ_FAILED' });
            assert.equal(targets.length, 3);
            continue;
        }
        if (['redirect', 'missing-secret', 'official-quote'].includes(source)) {
            assert.equal(result.status, 'unavailable');
            assert.equal(result.reason, source === 'redirect' ? 'QUOTE_HTTP_UNAVAILABLE' : source === 'missing-secret' ? 'QUOTE_SECRET_UNAVAILABLE' : 'QUOTE_NOT_OFFICIAL_REOPEN');
            assert.equal(targets.length, 3);
            continue;
        }
        if (source === 'snapshot') assert.equal(JSON.parse(runtime.getLogs().at(-1)!).dataSource, 'quote-snapshot');
        assert.equal(result?.status, outcome.expected);
        assert.equal(chainReads, mode === 'live' ? 11 : 9);
        assert.equal(result.txHash, hash('tx'));
        assert.equal(JSON.parse(runtime.getLogs().at(-1)!).status, outcome.expected);
        if (outcome.expected !== 'submitted') assert.ok(runtime.getLogs().every(l => !l.includes('submitted')));
        assert.ok(runtime.getLogs().every(l => !l.includes('https:') && !l.includes('Authorization')));
        assert.ok(runtime.getLogs().every(l => !l.includes('test-finnhub') && !l.includes('test-twelve')));
    }
    assert.equal(calls.length, 7);
    assert.equal(payloads[0], payloads[1]);
    assert.equal(payloads[0]!.length, 1346);
    assert.deepEqual(targets, [f.config.liveReceiver, f.config.simulationReceiver, f.config.simulationReceiver]);
});
import * as adapters from '../../src/adapters.ts';
function requireAdapter() { return adapters; }
