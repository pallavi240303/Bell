import {discoverFinalized} from './discovery.ts';
import {decodeEventLog} from 'viem';
import {artifact,contracts} from './abi.ts';
import {raw,integers,type Header} from './types.ts';
import {Store,type StoredBlock} from './store.ts';
const CHUNK_BLOCKS=64n,HEADER_CONCURRENCY=8;
/** Bounded RPC reads finish before a failed batch can be retried. */
async function headers(numbers:bigint[],read:(number:bigint)=>Promise<Header>):Promise<Header[]>{
  const result:Header[]=[];let next=0,failed=false,failure:unknown;
  await Promise.all(Array.from({length:Math.min(HEADER_CONCURRENCY,numbers.length)},async()=>{
    while(!failed&&next<numbers.length){const i=next++;try{const block=await read(numbers[i]!);if(!block?.hash||block.number!==numbers[i])throw Error('missing canonical block');result[i]=block;}catch(error){failed=true;failure=error;}}
  }));
  if(failed)throw failure;return result;
}
export class Indexer {
  private running:Promise<void>|undefined;
  constructor(readonly store:Store,readonly rpc:any,readonly refresh:(block:Header,logs:any[],history:StoredBlock[])=>Promise<any>,readonly options?:{discovery?:'finalized'}){}
  /** Concurrent UI/API readers share one writer and receive the same success or failure. */
  sync():Promise<void>{
    if(!this.running)this.running=this.catchUp().finally(()=>{this.running=undefined;});
    return this.running;
  }
  private async catchUp(){
    if(this.options?.discovery==='finalized')return discoverFinalized(this.store,this.rpc,this.refresh);
    const head:bigint=await this.rpc.getBlockNumber();let blocks=this.store.data.blocks.slice();
    while(blocks.length){const last=blocks.at(-1)!;const n=BigInt(last.header.number);if(n<=head){const canonical=await this.rpc.getBlock({blockNumber:n});if(canonical?.hash===last.header.hash)break;}blocks.pop();}
    if(blocks.length!==this.store.data.blocks.length)this.store.replace(blocks);
    let next=blocks.length?BigInt(blocks.at(-1)!.header.number)+1n:BigInt(this.store.deployment.deploymentBlock);
    const addresses=Object.values(this.store.deployment.addresses),addressSet=new Set(addresses.map(a=>a.toLowerCase()));
    for(;next<=head;next+=CHUNK_BLOCKS){
      const end=next+CHUNK_BLOCKS-1n<head?next+CHUNK_BLOCKS-1n:head;
      const numbers=Array.from({length:Number(end-next+1n)},(_,i)=>next+BigInt(i));
      const batch=await headers(numbers,n=>this.rpc.getBlock({blockNumber:n}));
      for(let i=0;i<batch.length;i++){
        const parent=i?batch[i-1]!.hash:blocks.at(-1)?.header.hash;
        if(parent&&batch[i]!.parentHash!==parent)throw Error('parent mismatch; refresh required');
      }
      const received:any[]=await this.rpc.getLogs({address:addresses,fromBlock:next,toBlock:end});
      const seen=new Map<string,any>(),byBlock=new Map<bigint,any[]>();
      for(const log of received){
        const number=log.blockNumber;
        if(typeof number!=='bigint'||number<next||number>end||log.removed||log.blockHash!==batch[Number(number-next)]!.hash||!addressSet.has(String(log.address).toLowerCase()))throw Error('log block replaced or outside deployment');
        const key=`${log.blockHash}:${log.logIndex}`;
        if(seen.has(key)){if(jsonLog(seen.get(key))!==jsonLog(log))throw Error('conflicting duplicate log');continue;}seen.set(key,log);
        const group=byBlock.get(number)??[];group.push(log);byBlock.set(number,group);
      }
      const pending:StoredBlock[]=[];
      for(const block of batch){
        const logs=(byBlock.get(block.number)??[]).sort((a,b)=>Number(a.transactionIndex-b.transactionIndex)||Number(a.logIndex-b.logIndex)).map(log=>{
          const name=Object.entries(this.store.deployment.addresses).find(([,a])=>a.toLowerCase()===log.address.toLowerCase())?.[0];let decoded:unknown=null;
          if(name&&contracts[name])try{decoded=decodeEventLog({abi:artifact(contracts[name]!).abi,data:log.data,topics:log.topics});}catch{/* Preserve unknown raw logs as evidence. */}
          return integers({...log,decoded});
        });
        const projection=await this.refresh(block,logs,[...blocks,...pending]);
        pending.push(raw({header:{number:block.number,hash:block.hash,parentHash:block.parentHash,timestamp:block.timestamp},logs,projection}));
      }
      // No partial chunk or cursor is published if any source block was replaced.
      const checked=await headers(numbers,n=>this.rpc.getBlock({blockNumber:n}));
      if(checked.some((block,i)=>block.hash!==batch[i]!.hash))throw Error('block replaced during projection');
      const committed=[...blocks,...pending];this.store.replace(committed);blocks=committed;
    }
  }
}
function jsonLog(value:any){return JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v);}
