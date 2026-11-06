import { create, fromJson, toBinary } from '@bufbuild/protobuf';
import { Value, consensusIdenticalAggregation } from '@chainlink/cre-sdk';
import { SDK_PB, HTTP_CLIENT_PB } from '@chainlink/cre-sdk/pb';
// Installed CLI defaults: ChainRead15, HTTP15, Consensus50, Secrets5.
// Leave 1kB below even the decimal interpretation of its25kb observation cap.
export const CONSENSUS_OBSERVATION_LIMIT = 24000;
export function consensusObservationSize(value: string): number {
    return toBinary(SDK_PB.SimpleConsensusInputsSchema, create(SDK_PB.SimpleConsensusInputsSchema, {
        descriptors: consensusIdenticalAggregation<string>().descriptor,
        observation: { case: 'value', value: Value.from(value).proto() },
    })).length;
}
export function checkedObservation(value: string): string {
    if (consensusObservationSize(value) > CONSENSUS_OBSERVATION_LIMIT) throw new Error('CONSENSUS_OBSERVATION_SIZE');
    return value;
}
export function checkedRequest(input: HTTP_CLIENT_PB.RequestJson): HTTP_CLIENT_PB.RequestJson {
    try {
        if (toBinary(HTTP_CLIENT_PB.RequestSchema, fromJson(HTTP_CLIENT_PB.RequestSchema, input)).length > 120000) throw new Error();
    } catch { throw new Error('HTTP_REQUEST_SIZE'); }
    return input;
}
export class InvocationBudget {
    private used = { chain: 0, http: 0, consensus: 0, secret: 0, write: 0 };
    take(kind: keyof InvocationBudget['used']) {
        const limit = { chain: 15, http: 15, consensus: 50, secret: 5, write: 1 }[kind];
        if (this.used[kind] >= limit) throw new Error('RESOURCE_BUDGET');
        this.used[kind]++;
    }
}
