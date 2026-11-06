import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {encodeFunctionData,keccak256,toHex} from 'viem';
import {localNode,deployLocal} from '../../../scripts/keeper-local.ts';
import {artifact} from '../abi.ts';
import {Store} from '../store.ts';
import {Indexer} from '../indexer.ts';
import {snapshot} from '../state.ts';
import {verifyDeployment} from '../config.ts';
test('review 4: indexed evidence retains historical provenance and rejects stale canonical boundaries',async()=>{
  const {indexedEvents}=(await import('../state.ts')) as any;assert.equal(typeof indexedEvents,'function');
  const hash=(n:string)=>`0x${n.repeat(64)}`;
  const address='0x0000000000000000000000000000000000000001';
  const blocks=[{header:{number:'1',hash:hash('1'),timestamp:'10'},logs:[{address,blockNumber:'1',blockHash:hash('1')}]},{header:{number:'2',hash:hash('2'),timestamp:'20'},logs:[{address,blockNumber:'2',blockHash:hash('2')}] }];
  let syncs=0;
  const index={store:{deployment:{addresses:{manager:address,cash:'0x0000000000000000000000000000000000000002'}},data:{blocks}},sync:async()=>{syncs++;}};
  const rpc={getBlock:async({blockNumber}:any)=>({number:blockNumber,hash:hash(blockNumber.toString()),timestamp:blockNumber*10n})};
  const evidence=await indexedEvents(index,rpc,{number:1n,hash:hash('1')});assert.equal(evidence.block.number,1n);assert.equal(evidence.events.length,1);assert.equal(evidence.events[0].blockTimestamp,10n);assert.equal(syncs,0,'committed boundary returns without catching up to a newer head');
  await assert.rejects(()=>indexedEvents(index,rpc,{number:1n,hash:hash('3')}),/boundary/);assert.equal(syncs,1,'missing boundary still syncs');
  await indexedEvents(index,rpc);assert.equal(syncs,2,'unprovided boundary still syncs');
  rpc.getBlock=async()=>({number:1n,hash:hash('3'),timestamp:10n});await assert.rejects(()=>indexedEvents(index,rpc,{number:1n,hash:hash('1')}),/replaced/);assert.equal(syncs,2,'fast path never skips canonical replacement rejection');
});

test('API state never combines new config discovery or reorg identifiers with a different block',async()=>{
  const state=await import('../state.ts') as any;assert.equal(typeof state.indexedState,'function','indexed API state is required');
  const node=await localNode();try{
    const {deployment:d}=await deployLocal(node);d.deploymentBlock=(await node.client.getBlockNumber()).toString();
    const store=new Store(join(mkdtempSync(join(tmpdir(),'bell-api-block-')),'store.json'),d);
    const index=new Indexer(store,node.client,(block,logs,history)=>snapshot(node.client,d,[],[],block,[...history.flatMap(b=>b.logs),...logs]));await index.sync();
    const old=store.data.cursor!,checkpoint=await node.request('evm_snapshot');const asset=keccak256(toHex('AFTER-SYNC'));
    await node.send(node.actors[0]!,d.addresses.registry!,encodeFunctionData({abi:artifact('AssetRegistry').abi,functionName:'scheduleAssetConfig',args:[asset,{assetToken:d.addresses.stock,stockTokenDecimals:18,cashTokenDecimals:6,originationLtvBps:6000,targetLtvBps:6500,triggerLtvBps:7500,rateNumerator:1,rateDenominator:18446744073709551615n,maxFills:8,maxActiveReceipts:32,supportedCorporateActions:6},1001n]}));
    // A new config lands after this request's sync completed. Its reads must stay at that sync's block.
    const priorSync={store,sync:async()=>{}};const response=await state.indexedState(priorSync,node.client);
    assert.equal(response.block.number.toString(),old.blockNumber);assert.equal(response.block.hash,old.blockHash);assert.equal(response.state.assets[asset],undefined);
    const advanced=await state.indexedState(index,node.client);assert.ok(advanced.state.assets[asset]);assert.equal(advanced.block.hash,store.data.cursor!.blockHash);
    await node.request('evm_revert',[checkpoint]);await node.time(1002n);
    await assert.rejects(()=>state.indexedState(priorSync,node.client),/replaced/);
    const repaired=await state.indexedState(index,node.client);assert.equal(repaired.state.assets[asset],undefined);assert.equal(repaired.block.hash,store.data.cursor!.blockHash);
  }finally{await node.stop();}
});

