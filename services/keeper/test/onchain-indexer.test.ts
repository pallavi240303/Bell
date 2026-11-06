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
