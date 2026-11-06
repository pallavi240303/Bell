import assert from 'node:assert/strict';
import test from 'node:test';
import {requiredComponents} from '../types.ts';
import {localNode,deployLocal} from '../../../scripts/keeper-local.ts';
import {snapshot} from '../state.ts';
import {artifact,contracts} from '../abi.ts';
import {encodeFunctionData,keccak256,toHex} from 'viem';

test('durable deployment includes LoanManager with reciprocal replay wiring and a final binding boundary',async()=>{
 assert.ok((requiredComponents as readonly string[]).includes('loanManager'),'LoanManager must be required');
 const node=await localNode();try{
  const {deployment:d,receipts}=await deployLocal(node);
  const read=(c:string,f:string)=>node.client.readContract({address:d.addresses[c]!,abi:artifact(contracts[c]!).abi,functionName:f});
  assert.equal(String(await read('manager','loanManager')).toLowerCase(),d.addresses.loanManager);
  assert.equal(String(await read('loanManager','coverManager')).toLowerCase(),d.addresses.manager);
  for(const c of ['pool','vault'])assert.equal(String(await read(c,'coverManager')).toLowerCase(),d.addresses.loanManager);
  assert.equal(await read('manager','profile'),1);assert.equal(await read('manager','coverOpensBeforeClose'),600n);
  assert.equal(d.deploymentBlock,receipts.at(-1)!.blockNumber.toString());
  const frame=await snapshot(node.client,d,[node.actors[1]!]);
  assert.deepEqual(frame.state.loans,{});assert.equal(frame.state.nextLoanId,1n);
  assert.deepEqual(frame.state.pool.activeLoanIds,[]);assert.equal(frame.state.balances[node.actors[1]!].cashAllowanceLoanManager,0n);
  const asset=keccak256(toHex('UNPRICED'));
  await node.send(node.actors[0]!,d.addresses.registry,encodeFunctionData({abi:artifact('AssetRegistry').abi,functionName:'scheduleAssetConfig',args:[asset,{assetToken:d.addresses.stock,stockTokenDecimals:18,cashTokenDecimals:6,originationLtvBps:6000,targetLtvBps:6500,triggerLtvBps:7500,rateNumerator:800,rateDenominator:315360000000n,maxFills:8,maxActiveReceipts:32,supportedCorporateActions:6},1001n]}));
  const logs=[{address:d.addresses.registry,decoded:{eventName:'AssetConfigScheduled',args:{assetId:asset}}}];
  const unpriced=await snapshot(node.client,d,[],[],undefined,logs);
  assert.equal(unpriced.state.assets[asset].referenceCheck.ok,false);
  assert.equal(unpriced.state.assets[asset].referenceCheck.referenceInvalidated,true);
 }finally{await node.stop();}
});

test('pinned fresh-reference facts preserve halt/unhalt invalidation and never mask transport or foreign reverts',async()=>{
 const {createLocalFixture}=await import('../replay.ts'),{referenceCheck}=await import('../state.ts'),{fn}=await import('../abi.ts'),{encodeAbiParameters}=await import('viem');
 const f=await createLocalFixture();try{
  await f.report(f.role('schedule'));await f.report(f.role('origination-price'));
  assert.equal((await f.observe()).state.assets[f.assetId].referenceCheck.ok,true);
  for(const [time,halted]of [[1300n,true],[1301n,false]] as const){
   await f.node.time(time);const state=await f.read('oracle','assetState',[f.assetId]);const {reference,role,...facts}=f.role('origination-price');
   const input={schemaVersion:1,...facts,kind:5,chainId:31337n,oracle:f.deployment.addresses.oracle,configHash:f.configHash,nonce:state.nextNonce,previousStateHash:state.stateHash,observedAt:time,validUntil:time+1000n,halted};
   const payload=encodeAbiParameters(fn('SessionOracle','acceptReport').inputs,[input]);await f.send(f.actors.owner!,'receiver','onReport',['0x',payload]);
  }
  const after=await f.observe(),asset=after.state.assets[f.assetId];assert.equal(asset.state.halted,false);assert.equal(asset.latestReference.observedAt,1200n);assert.equal(asset.referenceCheck.referenceInvalidated,true);assert.equal(asset.referenceCheck.ok,false);
  await assert.rejects(()=>referenceCheck(async()=>{throw Error('offline');},f.assetId),/offline/);
  await assert.rejects(()=>referenceCheck(async()=>{throw {data:'0x12345678'};},f.assetId));
 }finally{await f.stop();}
});

test('local replay preserves an explicitly expired borrow request instead of refreshing its consent',async()=>{
 const {createLocalFixture,replayInput}=await import('../replay.ts');const input=replayInput();input.borrow.expiry='1199';const f=await createLocalFixture(input);try{
  await f.approve(f.actors.lender!,'deposit');await f.action(f.actors.lender!,'pool','deposit',[input.lenderSupply]);await f.report(f.role('schedule'));await f.report(f.role('origination-price'));await f.approve(f.actors.borrower!,'collateral');
  await assert.rejects(f.borrow(),/requested action outcome/);assert.equal((await f.observe()).state.nextLoanId,1n);
 }finally{await f.stop();}
});
