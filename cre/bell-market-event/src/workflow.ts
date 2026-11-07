import { HTTPClient, EVMClient, consensusIdenticalAggregation, getNetwork, encodeCallMsg, bytesToHex, hexToBase64, LAST_FINALIZED_BLOCK_NUMBER, blockNumber, protoBigIntToBigint, TxStatus, type Runtime } from '@chainlink/cre-sdk';
import { EVM_PB, type HTTP_CLIENT_PB } from '@chainlink/cre-sdk/pb';
import { encodeFunctionData, decodeFunctionResult, zeroAddress, type Abi, type Hex } from 'viem';
import { execute, validateConfig, type RunResult } from './core.ts';
import { observeLive, observeReplay, readArcState } from './adapters.ts';
import { readAbi } from './abi.ts';
import { stateSchema, type Config, type ArcState } from './schema.ts';
import { observeQuoteSnapshot, quoteRequest } from './quotes.ts';
import {observeHistorical, historicalRequest, historicalPoint} from './historical.ts';
import { InvocationBudget, checkedObservation, checkedRequest } from './budget.ts';
export function runWorkflow(runtime: Runtime<Config>): RunResult {
    try {
        const c = validateConfig(runtime.config);
        const network = getNetwork({ chainFamily: 'evm', chainSelector: BigInt(c.chainSelector) });
        if (!network || network.chainId !== c.chainId || network.chainSelector.name !== c.chainName)
            throw new Error('NETWORK_IDENTITY');
        const evm = new EVMClient(network.chainSelector.selector);
        const http = new HTTPClient();
        const budget = new InvocationBudget();
        const secrets = new Map<string, string>();
        const request = (input: HTTP_CLIENT_PB.RequestJson) => {
            checkedRequest(input);
            budget.take('http');
            budget.take('consensus');
            return http.sendRequest(runtime, sender => {
                try {
                    const response = sender.sendRequest(input).result();
                    if (response.statusCode !== 200 || response.body.length > 32768) throw new Error('QUOTE_HTTP_UNAVAILABLE');
                    return checkedObservation(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(response.body));
                } catch (error) {
                    if (error instanceof Error && error.message === 'CONSENSUS_OBSERVATION_SIZE') throw error;
                    throw new Error('QUOTE_HTTP_UNAVAILABLE');
                }
            }, consensusIdenticalAggregation<string>())().result();
        };
        const publicGet = (key: keyof Config['providers']) => request({ url: c.providers[key].url, method: 'GET', timeout: '5s' });
        // Cache only within this invocation. Fixed-version registry facts and receiver
        // pins are immutable; every oracle session/corporate/halt change advances the
        // asset nonce/hash. A finalized asset-state reread therefore guards all facts
        // without exceeding CRE's default chain-read budget with a second full snapshot.
        let snapshot: ArcState | undefined;
        let snapshotAssetData: Hex | undefined;
        return execute(c, {
            now: () => BigInt(Math.floor(runtime.now().getTime() / 1000)),
            log: message => runtime.log(message),
            readState: () => {
                budget.take('chain');
                const header = evm.headerByNumber(runtime, { blockNumber: LAST_FINALIZED_BLOCK_NUMBER }).result().header;
                if (!header?.blockNumber)
                    throw new Error('MISSING_BLOCK');
                const at = blockNumber(protoBigIntToBigint(header.blockNumber));
                let assetData: Hex | undefined;
                const read = (target: Hex, method: string, args: readonly unknown[]) => {
                    const abi: Abi = readAbi;
                    budget.take('chain');
                    const result = evm.callContract(runtime, { call: encodeCallMsg({ from: zeroAddress, to: target, data: encodeFunctionData({ abi, functionName: method, args }) }), blockNumber: at }).result();
                    if (result.data.length > 5000) throw new Error('CHAIN_RESPONSE_SIZE');
                    const data = bytesToHex(result.data);
                    if (method === 'assetState') assetData = data;
                    return decodeFunctionResult({ abi, functionName: method, data });
                };
                if (!snapshot) {
                    const state = readArcState(c, network.chainId, read);
                    snapshotAssetData = assetData;
                    snapshot = state;
                    return state;
                }
                const asset = read(c.oracle, 'assetState', [c.assetId]) as Record<string, unknown>;
                const fresh = stateSchema.parse(JSON.parse(JSON.stringify({ ...snapshot, ...asset }, (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value)));
                if (fresh.nextNonce !== snapshot.nextNonce || fresh.stateHash !== snapshot.stateHash) return fresh;
                // Equal nonce/hash must imply byte-identical asset state, including
                // fields omitted from ArcState such as latestCorporateActionHash.
                if (!snapshotAssetData || assetData !== snapshotAssetData) throw new Error('ARC_STATE_INCONSISTENT');
                return snapshot;
            },
            observe: () => c.dataSource === 'gpro-history' ? (() => {
                if (!c.historical) throw new Error('HISTORY_CONFIG');
                runtime.log(JSON.stringify({authority:'HISTORICAL_HTTP_REPLAY', historical:historicalPoint(c.historical.stage), clock:'explicit simulated session; not a live quote'}));
                return observeHistorical(c, provider => {
                    let secret: string | undefined;
                    if (provider === 'primary') {
                        secret = secrets.get('TWELVEDATA_API_KEY');
                        if (secret === undefined) {
                            budget.take('secret');
                            try { secret = runtime.getSecret({id:'TWELVEDATA_API_KEY'}).result().value; }
                            catch { throw new Error('QUOTE_SECRET_UNAVAILABLE'); }
                            secrets.set('TWELVEDATA_API_KEY', secret);
                        }
                    }
                    return request(historicalRequest(provider,c,secret));
                });
            })() : c.dataSource === 'quote-snapshot' ? observeQuoteSnapshot(c, provider => {
                if (!c.quote) throw new Error('QUOTE_BINDING');
                const id = c.quote.secretIds[provider];
                let secret = secrets.get(id);
                if (secret === undefined) {
                    budget.take('secret');
                    try { secret = runtime.getSecret({ id }).result().value; }
                    catch { throw new Error('QUOTE_SECRET_UNAVAILABLE'); }
                    secrets.set(id, secret);
                }
                return request(quoteRequest(provider, c.quote, secret));
            }, publicGet) : c.mode === 'replay' ? observeReplay(c.replay) : observeLive(c, publicGet),
            submit: (receiver, payload) => {
                if (BigInt(c.gasLimit) > 10000000n || (payload.length - 2) / 2 > 50000) throw new Error('RESOURCE_BUDGET');
                budget.take('consensus');
                const report = runtime.report({ encodedPayload: hexToBase64(payload), encoderName: 'evm', signingAlgo: 'ecdsa', hashingAlgo: 'keccak256' }).result();
                budget.take('write');
                const result = evm.writeReport(runtime, { receiver, report, gasConfig: { gasLimit: c.gasLimit } }).result();
                const receiverStatus = result.receiverContractExecutionStatus;
                const status = result.txStatus === TxStatus.REVERTED ? 'reverted'
                    : result.txStatus !== TxStatus.SUCCESS ? 'fatal'
                    : receiverStatus === EVM_PB.ReceiverContractExecutionStatus.REVERTED ? 'reverted'
                    : receiverStatus === EVM_PB.ReceiverContractExecutionStatus.SUCCESS ? 'success'
                    : 'unknown';
                return { status, ...(result.txHash?.length ? { txHash: bytesToHex(result.txHash) } : {}) };
            },
        });
    }
    catch {
        runtime.log(JSON.stringify({ status: 'unavailable', reason: 'CAPABILITY_OR_CONFIG_UNAVAILABLE' }));
        return { status: 'unavailable', reason: 'CAPABILITY_OR_CONFIG_UNAVAILABLE' };
    }
}
