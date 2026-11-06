import {readFileSync} from 'node:fs';
import {verifyReplay} from './replay.ts';
import {clientFor,verifyDeployment} from './config.ts';
import {Store} from './store.ts';
import {Indexer} from './indexer.ts';
import {indexedState,indexedEvents} from './state.ts';
import {createApi} from './api.ts';
import {prepareActor} from './transactions.ts';
import {json,type Hex} from './types.ts';
if(process.argv[2]==='replay'){
  const result=await verifyReplay(process.argv[3]);console.log(json({runs:result.runs.map(r=>({id:r.id,inputHash:r.inputHash,outcomeHash:r.outcomeHash,finalDebt:r.outcome.finalDebt,transactions:r.transactions.length,expectedReverts:r.expectedReverts.length,parity:r.parity}))}));
}else if(process.argv[2]==='serve'){
  const path=process.argv[3];if(!path)throw Error('deployment manifest path required');const deployment=JSON.parse(readFileSync(path,'utf8'));
  const rpcUrl=process.env.RPC_URL;if(!rpcUrl)throw Error('RPC_URL required');const client=clientFor(rpcUrl);await verifyDeployment(client,deployment);
  const store=new Store('services/keeper/runs/index.json',deployment);
  // Persist discovery provenance per block; indexedState reads financial facts once
  // at the final pinned canonical boundary, including empty-block debt accrual.
  const index=new Indexer(store,client,async(_block,logs)=>({discoveryOnly:true,logCount:logs.length}),deployment.chainId==='5042002'?{discovery:'finalized'}:undefined);
  const pending=new Map<string,Promise<Awaited<ReturnType<typeof indexedState>>>>();
  const refresh=(watch:Hex[]=[])=>{
    const normalized=[...new Set(watch.map(address=>address.toLowerCase() as Hex))].sort(),key=normalized.join(',');
    let frame=pending.get(key);
    if(!frame){frame=indexedState(index,client,normalized).finally(()=>{pending.delete(key);});pending.set(key,frame);}
    return frame;
  };
  const server=createApi({manifest:()=>deployment,state:refresh,events:boundary=>indexedEvents(index,client,boundary),prepare:async input=>{const current=await refresh();return prepareActor(deployment,current.block,input,client);}});
  server.listen(Number(process.env.PORT??8787),'127.0.0.1');
}else throw Error('Usage: node --import tsx services/keeper/cli.ts replay [input.json] | serve deployment.json');