test('deposit-only lenders and later pool share recipients are discovered without a watch list',async()=>{
  const node=await localNode();try{
    const {deployment:d}=await deployLocal(node);d.deploymentBlock=(await node.client.getBlockNumber()).toString();const lender=node.actors[1]!,recipient=node.actors[2]!,watched=node.actors[3]!;
    const store=new Store(join(mkdtempSync(join(tmpdir(),'bell-actors-')),'store.json'),d);
    const index=new Indexer(store,node.client,(block,logs,history)=>snapshot(node.client,d,[],[],block,[...history.flatMap(b=>b.logs),...logs]));
    const send=async(c:string,method:string,args:any[])=>node.send(lender,d.addresses[c]!,encodeFunctionData({abi:artifact(c==='pool'?'ProtectedPool':'MockCashToken').abi,functionName:method,args}));
    await send('cash','mint',[lender,1000000n]);await send('cash','approve',[d.addresses.pool,1000000n]);await send('pool','deposit',[1000000n]);await index.sync();
    assert.ok(store.data.blocks.at(-1)!.projection.state.balances[lender],'deposit-only lender must be discovered');
    await send('pool','transfer',[recipient,1n]);await index.sync();const last=store.data.blocks.at(-1)!;
    assert.equal(last.projection.state.balances[recipient].poolShares,'1');assert.equal(last.projection.block.hash,last.header.hash);
    const current=await snapshot(node.client,d,[watched]);assert.ok(current.state.balances[watched],'explicit watch remains supported');
    assert.equal(current.state.balances[lender]?.cashAllowancePool,undefined);
    assert.equal(current.state.balances[watched].cashAllowancePool,0n);
    assert.equal(current.state.balances[watched].cashAllowanceBook,0n);
    assert.equal(typeof current.state.balances[watched].nativeGas,'bigint');
    assert.equal((current.state as any).tokens.stock.paused,false);
    assert.equal((current.state as any).tokens.cash.decimals,6n);
  }finally{await node.stop();}
});

test('real pool deposit and empty block refresh, Anvil reorg rollback, code identity and restart',async()=>{
  const node=await localNode();
  try{
    const {deployment:d}=await deployLocal(node);d.deploymentBlock=(await node.client.getBlockNumber()).toString();const a=d.addresses,owner=node.actors[0]!;
    await verifyDeployment(node.client,d);
    await assert.rejects(()=>verifyDeployment(node.client,{...d,chainId:'5042002'}),/chain mismatch/);
    await assert.rejects(()=>verifyDeployment(node.client,{...d,codeHashes:{...d.codeHashes,pool:`0x${'0'.repeat(64)}`}}),/code mismatch/);
    const path=join(mkdtempSync(join(tmpdir(),'bell-real-index-')),'store.json');let store=new Store(path,d);
    const build=()=>new Indexer(store,node.client,(block,logs,history)=>snapshot(node.client,d,[owner],[],block,[...history.flatMap(b=>b.logs),...logs]));let index=build();await index.sync();
    const asset=keccak256(toHex('INDEXED-ASSET'));
    await node.send(owner,a.registry!,encodeFunctionData({abi:artifact('AssetRegistry').abi,functionName:'scheduleAssetConfig',args:[asset,{assetToken:a.stock,stockTokenDecimals:18,cashTokenDecimals:6,originationLtvBps:6000,targetLtvBps:6500,triggerLtvBps:7500,rateNumerator:1,rateDenominator:18446744073709551615n,maxFills:8,maxActiveReceipts:32,supportedCorporateActions:6},1001n]}));
    await index.sync();assert.ok(store.data.blocks.at(-1)!.projection.state.assets,'pre-receipt asset facts required');assert.equal(store.data.blocks.at(-1)!.projection.state.assets[asset].configs['1'].config.targetLtvBps,'6500');
    const checkpoint=await node.request('evm_snapshot');const base=store.data.cursor!;
    const send=async(c:string,name:string,args:any[])=>node.send(owner,a[c]!,encodeFunctionData({abi:artifact(c==='pool'?'ProtectedPool':'MockCashToken').abi,functionName:name,args}));
    await send('cash','mint',[owner,1000000n]);await send('cash','approve',[a.pool,1000000n]);await send('pool','deposit',[1000000n]);await node.time(1005n);await index.sync();
    assert.equal(store.data.blocks.at(-1)!.projection.state.pool.totalAssets,'1000000');assert.equal(store.data.blocks.at(-1)!.header.timestamp,'1005');assert.equal(store.data.blocks.at(-1)!.logs.length,0);
    assert.equal(store.data.blocks.some(b=>b.logs.some(l=>l.decoded?.eventName==='Transfer')),true);
    await node.request('evm_revert',[checkpoint]);await index.sync();assert.deepEqual(store.data.cursor,base);assert.equal(store.data.blocks.at(-1)!.projection.state.pool.totalAssets,'0');
    await node.time(1006n);await index.sync();assert.equal(store.data.blocks.at(-1)!.header.timestamp,'1006');
    store=new Store(path,d);index=build();await index.sync();assert.equal(store.data.blocks.at(-1)!.projection.state.pool.totalAssets,'0');
  }finally{await node.stop();}
});

