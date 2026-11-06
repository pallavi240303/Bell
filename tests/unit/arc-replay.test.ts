import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {decodeFunctionData,getAddress,keccak256,toHex,type Address} from 'viem';
import {localNode,deployLocal} from '../../scripts/keeper-local.ts';
import {artifact} from '../../services/keeper/abi.ts';
import {bindReport} from '../../services/keeper/replay.ts';
import {policyHash} from '../../engine/quote.ts';
import {integers,raw} from '../../services/keeper/types.ts';
import {validateSmokeScenario,prepareSmoke,verifySmokeReceipt,verifySmokeReport,bindSmokeReport,type SmokeScenario,type SmokePacket} from '../../scripts/arc-replay.ts';
const zero=`0x${'0'.repeat(64)}`;
function scenario(actors:Address[],d:any):SmokeScenario{
 const fixture=JSON.parse(readFileSync('services/keeper/fixtures/replay.json','utf8')),assetId=keccak256(toHex('SMOKE')),sessionId=keccak256(toHex('EXPLICIT-TEST-SESSION'));
 const policy=policyHash(31337n,d.addresses.manager,assetId,sessionId,keccak256(toHex('PLACEHOLDER')),1n,1n,1n,600n,60n);
 return {actors:Object.fromEntries(['owner','lender','borrower','buyerA','buyerB','keeper'].map((r,i)=>[r,actors[i]!])) as SmokeScenario['actors'],assetId,sessionId,effectiveAt:'1100',lenderSupply:'1000000',loanId:'1',receiptId:'1',config:{...fixture.config,assetToken:d.addresses.stock},borrow:{configVersion:'1',principal:'500000',collateralShares:'10000000000000000',expiry:'2900'},consent:{...fixture.consent,principal:'500000',collateralShares:'10000000000000000',referencePrice:'100000000',totalPremium:'200',totalOfferShares:'10000000000000000',weightedStrike:'95000000',expiry:'2939',minSettlementDeadline:'3100',maxSettlementDeadline:'3100',maxDebtAtAcceptance:'600000',maxDebtAtDeadline:'600000'},offers:[{actor:'buyerA',approvalAmount:'500000',terms:{...fixture.offerCommon,assetId,policyHash:policy,snapshotShares:'5000000000000000',strike:'100000000',nonce:'0',expiry:'3100'}},{actor:'buyerB',approvalAmount:'450000',terms:{...fixture.offerCommon,assetId,policyHash:policy,snapshotShares:'5000000000000000',strike:'90000000',nonce:'0',expiry:'3100'}}]};
}
test('smoke scenarios reject actor impersonation, unsupported rates and excess test exposure',()=>{
 const actors=Array.from({length:6},(_,i)=>`0x${String(i+1).padStart(40,'0')}` as Address),stock='0x0000000000000000000000000000000000000010' as Address;
 const s=scenario(actors,{addresses:{stock,manager:stock}});validateSmokeScenario(s);
 for(const change of [(x:any)=>x.actors.buyerA=x.actors.borrower,(x:any)=>x.config.rateDenominator='1',(x:any)=>x.borrow.principal='500001',(x:any)=>delete x.sessionId]){const bad=structuredClone(s);change(bad);assert.throws(()=>validateSmokeScenario(bad));}
 const economicRoles=['lender','borrower','buyerA','buyerB'] as const;
 for(let i=0;i<economicRoles.length;i++)for(let j=i+1;j<economicRoles.length;j++){
  const bad=structuredClone(s);bad.actors[economicRoles[j]!]=bad.actors[economicRoles[i]!];assert.throws(()=>validateSmokeScenario(bad),/distinct/i);
 }
 for(const role of ['owner','lender','borrower','buyerA','buyerB','keeper'] as const)for(const address of [undefined,`0x${'0'.repeat(40)}`]){
  const bad=structuredClone(s);if(address===undefined)delete (bad.actors as any)[role];else bad.actors[role]=address as Address;assert.throws(()=>validateSmokeScenario(bad),/explicit/i);
 }
});
test('four economic wallets can share the registry owner, lender and permissionless keeper for genuine supply',async()=>{
 const node=await localNode();try{
 const d=(await deployLocal(node)).deployment,s=scenario([node.actors[0]!,node.actors[0]!,node.actors[1]!,node.actors[2]!,node.actors[3]!,node.actors[0]!],d);
 const {encodeFunctionData}=await import('viem');
 await node.send(s.actors.owner,d.addresses.cash,encodeFunctionData({abi:artifact('MockCashToken').abi,functionName:'mint',args:[s.actors.lender,1000000n]}));
 const approval=await prepareSmoke(node.client,d,s,'approve-lender');
 assert.equal(approval.broadcast,false);assert.equal(approval.transaction.from,s.actors.lender);assert.equal(approval.transaction.to,d.addresses.cash);
 assert.deepEqual(decodeFunctionData({abi:artifact('MockCashToken').abi,data:approval.transaction.data}),{functionName:'approve',args:[getAddress(d.addresses.pool),1000000n]});
 const approved=await node.send(approval.transaction.from,approval.transaction.to,approval.transaction.data);await verifySmokeReceipt(node.client,d,s,raw<SmokePacket>(approval),approved.transactionHash);
 const supply=await prepareSmoke(node.client,d,s,'supply');
 assert.equal(supply.broadcast,false);assert.equal(supply.transaction.from,s.actors.lender);assert.equal(supply.transaction.to,d.addresses.pool);
 assert.deepEqual(decodeFunctionData({abi:artifact('ProtectedPool').abi,data:supply.transaction.data}),{functionName:'deposit',args:[1000000n]});
 const receipt=await node.send(supply.transaction.from,supply.transaction.to,supply.transaction.data),verified=await verifySmokeReceipt(node.client,d,s,raw<SmokePacket>(supply),receipt.transactionHash);
 assert.equal(verified.after.state.pool.totalAssets,1000000n);assert.equal(verified.after.state.pool.totalSupply,1000000000000000000n);
 const wrongOwner=structuredClone(s);wrongOwner.actors.owner=s.actors.borrower;await assert.rejects(prepareSmoke(node.client,d,wrongOwner,'approve-lender'),/registry owner/i);
 }finally{await node.stop();}
});
test('unsigned smoke packets execute actual contracts and stop at report/consent gates',async()=>{
 const node=await localNode();try{
 const d=(await deployLocal(node)).deployment,s=scenario(node.actors,d);
 const prepare=(action:string)=>prepareSmoke(node.client,d,s,action);
 const execute=async(action:string)=>{const p=await prepare(action),r=await node.send(p.transaction.from,p.transaction.to,p.transaction.data);return verifySmokeReceipt(node.client,d,s,raw<SmokePacket>(p),r.transactionHash);};
 const missing=structuredClone(d);delete missing.addresses.eligibility;delete missing.codeHashes.eligibility;await assert.rejects(prepareSmoke(node.client,missing,s,'eligible-buyerA'),/destination/i);
 const p=await prepare('config');assert.equal(p.transaction.from,s.actors.owner);assert.equal(p.transaction.to,d.addresses.registry);assert.equal(decodeFunctionData({abi:artifact('AssetRegistry').abi,data:p.transaction.data}).functionName,'scheduleAssetConfig');assert.equal(p.broadcast,false);
 await execute('config');await execute('mint-collateral');
 const configHash=await node.client.readContract({address:d.addresses.registry,abi:artifact('AssetRegistry').abi,functionName:'configHash',args:[s.assetId,1n]}) as `0x${string}`;
 for(const o of s.offers)o.terms.policyHash=policyHash(31337n,d.addresses.manager,s.assetId,s.sessionId,configHash,1n,1n,1n,600n,60n);
 await execute('eligible-buyerA');await execute('eligible-buyerB');
 const cash=artifact('MockCashToken');
 for(const role of ['lender','borrower','buyerA','buyerB'] as const){const {encodeFunctionData}=await import('viem');await node.send(s.actors.owner!,d.addresses.cash,encodeFunctionData({abi:cash.abi,functionName:'mint',args:[s.actors[role],1000000n]}));}
 for(const action of ['approve-lender','supply','approve-collateral'])await execute(action);
 await node.time(1100n);await assert.rejects(prepare('borrow'),/ReferenceUnavailable/i);
 const fact={reference:'EXPLICIT LOCAL TEST FACTS ONLY',kind:'1',assetId:s.assetId,sessionId:s.sessionId,observedAt:'1000',validUntil:'3300',scheduledOpen:'1100',scheduledClose:'3000',benchmarkPrice:'0',corporateAction:'0',actionId:zero,multiplierNumerator:'0',multiplierDenominator:'0',halted:false,primarySourceHash:keccak256(toHex('EXPLICIT LOCAL TEST SOURCE')),secondarySourceHash:zero};
 const bound=await bindSmokeReport(node.client,d,s,fact);assert.equal(bound.authority,'SUPPLIED FACTS · SIMULATION ONLY');
 const {encodeFunctionData}=await import('viem');const reportReceipt=await node.send(s.actors.owner!,d.addresses.receiver,encodeFunctionData({abi:artifact('SimulationMarketEventReceiver').abi,functionName:'onReport',args:['0x',bound.payload]}));
 const acceptance=await verifySmokeReport(node.client,d,s,bound,reportReceipt.transactionHash);assert.equal(acceptance.accepted,true);
 await assert.rejects(verifySmokeReport(node.client,d,s,{...bound,payload:'0x'},reportReceipt.transactionHash),/report/i);
 const price={...fact,kind:'6',sessionId:zero,reference:'EXPLICIT LOCAL PRICE',observedAt:'1200',validUntil:'2900',benchmarkPrice:'100000000',multiplierNumerator:'1',multiplierDenominator:'1',secondarySourceHash:keccak256(toHex('SECOND LOCAL SOURCE'))};
 await node.time(1200n);const priceBound=await bindSmokeReport(node.client,d,s,price);const priceReceipt=await node.send(s.actors.owner,d.addresses.receiver,encodeFunctionData({abi:artifact('SimulationMarketEventReceiver').abi,functionName:'onReport',args:['0x',priceBound.payload]}));assert.equal((await verifySmokeReport(node.client,d,s,priceBound,priceReceipt.transactionHash)).accepted,true);
 const borrowed=await execute('borrow');assert.equal(borrowed.postcondition,'EXACT ENGINE TRANSITION PARITY');assert.equal(borrowed.after.state.loans['1'].debtRecord.terms.originalPrincipal,500000n);assert.equal(borrowed.after.state.nextReceiptId,1n);
 await node.time(2400n);for(const action of ['approve-buyerA','post-buyerA','approve-buyerB','post-buyerB','approve-premium'])await execute(action);
 const covered=await execute('buyCover');assert.equal(covered.postcondition,'EXACT ENGINE TRANSITION PARITY');assert.equal(covered.after.state.loans['1'].debtRecord.terms.startTime,1200n);assert.equal(covered.before.state.balances[s.actors.borrower].cash-covered.after.state.balances[s.actors.borrower].cash,200n);
 await assert.rejects(prepare('settle'),/benchmark|Benchmark|report/i);await assert.rejects(prepare('terminal'),/deadline|Deadline/i);
 await node.time(3100n);const closed=await execute('terminal');assert.equal(closed.postcondition,'EXACT ENGINE TRANSITION PARITY');assert.equal(closed.after.state.loans['1'].debt,0n);
 const tampered=structuredClone(p);tampered.transaction.data='0x';await assert.rejects(verifySmokeReceipt(node.client,d,s,tampered,borrowed.transactionHash),/transaction|identity/i);
 }finally{await node.stop();}
});

