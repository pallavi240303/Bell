export interface Block {number:bigint;hash:`0x${string}`;timestamp:bigint}
export interface Frame {block:Block;state:Record<string,any>}
export interface Evidence {block:Block;events:Array<{blockNumber:bigint;blockHash:`0x${string}`;blockTimestamp:bigint;[key:string]:any}>}
export function uint(value:unknown,bits=256):bigint {
  if(typeof value!=='string'||! /^(0|[1-9][0-9]*)$/.test(value))throw Error('Canonical unsigned integer string required');
  const n=BigInt(value);if(n>=1n<<BigInt(bits))throw Error('Integer overflow');return n;
}
export function json(value:unknown){return JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v);}
type Decoder=(value:unknown)=>any;
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Snapshot object required');return v as Record<string,unknown>;};
const hex=(bytes:number):Decoder=>value=>{if(typeof value!=='string'||!new RegExp(`^0x[0-9a-fA-F]{${bytes*2}}$`).test(value))throw Error('Invalid identifier');return value.toLowerCase();};
const boolean:Decoder=value=>{if(typeof value!=='boolean')throw Error('Boolean required');return value;};
const string:Decoder=value=>{if(typeof value!=='string')throw Error('String required');return value;};
const fields=(schema:Record<string,Decoder>):Decoder=>value=>Object.fromEntries(Object.entries(object(value)).map(([k,v])=>{if(!schema[k])throw Error(`Unexpected snapshot field: ${k}`);return[k,schema[k](v)];}));
const record=(key:Decoder,decode:Decoder):Decoder=>value=>Object.fromEntries(Object.entries(object(value)).map(([k,v])=>{key(k);return[k.toLowerCase(),decode(v)];}));
const array=(decode:Decoder):Decoder=>value=>{if(!Array.isArray(value))throw Error('Array required');return value.map(item=>decode(item));};
function abiValue(p:AbiParameter):Decoder{
  if(p.type.endsWith('[]'))return array(abiValue({...p,type:p.type.slice(0,-2)} as AbiParameter));
  if(p.type==='tuple'){const parts=(p as any).components as AbiParameter[];const decode=fields(Object.fromEntries(parts.map(c=>[c.name!,abiValue(c)])));return value=>{const v=object(value);for(const part of parts)if(!(part.name! in v))throw Error(`Missing tuple field: ${part.name}`);return decode(v);};}
  if(p.type.startsWith('uint'))return value=>uint(value,Number(p.type.slice(4)||256));
  if(p.type==='address')return hex(20);
  if(/^bytes\d+$/.test(p.type))return hex(Number(p.type.slice(5)));
  if(p.type==='bool')return boolean;
  if(p.type==='string')return string;
  throw Error(`Unsupported snapshot ABI field: ${p.type}`);
}
const output=(contract:keyof typeof abis,name:string,index=0):AbiParameter=>{
  const fn=abis[contract].find(x=>x.type==='function'&&x.name===name) as any;
  if(!fn?.outputs[index])throw Error('Missing generated snapshot ABI');return fn.outputs[index];
};
const read=(contract:keyof typeof abis,name:string)=>abiValue(output(contract,name));
const offerParts=(output('book','getOffer') as any).components as AbiParameter[];
const offer=fields(Object.fromEntries(offerParts.map(p=>[p.name!,abiValue(p)])));
const loan=fields({loan:read('loanManager','getLoan'),debt:uint,debtRecord:read('vault','getDebt'),remainingShares:uint,backing:uint,outstandingUnits:uint,activeCoverDeadline:v=>uint(v,64),opensAt:v=>uint(v,64),cutoffAt:v=>uint(v,64),currentCoverage:uint});
const receipt=fields({receipt:read('manager','getReceipt'),benchmark:read('oracle','benchmarkOf'),receiptRemainingCoverage:uint});
const balance=fields({...Object.fromEntries(['cash','stock','premiumCredit','cashCredit','poolShares','cashAllowanceLoanManager','stockAllowanceVault','borrowerNonce','cashAllowancePool','cashAllowanceBook','nativeGas'].map(k=>[k,uint])),restricted:boolean});
const config=fields({config:abiValue(output('registry','getConfig')),effectiveAt:value=>uint(value,64),configHash:hex(32)});
const bytes:Decoder=v=>{if(typeof v!=='string'||!/^0x([0-9a-fA-F]{2})*$/.test(v))throw Error('Invalid bytes');return v.toLowerCase();};
const decodeState=fields({
  loans:record(uint,loan),receipts:record(uint,receipt),
  offerCoverage:record(hex(32),fields({currentLockedCash:uint})),
  offers:record(hex(32),offer),termsHashes:record(hex(32),hex(32)),claims:record(uint,read('vault','getClaim')),balances:record(hex(20),balance),
  assets:record(hex(32),fields({configs:record(uint,config),state:read('oracle','assetState'),corporateAction:read('oracle','latestCorporateAction'),latestReference:read('oracle','latestReference'),referenceCheck:fields({ok:boolean,referenceInvalidated:boolean,revertData:bytes})})),
  sessions:record(hex(32),fields({fact:read('oracle','sessionFact'),benchmark:read('oracle','benchmarkOf')})),
  stockTokens:record(hex(20),fields({symbol:string,decimals:v=>uint(v,8),accountedBacking:uint,paused:boolean,balances:record(hex(20),fields({balance:uint,allowanceVault:uint,restricted:boolean}))})),
  coverPolicy:fields({profile:v=>uint(v,8),coverOpensBeforeClose:v=>uint(v,64),coverCutoffBeforeClose:v=>uint(v,64)}),
  tokens:fields({cash:fields({symbol:string,decimals:value=>uint(value,8)}),stock:fields({symbol:string,decimals:value=>uint(value,8),paused:boolean})}),
  receiverMode:value=>value===null?null:uint(value,8),pool:fields({totalAssets:uint,totalSupply:uint,activeLoanIds:array(uint)}),
  book:fields({totalLockedCash:uint,totalPremiumCredits:uint,totalCashCredits:uint}),nextLoanId:uint,nextReceiptId:uint,nextClaimId:uint
});
export function decodeFrame(value:any):Frame{
  if(!value?.block||!value.state||typeof value.state!=='object'||Array.isArray(value.state)||!/^0x[0-9a-fA-F]{64}$/.test(value.block.hash))throw Error('Coherent snapshot provenance required');
  return {block:{number:uint(value.block.number),hash:value.block.hash,timestamp:uint(value.block.timestamp)},state:decodeState(value.state)};
}
export function decodeEvidence(value:any):Evidence{
  const block=decodeFrame({block:value?.block,state:{}}).block;
  if(!Array.isArray(value.events))throw Error('Evidence list required');
  const bytes:Decoder=v=>{if(typeof v!=='string'||!/^0x([0-9a-fA-F]{2})*$/.test(v))throw Error('Invalid log bytes');return v;};
  const decoded:Decoder=v=>{
    if(v===null)return null;const item=object(v);
    const candidates=Object.values(abis).flat().filter(x=>x.type==='event'&&x.name===item.eventName);
    for(const event of candidates)try{
      const args=abiValue({type:'tuple',components:(event as any).inputs} as AbiParameter)(item.args);
      return {eventName:item.eventName,args};
    }catch{/* Same signature can use different parameter names in different generated ABIs. */}
    throw Error('Invalid decoded event fields');
  };
  const decodeLog=fields({address:hex(20),blockNumber:uint,blockHash:hex(32),blockTimestamp:uint,transactionHash:hex(32),transactionIndex:uint,logIndex:uint,data:bytes,topics:array(hex(32)),removed:boolean,decoded});
  const events=value.events.map((value:unknown)=>{
    const event=decodeLog(value);if(typeof event.blockNumber!=='bigint'||typeof event.blockTimestamp!=='bigint'||!event.blockHash||event.blockNumber>block.number||event.blockTimestamp>block.timestamp||event.removed)throw Error('Event outside evidence boundary');return event;
  });return {block,events};
}
export class Transport{
  constructor(private base='/api',private fetcher:typeof fetch=fetch){}
  private async request(path:string,input?:unknown){
    const response=await this.fetcher.call(globalThis,`${this.base}${path}`,{method:input===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},cache:'no-store',credentials:'omit',...(input===undefined?{}:{body:json(input)})});
    if(!response.ok)throw Error(`Read/preparation failed (${response.status}); refresh required`);return response.json();
  }
  async state(account?:string){return decodeFrame(await this.request(`/state${account?`?watch=${encodeURIComponent(account)}`:''}`));}
  manifest(){return this.request('/manifest');}
  async events(block:Block){return decodeEvidence(await this.request(`/events?blockNumber=${block.number}&blockHash=${block.hash}`));}
  prepare(input:unknown){return this.request('/prepare',input);}
}
import {abis} from '../generated/abis.ts';
import type {AbiParameter} from 'viem';
