import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
const h=(n:number)=>`0x${n.toString(16).padStart(64,'0')}`;
async function modules(){const m=await Promise.all([import('../store.ts').catch(()=>null),import('../indexer.ts').catch(()=>null)]);assert.ok(m.every(Boolean),'persistent canonical indexer is required');return m as any;}

test('ordering, duplicates, empty blocks, gaps, reconnect, atomic restart and replacement rollback',async()=>{
  const [{Store},{Indexer}]=await modules();
  const path=join(mkdtempSync(join(tmpdir(),'bell-index-')),'store.json');
  const identity={chainId:'31337',deploymentBlock:'1',addresses:{manager:'0x0000000000000000000000000000000000000001'}};
  let chain=[1,2,3,4].map(n=>({number:BigInt(n),hash:h(n),parentHash:h(n-1),timestamp:BigInt(n*10)}));
  const log=(n:number,i:number)=>({blockNumber:BigInt(n),blockHash:chain.find(b=>b.number===BigInt(n))!.hash,transactionIndex:0,logIndex:i,address:identity.addresses.manager,data:'0x',topics:[],transactionHash:h(100+n)});
  const rpc={getBlockNumber:async()=>chain.at(-1)!.number,getBlock:async({blockNumber}:{blockNumber:bigint})=>chain.find(b=>b.number===blockNumber)!,getLogs:async({fromBlock,toBlock}:{fromBlock:bigint;toBlock:bigint})=>fromBlock<=2n&&toBlock>=2n?[log(2,2),log(2,0),log(2,0)]:[]};
  const refresh=async(b:any)=>({time:b.timestamp});
  let store=new Store(path,identity); let index=new Indexer(store,rpc,refresh);
  await index.sync();assert.equal(store.data.blocks.length,4);assert.equal(store.data.cursor.blockNumber,'4');
  assert.deepEqual(store.data.blocks[1].logs.map((l:any)=>l.logIndex),['0','2']);assert.equal(store.data.blocks[3].projection.time,'40');
  await index.sync();assert.equal(store.data.blocks[1].logs.length,2);
  writeFileSync(path+'.tmp','incomplete');store=new Store(path,identity);index=new Indexer(store,rpc,refresh);await index.sync();assert.equal(store.data.blocks.length,4);
  chain[3]={...chain[3]!,hash:h(40)};await index.sync();assert.equal(store.data.cursor.blockHash,h(40));
  chain=chain.slice(0,2);await index.sync();assert.equal(store.data.blocks.length,2);assert.equal(store.data.cursor.blockHash,h(2));
  chain.push({number:3n,hash:h(30),parentHash:h(2),timestamp:31n},{number:4n,hash:h(41),parentHash:h(30),timestamp:41n});await index.sync();assert.equal(store.data.blocks[2].header.hash,h(30));
  chain=chain.map((b,i)=>({...b,hash:h(50+i),parentHash:h(49+i)}));await index.sync();assert.equal(store.data.blocks[0].header.hash,h(50));
  assert.throws(()=>new Store(path,{...identity,chainId:'5042002'}),/deployment/);
});

test('failed read or inconsistent parent never commits an incomplete block',async()=>{
  const [{Store},{Indexer}]=await modules();const path=join(mkdtempSync(join(tmpdir(),'bell-fail-')),'store.json');
  const identity={chainId:'31337',deploymentBlock:'1',addresses:{manager:'0x0000000000000000000000000000000000000001'}};
  const store=new Store(path,identity);const rpc={getBlockNumber:async()=>2n,getBlock:async({blockNumber:n}:any)=>({number:n,hash:h(Number(n)),parentHash:h(99),timestamp:n}),getLogs:async()=>[]};
  await assert.rejects(()=>new Indexer(store,rpc,async()=>{throw Error('offline');}).sync());assert.equal(store.data.cursor,null);
  await assert.rejects(()=>new Indexer(store,rpc,async()=>({})).sync(),/parent/);assert.equal(store.data.cursor,null,'a failed chunk publishes no prefix');
});

