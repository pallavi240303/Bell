import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {toEventSelector} from 'viem';
import {Store} from '../store.ts';
import {Indexer} from '../indexer.ts';
import {indexedEvents} from '../state.ts';
const h=(n:number|bigint)=>`0x${BigInt(n).toString(16).padStart(64,'0')}`;
const a=(n:number)=>`0x${n.toString(16).padStart(40,'0')}`;
const transfer=toEventSelector('Transfer(address,address,uint256)'),approval=toEventSelector('Approval(address,address,uint256)');
const identity:any={chainId:'5042002',deploymentBlock:'1',addresses:{manager:a(1),pool:a(2),book:a(3),loanManager:a(4),vault:a(5),cash:a(9)}};
const projection=async(_b:any,logs:any[])=>({discoveryOnly:true,logCount:logs.length});
function fixture(end=20){
 const store=new Store(join(mkdtempSync(join(tmpdir(),'bell-discovery-')),'store.json'),identity);
 const logs:any[]=[],calls={headers:0,queries:[] as any[],active:0,peak:0,commits:0};
 const reads=new Map<bigint,number>();let finalized=BigInt(end),head=BigInt(end),changedFrom:bigint|undefined;
 const header=(n:bigint)=>({number:n,hash:h(n+(changedFrom!==undefined&&n>=changedFrom?1000000n:0n)),parentHash:h((n?n-1n:0n)+(changedFrom!==undefined&&n>changedFrom?1000000n:0n)),timestamp:n*10n});
 const matches=(log:any,q:any)=>{const addresses=Array.isArray(q.address)?q.address:[q.address];return log.blockNumber>=BigInt(q.fromBlock)&&log.blockNumber<=BigInt(q.toBlock)&&addresses.includes(log.address)&&(!q.topics||q.topics.every((topic:any,i:number)=>topic===null||(Array.isArray(topic)?topic.includes(log.topics[i]):topic===log.topics[i])));};
 const rpc:any={getBlockNumber:async()=>head,getBlock:async({blockNumber,blockTag}:any)=>{calls.headers++;calls.active++;calls.peak=Math.max(calls.peak,calls.active);await new Promise(r=>setImmediate(r));calls.active--;const n=blockTag==='finalized'?finalized:blockNumber;reads.set(n,(reads.get(n)??0)+1);return header(n);},getLogs:async(q:any)=>{calls.queries.push(q);return logs.filter(l=>matches(l,q));},request:async({method,params:[q]}:any)=>{assert.equal(method,'eth_getLogs');calls.queries.push(q);return logs.filter(l=>matches(l,q)).map(l=>({...l,blockNumber:`0x${l.blockNumber.toString(16)}`,transactionIndex:`0x${l.transactionIndex.toString(16)}`,logIndex:`0x${l.logIndex.toString(16)}`}));}};
 const replace=store.replace.bind(store);store.replace=b=>{calls.commits++;replace(b);};
 const log=(n:number,i:number,address=a(1),topics:string[]=[])=>({blockNumber:BigInt(n),blockHash:header(BigInt(n)).hash,transactionHash:h(100000+n),transactionIndex:0,logIndex:i,address,topics,data:topics.length?h(7):'0x',removed:false});
 const index=()=>new Indexer(store,rpc,projection,{discovery:'finalized'});
 return {store,logs,calls,reads,rpc,log,index,header,setFinalized:(n:number)=>{finalized=BigInt(n);},setHead:(n:number)=>{head=BigInt(n);},reorg:(n:number)=>{changedFrom=BigInt(n);}};
}

