import {formatUnits} from 'viem';
export function amount(value:bigint|undefined,decimals:number){return value===undefined?'—':formatUnits(value,decimals);}
export function receiptLabel(status:bigint|undefined){return status===undefined?'NO SNAPSHOT':({0:'NONE',1:'ACTIVE',2:'ENDED'} as Record<string,string>)[status.toString()]??'UNKNOWN';}
export function truthLabels(chainId:string|undefined,verified:boolean,receiverMode?:string){return {network:!verified?'UNVERIFIED':chainId==='31337'?'LOCAL ANVIL':chainId==='5042002'?'ARC · MANIFEST VERIFIED':'VERIFIED CHAIN',source:'ONCHAIN SNAPSHOT',clock:'BLOCK TIME',signing:'CONNECTED WALLET',preparation:'UNSIGNED PREPARATION → WALLET → CONTRACT',authority:'CONTRACT SETTLEMENT',receiver:receiverMode??'RECEIVER MODE UNVERIFIED'};}

export function loanLabel(status:bigint|undefined){return status===undefined?'NO SNAPSHOT':({0:'NONE',1:'ACTIVE',2:'HANDOFF_PENDING',3:'CLOSED'} as Record<string,string>)[status.toString()]??'UNKNOWN';}
