import { HTTPClient, EVMClient, consensusIdenticalAggregation, getNetwork, encodeCallMsg, bytesToHex, hexToBase64, LAST_FINALIZED_BLOCK_NUMBER, blockNumber, protoBigIntToBigint, TxStatus, type Runtime } from '@chainlink/cre-sdk';
import { EVM_PB } from '@chainlink/cre-sdk/pb';
import { encodeFunctionData, decodeFunctionResult, zeroAddress, type Abi } from 'viem';
import { execute, validateConfig, type RunResult } from './core.ts';
import { observeLive, observeReplay, readArcState } from './adapters.ts';
import { readAbi } from './abi.ts';
import type { Config } from './schema.ts';
export function runWorkflow(runtime: Runtime<Config>): RunResult {
    try {
        const c = validateConfig(runtime.config);
        const network = getNetwork({ chainFamily: 'evm', chainSelector: BigInt(c.chainSelector) });
        if (!network || network.chainId !== c.chainId || network.chainSelector.name !== c.chainName)
            throw new Error('NETWORK_IDENTITY');
        const evm = new EVMClient(network.chainSelector.selector);
        const http = new HTTPClient();
        return execute(c, {
            now: () => BigInt(Math.floor(runtime.now().getTime() / 1000)),
            log: message => runtime.log(message),
            readState: () => {
                const header = evm.headerByNumber(runtime, { blockNumber: LAST_FINALIZED_BLOCK_NUMBER }).result().header;
                if (!header?.blockNumber)
                    throw new Error('MISSING_BLOCK');
                const at = blockNumber(protoBigIntToBigint(header.blockNumber));
                return readArcState(c, network.chainId, (target, method, args) => {
                    const abi: Abi = readAbi;
                    const result = evm.callContract(runtime, { call: encodeCallMsg({ from: zeroAddress, to: target, data: encodeFunctionData({ abi, functionName: method, args }) }), blockNumber: at }).result();
                    return decodeFunctionResult({ abi, functionName: method, data: bytesToHex(result.data) });
                });
            },
            observe: () => c.mode === 'replay' ? observeReplay(c.replay) : observeLive(c, key => {
                // Identical raw-response consensus retains each source's evidence digest.
                // Only public endpoints are supported; no credentials or custom headers.
                return http.sendRequest(runtime, sender => {
                    const response = sender.sendRequest({ url: c.providers[key].url, method: 'GET', timeout: '5s' }).result();
                    if (response.statusCode !== 200 || response.body.length > 32768)
                        throw new Error('HTTP_UNAVAILABLE');
                    return new TextDecoder().decode(response.body);
                }, consensusIdenticalAggregation<string>())().result();
            }),
            submit: (receiver, payload) => {
                const report = runtime.report({ encodedPayload: hexToBase64(payload), encoderName: 'evm', signingAlgo: 'ecdsa', hashingAlgo: 'keccak256' }).result();
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