test('73000 synthetic empty blocks use bounded complete ranges and shared writer',async()=>{
 const f=fixture(73000);const index=f.index();const first=index.sync();assert.equal(index.sync(),first);await first;
 assert.equal(f.store.data.cursor?.blockNumber,'73000');assert.equal(f.store.data.cursor?.blockHash,h(73000));
 assert.equal(f.calls.commits,36);assert.equal(f.calls.queries.length,108);assert.ok(f.calls.headers<400,`headers=${f.calls.headers}`);assert.ok(f.calls.peak<=8);
 assert.ok(f.calls.queries.every(q=>BigInt(q.toBlock)-BigInt(q.fromBlock)<2048n));assert.ok(f.store.data.blocks.length<=72);
 assert.equal(f.store.data.blocks.at(-1)!.header.timestamp,'730000');assert.ok(f.store.data.blocks.at(-1)!.evidence?.length);
});

test('sparse and dense expose identical relevant cash endpoints, unknown protocol evidence and no unrelated cash',async()=>{
 const f=fixture();f.logs.push(f.log(3,0),f.log(5,0,a(9),[transfer,h(1),h(70)]),f.log(6,0,a(9),[transfer,h(71),h(2)]),f.log(7,0,a(9),[approval,h(3),h(72)]),f.log(8,0,a(9),[approval,h(73),h(4)]),f.log(9,0,a(9),[approval,h(1),h(5)]),f.log(10,0,a(9),[transfer,h(80),h(81)]));
 await f.index().sync();const stored=f.store.data.blocks.flatMap(b=>b.logs);assert.equal(stored.length,6);assert.equal(stored.find(l=>l.blockNumber==='3').decoded,null);
 const dense=new Store(join(mkdtempSync(join(tmpdir(),'bell-dense-oracle-')),'store.json'),identity);const index=new Indexer(dense,f.rpc,projection);await index.sync();assert.equal(dense.data.blocks.flatMap(b=>b.logs).length,7);
 assert.deepEqual((await indexedEvents(f.index(),f.rpc)).events,(await indexedEvents(index,f.rpc)).events);
 assert.ok(f.calls.queries.filter(q=>q.topics).every(q=>q.address===a(9)&&q.topics[0].length===2));
});

for(const fault of ['removed','range','emitter','hash','index','transaction','topics','data','conflict','cash-scope','cash-query','query','missing','parent','event-replaced','start-replaced','end-replaced','finalized-replaced','previous-replaced'] as const)test(`range rejects ${fault} atomically and concurrent callers share failure`,async()=>{
 const f=fixture(4100);f.logs.push(f.log(2051,0));const getLogs=f.rpc.getLogs.bind(f.rpc),getBlock=f.rpc.getBlock.bind(f.rpc),request=f.rpc.request.bind(f.rpc);
 f.rpc.getLogs=async(q:any)=>{const logs=await getLogs(q);if(q.fromBlock!==2049n)return logs;if(fault==='query')throw Error('controlled range rejection');if(fault==='removed')logs[0]={...logs[0],removed:true};if(fault==='range')logs[0]={...logs[0],blockNumber:2048n};if(fault==='emitter')logs[0]={...logs[0],address:a(99)};if(fault==='hash')logs[0]={...logs[0],blockHash:h(8)};if(fault==='index')logs[0]={...logs[0],logIndex:null};if(fault==='transaction')logs[0]={...logs[0],transactionHash:'0x'};if(fault==='topics')logs[0]={...logs[0],topics:['0x1']};if(fault==='data')logs[0]={...logs[0],data:'0xz'};if(fault==='conflict')logs.push({...logs[0],data:'0x12'});return logs;};
 f.rpc.request=async(q:any)=>{if(BigInt(q.params[0].fromBlock)===2049n){if(fault==='cash-query')throw Error('controlled child rejection');if(fault==='cash-scope')return [{...f.log(2051,1,a(9),[transfer,h(70),h(80)]),blockNumber:'0x803',transactionIndex:'0x0',logIndex:'0x1'}];}return request(q);};
 f.rpc.getBlock=async(q:any)=>{const b=await getBlock(q),n=b.number,count=f.reads.get(n)!;if(fault==='missing'&&n===2051n)return null;if(fault==='parent'&&n===2049n)b.parentHash=h(8);if((fault==='event-replaced'&&n===2051n&&count>1)||(fault==='start-replaced'&&n===2049n&&count>1)||(fault==='end-replaced'&&n===4096n&&count>1)||(fault==='finalized-replaced'&&n===4100n&&count>3)||(fault==='previous-replaced'&&n===2048n&&count>2))b.hash=h(999999);return b;};
 const index=f.index(),results=await Promise.allSettled([index.sync(),index.sync()]);assert.ok(results.every(r=>r.status==='rejected'));assert.equal(f.store.data.cursor?.blockNumber,'2048');assert.equal(f.calls.commits,1);assert.equal(f.calls.active,0);
});

