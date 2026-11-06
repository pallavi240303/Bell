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
  const rpc={getBlockNumber:async()=>chain.at(-1)!.number,getBlock:async({blockNumber}:{blockNumber:bigint})=>chain.find(b=>b.number===blockNumber)!,getLogs:async({fromBlock}:{fromBlock:bigint})=>fromBlock===2n?[log(2,2),log(2,0),log(2,0)]:[]};
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
  await assert.rejects(()=>new Indexer(store,rpc,async()=>({})).sync(),/parent/);assert.equal(store.data.cursor.blockNumber,'1');
});