test('partial 55-block store catches up in bounded atomic batches and concurrent callers share one sync',async()=>{
 const [{Store},{Indexer}]=await modules();const path=join(mkdtempSync(join(tmpdir(),'bell-batch-')),'store.json');
 const identity={chainId:'31337',deploymentBlock:'1',addresses:{manager:'0x0000000000000000000000000000000000000001'}};
 let chain=Array.from({length:185},(_,i)=>({number:BigInt(i+1),hash:h(i+1),parentHash:h(i),timestamp:BigInt(i+1)}));
 const store=new Store(path,identity);store.replace(chain.slice(0,55).map(b=>({header:{...b,number:b.number.toString(),timestamp:b.timestamp.toString()},logs:[],projection:{discoveryOnly:true}})));
 const prefix=structuredClone(store.data.blocks);let commits=0,logCalls=0,active=0,peak=0;const replace=store.replace.bind(store);store.replace=(b:any)=>{commits++;replace(b);};
 const rpc={getBlockNumber:async()=>185n,getBlock:async({blockNumber}:any)=>{active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;return chain[Number(blockNumber)-1];},getLogs:async({fromBlock,toBlock}:any)=>{logCalls++;return fromBlock<=71n&&toBlock>=71n?[2,0,0].map(i=>({blockNumber:71n,blockHash:chain[70]!.hash,transactionIndex:0,logIndex:i,address:identity.addresses.manager,data:'0x',topics:[],transactionHash:h(700)})):[];}};
 const index=new Indexer(store,rpc,async(_b:any,_l:any,history:any[])=>({history:history.length}));const results=await Promise.allSettled([index.sync(),index.sync()]);
 assert.ok(results.every(r=>r.status==='fulfilled'),'concurrent callers await the same catch-up rather than fail');
 assert.equal(logCalls,3,'one range query per at most 64 blocks');assert.equal(commits,3,'one atomic publication per fully verified chunk');assert.ok(peak>1&&peak<=8,'header reads use bounded concurrency');
 assert.equal(store.data.blocks.length,185);assert.deepEqual(store.data.blocks.slice(0,55),prefix);assert.deepEqual(store.data.blocks[70].logs.map((l:any)=>l.logIndex),['0','2']);assert.equal(store.data.blocks[184].projection.history,184);
 chain=chain.map((b,i)=>i<174?b:{...b,hash:h(1000+i+1),parentHash:i===174?h(174):h(1000+i)});await index.sync();assert.equal(store.data.cursor.blockHash,h(1185));assert.deepEqual(store.data.blocks.slice(0,55),prefix);
 const restarted=new Store(path,identity);assert.equal(restarted.data.cursor.blockHash,h(1185));assert.equal(restarted.data.blocks.length,185);
});
for(const fault of ['parent','log','replaced'] as const)test(`invalid ${fault} in a later batch preserves only the earlier complete chunk`,async()=>{
 const [{Store},{Indexer}]=await modules();const identity={chainId:'31337',deploymentBlock:'1',addresses:{manager:'0x0000000000000000000000000000000000000001'}},store=new Store(join(mkdtempSync(join(tmpdir(),'bell-batch-fail-')),'store.json'),identity);const reads=new Map<bigint,number>();
 const rpc={getBlockNumber:async()=>77n,getBlock:async({blockNumber:n}:any)=>{const count=(reads.get(n)??0)+1;reads.set(n,count);return {number:n,hash:fault==='replaced'&&n===70n&&count>1?h(7000):h(Number(n)),parentHash:fault==='parent'&&n===70n?h(999):h(Number(n)-1),timestamp:n};},getLogs:async({fromBlock}:any)=>fault==='log'&&fromBlock===65n?[{blockNumber:71n,blockHash:h(999),transactionIndex:0,logIndex:0,address:identity.addresses.manager,data:'0x',topics:[]}]:[]};
 await assert.rejects(new Indexer(store,rpc,async()=>({discoveryOnly:true})).sync(),/parent|log|replaced/);assert.equal(store.data.cursor.blockNumber,'64');assert.equal(store.data.blocks.length,64);
});