test('restart validates coverage, preserves dense prefix, and rolls back entire replaced ranges',async()=>{
 const f=fixture(5000);f.setHead(55);await new Indexer(f.store,f.rpc,projection).sync();const prefix=structuredClone(f.store.data.blocks);f.setHead(5000);f.logs.push(f.log(200,0),f.log(2300,0));await f.index().sync();assert.deepEqual(f.store.data.blocks.slice(0,55),prefix);
 writeFileSync(f.store.path+'.tmp','incomplete');await new Indexer(new Store(f.store.path,identity),f.rpc,projection,{discovery:'finalized'}).sync();
 f.reorg(2400);f.logs.splice(1,1,f.log(2401,0));const commits:any[]=[];const replace=f.store.replace.bind(f.store);f.store.replace=b=>{commits.push(structuredClone(b));replace(b);};await f.index().sync();assert.equal(commits[0].at(-1).header.number,'2103');assert.ok(!f.store.data.blocks.flatMap(b=>b.logs).some(l=>l.blockNumber==='2300'));assert.deepEqual(f.store.data.blocks.slice(0,55),prefix);
 f.setFinalized(4000);const saved=structuredClone(f.store.data);await assert.rejects(f.index().sync(),/finalized/);assert.deepEqual(f.store.data,saved);
});

for(const fault of ['missing','scope','from','previous','selected','log','dense-gap'] as const)test(`restart rejects forged ${fault} coverage without mutating store`,async()=>{
 const f=fixture(5000);f.logs.push(f.log(200,0));await f.index().sync();const blocks=structuredClone(f.store.data.blocks),end=blocks.find(b=>b.evidence?.length)!;
 if(fault==='missing')delete end.evidence;else if(fault==='dense-gap'){for(const b of blocks)delete b.evidence;}else if(fault==='log')blocks.find(b=>b.logs.length)!.logs[0].blockHash=h(9);else{const coverage=end.evidence![0];if(fault==='scope')coverage.scope.cash=a(7);if(fault==='from')coverage.from='2';if(fault==='previous')coverage.previous={number:'0',hash:h(0)};if(fault==='selected')coverage.selected=[];}
 f.store.replace(blocks);const saved=structuredClone(f.store.data);await assert.rejects(f.index().sync(),/coverage|provenance/);assert.deepEqual(f.store.data,saved);
});

test('missing or pre-deployment finalized header fails without fallback',async()=>{
 const f=fixture();f.setFinalized(0);await assert.rejects(f.index().sync(),/finalized/);assert.equal(f.store.data.cursor,null);f.rpc.getBlock=async()=>null;await assert.rejects(f.index().sync(),/finalized|canonical/);assert.equal(f.store.data.cursor,null);
});

// A selected end header must agree with the captured finalized anchor even if a
// faulty provider later returns the original anchor again.
test('a transient replacement of the selected finalized header cannot be committed',async()=>{
 const f=fixture(20),get=f.rpc.getBlock.bind(f.rpc);f.rpc.getBlock=async(q:any)=>{const b=await get(q);if(b.number===20n&&f.reads.get(20n)===3)b.hash=h(999);return b;};
 await assert.rejects(f.index().sync(),/finalized|replaced/);assert.equal(f.store.data.cursor,null);
});

