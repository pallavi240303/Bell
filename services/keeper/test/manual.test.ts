import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {snapshot} from '../state.ts';
test('manual local bootstrap funds supplied public wallets but leaves their loan and offer actions unsigned',async()=>{
 const m=await import('../replay.ts');assert.equal(typeof m.bootstrapLocal,'function');
 const actors={lender:'0x0000000000000000000000000000000000000011',borrower:'0x0000000000000000000000000000000000000012',buyerA:'0x0000000000000000000000000000000000000013',buyerB:'0x0000000000000000000000000000000000000014'} as const;
 const f=await m.bootstrapLocal({port:0,actors,directory:mkdtempSync(join(tmpdir(),'bell-manual-'))});try{
  const {localNode}=await import('../../../scripts/keeper-local.ts');await assert.rejects(localNode({port:Number(new URL(f.metadata.rpcUrl!).port)}),/EADDRINUSE/);
  const frame=await f.observe();assert.equal(frame.state.nextLoanId,1n);assert.equal(frame.state.nextReceiptId,1n);assert.deepEqual(frame.state.offers,{});assert.equal(frame.state.pool.totalAssets,0n);
  assert.equal(frame.state.assets[f.assetId].referenceCheck.ok,true);const session=frame.state.sessions[f.sessionId].fact;assert.ok(frame.block.timestamp>=session.scheduledClose-600n&&frame.block.timestamp<session.scheduledClose-60n);
  for(const a of Object.values(actors)){assert.ok(frame.state.balances[a].cash>0n);assert.ok(frame.state.balances[a].stock>0n);assert.equal(frame.state.balances[a].cashAllowanceLoanManager,0n);assert.equal(frame.state.balances[a].cashAllowanceBook,0n);}
  const ref=frame.state.assets[f.assetId].latestReference;const policy=await f.read('manager','policyHash',[f.assetId,f.sessionId,f.configHash,ref.multiplierNumerator,ref.multiplierDenominator]);
  for(const buyer of [actors.buyerA,actors.buyerB]){assert.equal(await f.read('eligibility','isEligible',[f.assetId,buyer,policy]),true);assert.equal(await f.read('eligibility','isEligible',[f.assetId,buyer,'0x'+'ff'.repeat(32)]),false);}
  assert.equal(await f.read('eligibility','isEligible',[f.assetId,actors.borrower,policy]),false);
  assert.equal(JSON.parse(readFileSync(join(f.directory,'actors.json'),'utf8')).interactiveConsentVerified,false);
  await f.operatorStep('close');await f.operatorStep('reopen');assert.equal((await f.observe()).state.sessions[f.sessionId].benchmark.finalized,true);
 }finally{await f.stop();}
});

test('manual default buyers can approve and post through actor lane without invoking attach',async()=>{
 const {bootstrapLocal}=await import('../replay.ts');const f=await bootstrapLocal({port:0,directory:mkdtempSync(join(tmpdir(),'bell-manual-offer-'))});try{
  const frame=await f.observe(),ref=frame.state.assets[f.assetId].latestReference;const policyHash=await f.read('manager','policyHash',[f.assetId,f.sessionId,f.configHash,ref.multiplierNumerator,ref.multiplierDenominator]);
  assert.equal(frame.state.nextLoanId,1n);assert.equal(frame.state.pool.totalAssets,0n);assert.deepEqual(frame.state.offers,{});
  const buyer=f.actors.buyerA!;await f.approve(buyer,'offer');await f.action(buyer,'book','postOffer',[{...f.input.offerCommon,assetId:f.assetId,policyHash,strike:f.input.scenarios[0].buyers[0].strike,nonce:'1'}]);
  const after=await f.observe();assert.equal(Object.keys(after.state.offers).length,1);assert.equal(after.state.nextLoanId,1n);assert.equal(after.state.nextReceiptId,1n);assert.equal(after.state.pool.totalAssets,0n);assert.ok(after.state.book.totalLockedCash>0n);
 }finally{await f.stop();}
});
