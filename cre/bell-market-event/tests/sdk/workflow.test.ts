import assert from 'node:assert/strict';
import { test, newTestRuntime, EvmMock, HttpActionsMock, addContractMock } from '@chainlink/cre-sdk/test';
import { getNetwork, bytesToHex } from '@chainlink/cre-sdk';
import { zeroHash } from 'viem';
import { fixture, hash } from '../fixtures.ts';
import { readAbi } from '../../src/abi.ts';
import { runWorkflow } from '../../src/workflow.ts';
test('real CRE SDK capabilities read Arc, reach HTTP consensus, sign and submit exact payload in both modes', () => {
    const f = fixture();
    const network = getNetwork({ chainFamily: 'evm', chainSelectorName: 'arc-testnet', isTestnet: true })!;
    const evm = EvmMock.testInstance(network.chainSelector.selector);
    const http = HttpActionsMock.testInstance();
    const calls: string[] = [];
    const payloads: string[] = [];
    const targets: string[] = [];
    const bodies: any = { calendar: { ...f.bundle.calendar, kind: 3, assetId: f.bundle.assetId, sessionId: f.bundle.sessionId, configHash: f.bundle.configHash }, primary: f.bundle.primary, secondary: f.bundle.secondary, corporate: f.bundle.corporate };
    http.sendRequest = (req) => { const key = Object.keys(f.config.providers).find(k => f.config.providers[k]!.url === req.url)!; calls.push(key); return { statusCode: 200, body: Buffer.from(JSON.stringify(bodies[key])).toString('base64') }; };
    evm.headerByNumber = () => ({ header: { timestamp: '1000', blockNumber: { absVal: 'AQ==', sign: '1' } } });
    const oracle = addContractMock(evm, { address: f.config.oracle, abi: readAbi });
    oracle.assetState = () => ({ nextNonce: 3n, stateHash: f.state.stateHash, configHash: f.state.configHash, activeSessionId: f.bundle.sessionId, halted: false, latestCorporateActionHash: zeroHash });
    oracle.sessionFact = () => ({ ...f.state.session, scheduledOpen: 800n, scheduledClose: 900n, closeObservedAt: 900n, reopenObservedAt: 0n, scheduledReportHash: hash('s'), closeReportHash: hash('c'), reopenReportHash: zeroHash });
    oracle.sessionPhase = () => 2;
    oracle.benchmarkOf = (session) => ({ finalized: session === f.config.referenceSessionId, assetId: f.config.assetId, sessionId: session, configHash: f.state.configHash, price: 140000000n, multiplierNumerator: 1n, multiplierDenominator: 1n, observedAt: 800n, primarySourceHash: hash('p'), secondarySourceHash: hash('s'), reportHash: hash('r') });
    oracle.latestCorporateAction = () => ({ ...f.state.corporate, multiplierNumerator: 0n, multiplierDenominator: 0n, observedAt: 0n, reportHash: zeroHash });
    const registry = addContractMock(evm, { address: f.config.registry, abi: readAbi });
    registry.getConfig = () => [{ assetToken: f.config.oracle, stockTokenDecimals: 18, cashTokenDecimals: 6, originationLtvBps: 6000, targetLtvBps: 6500, triggerLtvBps: 7500, rateNumerator: 1, rateDenominator: 10000n, maxFills: 8, maxActiveReceipts: 32, supportedCorporateActions: 6 }, 1n, f.state.configHash];
    for (const mode of ['live', 'replay']) {
        const target = mode === 'live' ? f.config.liveReceiver : f.config.simulationReceiver;
        oracle.receiver = () => target;
        const receiver = addContractMock(evm, { address: target, abi: readAbi });
        receiver.oracle = () => f.config.oracle;
        receiver.forwarder = () => mode === 'live' ? f.config.liveForwarder : f.config.simulationForwarder;
        receiver.workflowId = () => f.config.workflowId;
        receiver.workflowOwner = () => f.config.workflowOwner;
        receiver.writeReport = (req) => { targets.push(bytesToHex(req.receiver)); payloads.push(bytesToHex(req.report.rawReport.slice(-672))); return { txStatus: 'TX_STATUS_SUCCESS', txHash: Buffer.from(hash('tx').slice(2), 'hex').toString('base64') }; };
        const config = { ...f.config, mode, chainName: network.chainSelector.name, chainSelector: network.chainSelector.selector.toString(), chainId: network.chainId };
        // Replay is the exact canonical observation bundle produced by the live adapter.
        const { observeLive } = requireAdapter();
        const replay = observeLive(config, (key: string) => JSON.stringify(bodies[key]));
        const runtime = newTestRuntime(null, { timeProvider: () => 1000000 }, { ...config, replay });
        const result = runWorkflow(runtime);
        assert.equal(result?.status, 'submitted');
        assert.ok(runtime.getLogs().every(l => !l.includes('https:') && !l.includes('Authorization')));
    }
    assert.equal(calls.length, 4);
    assert.equal(payloads[0], payloads[1]);
    assert.equal(payloads[0]!.length, 1346);
    assert.deepEqual(targets, [f.config.liveReceiver, f.config.simulationReceiver]);
});
import * as adapters from '../../src/adapters.ts';
function requireAdapter() { return adapters; }