test('reorg with no common sparse ancestor rebuilds only from genuine deployment block',async()=>{
 const f=fixture(4100);await f.index().sync();f.reorg(1);const commits:any[]=[];const replace=f.store.replace.bind(f.store);f.store.replace=b=>{commits.push(structuredClone(b));replace(b);};await f.index().sync();assert.deepEqual(commits[0],[]);assert.equal(f.store.data.blocks[0]!.header.number,'1');assert.equal(f.store.data.cursor?.blockHash,h(1004100));
});

test('local sparse discovery and dense discovery yield identical pinned financial snapshots and actor sets',async()=>{
 const {localNode,deployLocal}=await import('../../../scripts/keeper-local.ts');const {encodeFunctionData,keccak256,toHex}=await import('viem');const {artifact}=await import('../abi.ts');const {indexedState}=await import('../state.ts');
 const node=await localNode();try{
  const d=(await deployLocal(node)).deployment;d.deploymentBlock=(await node.client.getBlockNumber()).toString();const owner=node.actors[0]!,lender=node.actors[1]!,recipient=node.actors[2]!,outsider=node.actors[8]!,watched=node.actors[9]!;
  const send=(who:any,c:string,method:string,args:any[])=>node.send(who,d.addresses[c]!,encodeFunctionData({abi:artifact(c==='pool'?'ProtectedPool':c==='registry'?'AssetRegistry':'MockCashToken').abi,functionName:method,args}));
  await send(owner,'cash','mint',[outsider,5n]);await send(owner,'cash','mint',[lender,1000000n]);await send(lender,'cash','approve',[d.addresses.pool,1000000n]);await send(lender,'pool','deposit',[1000000n]);await send(lender,'pool','transfer',[recipient,1n]);
  const asset=keccak256(toHex('SPARSE-DISCOVERY-ASSET'));await send(owner,'registry','scheduleAssetConfig',[asset,{assetToken:d.addresses.stock,stockTokenDecimals:18,cashTokenDecimals:6,originationLtvBps:6000,targetLtvBps:6500,triggerLtvBps:7500,rateNumerator:1,rateDenominator:18446744073709551615n,maxFills:8,maxActiveReceipts:32,supportedCorporateActions:6},1001n]);await node.time(1005n);
  // Anvil finality trails the tip by 64 blocks. Finalize the actual scenario
  // boundary, then compare both indexers at that same canonical block while all
  // header, log and financial reads use the real client and deployed contracts.
  const tip=await node.client.getBlock();await node.request('anvil_mine',['0x40']);
  const finalized=await node.client.getBlock({blockTag:'finalized'});assert.equal(finalized.number,tip.number);assert.equal(finalized.hash,tip.hash);
  const denseRpc={...node.client,getBlockNumber:async()=>finalized.number};
  const denseStore=new Store(join(mkdtempSync(join(tmpdir(),'bell-oracle-dense-')),'store.json'),d),sparseStore=new Store(join(mkdtempSync(join(tmpdir(),'bell-oracle-sparse-')),'store.json'),d);
  const dense=new Indexer(denseStore,denseRpc,projection),sparse=new Indexer(sparseStore,node.client,projection,{discovery:'finalized'});
  const denseState=await indexedState(dense,node.client,[watched]),sparseState=await indexedState(sparse,node.client,[watched]);assert.deepEqual(sparseState,denseState);assert.equal(sparseState.block.timestamp,1005n);assert.equal(sparseState.state.balances[outsider],undefined);assert.equal(sparseState.state.balances[recipient].poolShares,1n);assert.ok(sparseState.state.balances[watched]);assert.ok(sparseState.state.assets[asset]);assert.equal(sparseStore.data.blocks.at(-1)!.logs.length,0);
  assert.deepEqual(await indexedEvents(sparse,node.client,{number:sparseState.block.number,hash:sparseState.block.hash}),await indexedEvents(dense,node.client,{number:denseState.block.number,hash:denseState.block.hash}));
 }finally{await node.stop();}
});