test('receipt verification rejects an unrelated successful transaction substituted into a genuine supply packet',async()=>{
 const node=await localNode();try{
 const d=(await deployLocal(node)).deployment,s=scenario(node.actors,d);
 const {encodeFunctionData}=await import('viem');
 await node.send(s.actors.owner,d.addresses.cash,encodeFunctionData({abi:artifact('MockCashToken').abi,functionName:'mint',args:[s.actors.lender,1000000n]}));
 const approval=await prepareSmoke(node.client,d,s,'approve-lender');await node.send(approval.transaction.from,approval.transaction.to,approval.transaction.data);
 const supply=await prepareSmoke(node.client,d,s,'supply');
 const unrelated=await prepareSmoke(node.client,d,s,'approve-premium');
 const receipt=await node.send(unrelated.transaction.from,unrelated.transaction.to,unrelated.transaction.data);
 const forged=raw<SmokePacket>(supply);forged.transaction={...forged.transaction,from:unrelated.transaction.from,to:unrelated.transaction.to,data:unrelated.transaction.data};
 assert.equal(forged.scenarioHash,supply.scenarioHash);assert.equal(forged.deploymentHash,supply.deploymentHash);assert.equal(receipt.status,'success');
 await assert.rejects(verifySmokeReceipt(node.client,d,s,forged,receipt.transactionHash),/scenario action|packet|transaction/i);
 }finally{await node.stop();}
});

