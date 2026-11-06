import {decodeEventLog} from 'viem';
import {artifact,contracts} from './abi.ts';
import {raw,integers,type Header} from './types.ts';
import {Store,type StoredBlock} from './store.ts';
export class Indexer {
  private running=false;
  constructor(readonly store:Store,readonly rpc:any,readonly refresh:(block:Header,logs:any[],history:StoredBlock[])=>Promise<any>){}
  async sync(){
    if(this.running)throw Error('indexer sync already running');this.running=true;
    try{
      const head:bigint=await this.rpc.getBlockNumber();let blocks=this.store.data.blocks.slice();
      while(blocks.length){const last=blocks.at(-1)!;const n=BigInt(last.header.number);if(n<=head){const canonical=await this.rpc.getBlock({blockNumber:n});if(canonical?.hash===last.header.hash)break;}blocks.pop();}
      if(blocks.length!==this.store.data.blocks.length)this.store.replace(blocks);
      let next=blocks.length?BigInt(blocks.at(-1)!.header.number)+1n:BigInt(this.store.deployment.deploymentBlock);
      for(;next<=head;next++){
        const block:Header=await this.rpc.getBlock({blockNumber:next});if(!block?.hash)throw Error('missing canonical block');
        if(blocks.length&&block.parentHash!==blocks.at(-1)!.header.hash)throw Error('parent mismatch; refresh required');
        const received:any[]=await this.rpc.getLogs({address:Object.values(this.store.deployment.addresses),fromBlock:next,toBlock:next});
        const seen=new Map<string,any>();
        for(const l of received){if(l.removed||l.blockHash!==block.hash||l.blockNumber!==next)throw Error('log block replaced');
          const key=`${block.hash}:${l.logIndex}`;if(seen.has(key)){if(jsonLog(seen.get(key))!==jsonLog(l))throw Error('conflicting duplicate log');continue;}seen.set(key,l);}
        const logs=[...seen.values()].sort((a,b)=>Number(a.transactionIndex-b.transactionIndex)||Number(a.logIndex-b.logIndex)).map(l=>{
          const name=Object.entries(this.store.deployment.addresses).find(([,a])=>a.toLowerCase()===l.address.toLowerCase())?.[0];let decoded:unknown=null;
          if(name&&contracts[name]){try{decoded=decodeEventLog({abi:artifact(contracts[name]!).abi,data:l.data,topics:l.topics});}catch{/* Preserve unknown raw logs as evidence. */}}
          return integers({...l,decoded});
        });
        const projection=await this.refresh(block,logs,blocks);
        if((await this.rpc.getBlock({blockNumber:next})).hash!==block.hash)throw Error('block replaced during projection');
        const record:StoredBlock=raw({header:{number:block.number,hash:block.hash,parentHash:block.parentHash,timestamp:block.timestamp},logs,projection});
        blocks=[...blocks,record];this.store.replace(blocks);
      }
    }finally{this.running=false;}
  }
}
function jsonLog(value:any){return JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v);}