test('shared cash-only activity does not discover unrelated users, while protocol cash counterparties and share recipients remain discoverable',async()=>{
 const node=await localNode();try{
 const {deployment:d}=await deployLocal(node);d.deploymentBlock=(await node.client.getBlockNumber()).toString();const owner=node.actors[0]!,unrelated=node.actors[7]!,recipient=node.actors[8]!,lender=node.actors[1]!,shareRecipient=node.actors[2]!,approved=node.actors[3]!;
 const store=new Store(join(mkdtempSync(join(tmpdir(),'bell-shared-cash-')),'store.json'),d),index=new Indexer(store,node.client,async()=>({discoveryOnly:true}));
 const send=(who:any,c:string,f:string,args:any[])=>node.send(who,d.addresses[c]!,encodeFunctionData({abi:artifact(c==='cash'?'MockCashToken':'ProtectedPool').abi,functionName:f,args}));
 const unrelatedReceipts=[await send(owner,'cash','mint',[unrelated,100n]),await send(unrelated,'cash','transfer',[recipient,1n]),await send(unrelated,'cash','approve',[recipient,1n])];
 await send(owner,'cash','mint',[lender,1000000n]);await send(lender,'cash','approve',[d.addresses.pool,1000000n]);await send(lender,'pool','deposit',[1000000n]);await send(lender,'pool','transfer',[shareRecipient,1n]);await send(approved,'cash','approve',[d.addresses.book,1n]);
 const {indexedState}=await import('../state.ts');const observed=await indexedState(index,node.client);
 assert.equal(observed.state.balances[unrelated],undefined);assert.equal(observed.state.balances[recipient],undefined);assert.equal(observed.state.balances[lender].poolShares,999999999999999999n);assert.equal(observed.state.balances[shareRecipient].poolShares,1n);assert.ok(observed.state.balances[approved]);
 assert.ok(store.data.blocks.flatMap(b=>b.logs).some(l=>l.decoded?.args?.from===unrelated),'unrelated raw cash logs remain available as provenance');
 const {indexedEvents}=await import('../state.ts');const exposed=await indexedEvents(index,node.client,{number:observed.block.number,hash:observed.block.hash});
 const rawLogs=store.data.blocks.flatMap(b=>b.logs);for(const receipt of unrelatedReceipts){assert.ok(rawLogs.some(l=>l.transactionHash===receipt.transactionHash),'raw unrelated cash transaction remains stored');assert.ok(!exposed.events.some(l=>l.transactionHash===receipt.transactionHash),'unrelated cash transaction is excluded from BELL API evidence');}
 assert.equal(exposed.block.hash,observed.block.hash);assert.ok(exposed.events.some(l=>l.address===d.addresses.cash&&l.decoded?.eventName==='Approval'&&l.decoded.args.spender===d.addresses.pool));assert.ok(exposed.events.some(l=>l.address===d.addresses.cash&&l.decoded?.eventName==='Transfer'&&l.decoded.args.to===d.addresses.pool));assert.ok(exposed.events.some(l=>l.address===d.addresses.cash&&l.decoded?.eventName==='Approval'&&l.decoded.args.spender===d.addresses.book));assert.ok(exposed.events.some(l=>l.address===d.addresses.pool&&l.decoded?.eventName==='Transfer'&&l.decoded.args.to===shareRecipient));
 }finally{await node.stop();}
});