/** Local-only test builder deliberately creates pre-existing protocol state outside smoke limits. */
async function fix1Fixture(change:Record<string,string>={},principal='500000',shares='10000000000000000'){
 const node=await localNode();try{
  const d=(await deployLocal(node)).deployment,s=scenario(node.actors,d),{argsFor,contracts}=await import('../../services/keeper/abi.ts'),{encodeFunctionData}=await import('viem');
  const send=(role:keyof SmokeScenario['actors'],c:string,method:string,args:any[])=>node.send(s.actors[role],d.addresses[c]!,encodeFunctionData({abi:artifact(contracts[c]!).abi,functionName:method,args:argsFor(contracts[c]!,method,raw(args))}));
  const actual={...s.config,...change};await send('owner','registry','scheduleAssetConfig',[s.assetId,actual,s.effectiveAt]);
  const configHash=await node.client.readContract({address:d.addresses.registry,abi:artifact('AssetRegistry').abi,functionName:'configHash',args:[s.assetId,1n]}) as `0x${string}`;
  for(const role of ['lender','borrower','buyerA','buyerB'] as const)await send('owner','cash','mint',[s.actors[role],'10000000']);
  await send('owner','stock','mint',[s.actors.borrower,'1000000000000000000']);await send('lender','cash','approve',[d.addresses.pool,'10000000']);await send('lender','pool','deposit',['10000000']);await send('borrower','stock','approve',[d.addresses.vault,'1000000000000000000']);
  const schedule={reference:'FIX1 LOCAL SCHEDULE',kind:'1',assetId:s.assetId,sessionId:s.sessionId,observedAt:'1000',validUntil:'3300',scheduledOpen:'1100',scheduledClose:'3000',benchmarkPrice:'0',corporateAction:'0',actionId:zero,multiplierNumerator:'0',multiplierDenominator:'0',halted:false,primarySourceHash:keccak256(toHex('FIX1 PRIMARY')),secondarySourceHash:zero};
  const reports:any[]=[];
  const report=async(fact:any)=>{await node.time(BigInt(fact.observedAt));const bound=await bindSmokeReport(node.client,d,s,fact),receipt=await send('owner','receiver','onReport',['0x',bound.payload]);const verified=await verifySmokeReport(node.client,d,s,bound,receipt.transactionHash);reports.push({fact,bound,receipt,verified});return reports.at(-1)!;};
  await report(schedule);const price={...schedule,reference:'FIX1 LOCAL PRICE',kind:'6',sessionId:zero,observedAt:'1200',validUntil:'2900',benchmarkPrice:'100000000',multiplierNumerator:'1',multiplierDenominator:'1',secondarySourceHash:keccak256(toHex('FIX1 SECONDARY'))};await report(price);
  const reference=await node.client.readContract({address:d.addresses.oracle,abi:artifact('SessionOracle').abi,functionName:'latestReference',args:[s.assetId]}) as any;
  await send('borrower','loanManager','borrow',[{assetId:s.assetId,configVersion:'1',configHash,principal,collateralShares:shares,recipient:s.actors.borrower,referenceReportHash:reference.reportHash,expiry:'2900'}]);
  await node.time(2400n);for(const o of s.offers){o.terms.policyHash=policyHash(31337n,d.addresses.manager,s.assetId,s.sessionId,configHash,1n,1n,1n,600n,60n);await send('owner','eligibility','setEligible',[s.assetId,s.actors[o.actor],o.terms.policyHash,true]);await send(o.actor,'cash','approve',[d.addresses.book,o.approvalAmount]);await send(o.actor,'book','postOffer',[o.terms]);}await send('borrower','cash','approve',[d.addresses.book,s.consent.totalPremium]);
  return {node,d,s,send,report,reports,schedule,price,configHash,stop:node.stop};
 }catch(e){await node.stop();throw e;}
}
for(const [label,change]of [['rate',{rateNumerator:'900'}],['risk',{triggerLtvBps:'8000'}]] as const)test(`fix1 rejects actual on-chain ${label} inconsistent with explicit borrow and cover policy`,async()=>{
 const f=await fix1Fixture(change);try{
  const original=structuredClone(f.s);
  await assert.rejects(prepareSmoke(f.node.client,f.d,f.s,'borrow'),/scenario.*config|config.*scenario/i);
  await assert.rejects(prepareSmoke(f.node.client,f.d,f.s,'buyCover'),/scenario.*config|config.*scenario/i);
  assert.deepEqual(f.s,original,'explicit policy is never rewritten');
 }finally{await f.stop();}
});
for(const [label,principal,shares]of [['principal','600000','10000000000000000'],['collateral','500000','20000000000000000']] as const)test(`fix1 applies smoke ${label} bounds to the selected existing loan and consent`,async()=>{
 const f=await fix1Fixture({},principal,shares);try{
  assert.equal(f.s.borrow.principal,'500000');assert.equal(f.s.borrow.collateralShares,'10000000000000000');
  await assert.rejects(prepareSmoke(f.node.client,f.d,f.s,'buyCover'),/smoke.*exposure|exposure.*bound/i);
  const matching=structuredClone(f.s);matching.consent.principal=principal;matching.consent.collateralShares=shares;
  await assert.rejects(prepareSmoke(f.node.client,f.d,matching,'buyCover'),/smoke.*exposure|exposure.*bound/i);
 }finally{await f.stop();}
});
test('fix1 matching policy accepts accrued and partially repaid loan without resetting its basis',async()=>{
 const f=await fix1Fixture();try{
  await f.send('borrower','cash','approve',[f.d.addresses.loanManager,'1000']);await f.send('borrower','loanManager','repay',['1','1000']);
  const p=await prepareSmoke(f.node.client,f.d,f.s,'buyCover'),receipt=await f.node.send(p.transaction.from,p.transaction.to,p.transaction.data),verified=await verifySmokeReceipt(f.node.client,f.d,f.s,raw<SmokePacket>(p),receipt.transactionHash);
  assert.equal(verified.postcondition,'EXACT ENGINE TRANSITION PARITY');const debt=verified.after.state.loans['1'].debtRecord;
  assert.equal(debt.terms.originalPrincipal,500000n);assert.equal(debt.terms.startTime,1200n);assert.equal(debt.cumulativeDebtReduction,1000n);assert.deepEqual(debt,verified.before.state.loans['1'].debtRecord);
 }finally{await f.stop();}
});
test('fix1 report verification rejects late inclusion replacement and wrong requested receipt identity',async()=>{
 const f=await fix1Fixture();try{
  const r=f.reports[1],replacement=keccak256(toHex('REPLACED INCLUSION'));let replaced=false;
  const fake={...f.node.client,readContract:async(args:any)=>{const value=await f.node.client.readContract(args);if(args.address===f.d.addresses.oracle&&args.functionName==='latestReference')replaced=true;return value;},getBlock:async(args:any)=>{const block=await f.node.client.getBlock(args);return replaced&&block.number===r.receipt.blockNumber?{...block,hash:replacement}:block;}};
  await assert.rejects(verifySmokeReport(fake,f.d,f.s,r.bound,r.receipt.transactionHash),/replaced|canonical/i);
  await assert.rejects(verifySmokeReport(f.node.client,f.d,f.s,r.bound,keccak256(toHex('WRONG REQUESTED HASH'))).catch(async e=>{if(e.name==='TransactionReceiptNotFoundError')return verifySmokeReport({...f.node.client,getTransactionReceipt:async()=>r.receipt},f.d,f.s,r.bound,keccak256(toHex('WRONG REQUESTED HASH')));throw e;}),/receipt.*identity|identity.*receipt/i);
 }finally{await f.stop();}
});
test('fix1 binding guards its final domain reads and all unchanged report kinds remain accepted',async()=>{
 const f=await fix1Fixture();try{
  let replaced=false;const replacement=keccak256(toHex('REPLACED BINDING'));
  const fake={...f.node.client,readContract:async(args:any)=>{const value=await f.node.client.readContract(args);if(args.address===f.d.addresses.registry&&args.functionName==='configHash')replaced=true;return value;},getBlock:async(args:any)=>{const block=await f.node.client.getBlock(args);return replaced?{...block,hash:replacement}:block;}};
  await assert.rejects(bindSmokeReport(fake,f.d,f.s,{...f.price,observedAt:'2401',validUntil:'2900'}),/replaced|canonical/i);
  await f.report({...f.schedule,reference:'FIX1 CLOSE',kind:'2',observedAt:'3000'});await f.report({...f.price,reference:'FIX1 REOPEN',kind:'3',sessionId:f.s.sessionId,observedAt:'3001',validUntil:'3300'});
  assert.deepEqual(f.reports.map(r=>r.bound.input.kind),['1','6','2','3']);assert.ok(f.reports.every(r=>r.verified.accepted));
 }finally{await f.stop();}
});
