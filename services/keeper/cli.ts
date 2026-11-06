import {readFileSync} from 'node:fs';
import {verifyReplay} from './replay.ts';
import {clientFor,verifyDeployment} from './config.ts';
import {Store} from './store.ts';
import {Indexer} from './indexer.ts';
import {snapshot,indexedState,indexedEvents} from './state.ts';
import {createApi} from './api.ts';
import {prepareActor} from './transactions.ts';
import {json,type Hex} from './types.ts';
if(process.argv[2]==='replay'){
  const result=await verifyReplay(process.argv[3]);console.log(json({runs:result.runs.map(r=>({id:r.id,inputHash:r.inputHash,outcomeHash:r.outcomeHash,terminalDebt:r.terminalDebt,transactions:r.transactions.length,expectedReverts:r.expectedReverts.length,parity:r.parity,conservation:r.conservation}))}));
}else if(process.argv[2]==='serve'){
  const path=process.argv[3];if(!path)throw Error('deployment manifest path required');const deployment=JSON.parse(readFileSync(path,'utf8'));
  const rpcUrl=process.env.RPC_URL;if(!rpcUrl)throw Error('RPC_URL required');const client=clientFor(rpcUrl);await verifyDeployment(client,deployment);
  const store=new Store('services/keeper/runs/index.json',deployment);
  const index=new Indexer(store,client,async(block,logs,history)=>{const all=[...history.flatMap(b=>b.logs),...logs];const offers=all.filter(l=>l.decoded?.eventName==='OfferPosted').map(l=>l.decoded.args.offerId as Hex);return snapshot(client,deployment,[],offers,block,all);});
  const refresh=(watch:Hex[]=[])=>indexedState(index,client,watch);
  const server=createApi({manifest:()=>deployment,state:refresh,events:boundary=>indexedEvents(index,client,boundary),prepare:async input=>{const current=await refresh();return prepareActor(deployment,current.block,input,client);}});
  server.listen(Number(process.env.PORT??8787),'127.0.0.1');
}else throw Error('Usage: node --import tsx services/keeper/cli.ts replay [input.json] | serve deployment.json');
