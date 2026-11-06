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
