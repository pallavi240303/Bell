import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encodeAbiParameters,encodeFunctionData,decodeEventLog,encodeErrorResult,keccak256,toHex,type Hex,type Address} from 'viem';
import {artifact,fn,argsFor,contracts} from './abi.ts';
import {snapshot} from './state.ts';
import {prepareActor,prepareSettlement} from './transactions.ts';
import {raw,rawUint,integers,type Deployment} from './types.ts';
import {digest,writeEvidence,assertSafe,conservation} from './evidence.ts';
import {localNode,deployLocal} from '../../scripts/keeper-local.ts';
import {transition,debtOf,type State,type Action} from '../../engine/state.ts';
import {constructReceipt} from '../../engine/receipt.ts';
import {SolidityError} from '../../engine/types.ts';
const zero=`0x${'0'.repeat(64)}` as Hex;
const hashLabel=(label:string)=>keccak256(toHex(label));

/** Explicitly one-receipt verification adapter. Never used as the indexer's state source. */
function engineState(s:any,d:Deployment):State {
  assert.equal(s.nextReceiptId,2n,'replay parity supports exactly one receipt');const r=s.receipts['1'];
  const map=(key:string)=>Object.fromEntries(Object.entries(s.balances).map(([a,v])=>[a,(v as any)[key]]));
  return {receiptId:1n,receipt:r.receipt,debt:r.debtRecord,offers:r.receipt.offerIds.map((id:Hex)=>s.offers[id]),claims:Object.values(s.claims),firstClaimId:1n,nextClaimId:s.nextClaimId,remainingShares:r.remainingShares,backing:r.backing,accountedBacking:s.accountedBacking,outstandingUnits:r.outstandingUnits,...s.book,premiumCredits:map('premiumCredit'),cashCredits:map('cashCredit'),cashBalances:map('cash'),stockBalances:map('stock'),cashAllowanceManager:map('cashAllowanceManager'),stockAllowanceVault:map('stockAllowanceVault'),cashDecrementsInfiniteAllowance:true,pool:d.addresses.pool!,book:d.addresses.book!,vault:d.addresses.vault!,activeReceiptIds:s.pool.activeReceiptIds};
}
function errorBytes(error:any):Hex|undefined {
  if(typeof error==='string'&&/^0x[0-9a-f]*$/i.test(error))return error as Hex;
  if(error&&typeof error==='object')return errorBytes(error.data)??errorBytes(error.cause)??errorBytes(error.error);return undefined;
}
function decodedEvents(logs:readonly any[],d:Deployment){return logs.map(log=>{
  const c=Object.keys(d.addresses).find(k=>d.addresses[k]!.toLowerCase()===log.address.toLowerCase());let decoded:unknown=null;
  if(c)try{decoded=decodeEventLog({abi:artifact(contracts[c]!).abi,data:log.data,topics:log.topics});}catch{}
  return integers({...log,decoded});
});}

export async function runReplay(input:any,scenario:any){
  assertSafe(input);assertSafe(scenario);
  const node=await localNode();
  try{
    const actors=input.actors as Record<string,Address>;assert.equal(new Set(Object.values(actors)).size,Object.values(actors).length,'distinct actor addresses required');
    for(const actor of Object.values(actors))assert.ok(node.actors.includes(actor),'fixture actor must be an unlocked local actor');
    const deployed=await deployLocal(node),d=deployed.deployment,a=d.addresses;
    const transactions:any[]=[],expectedReverts:any[]=[],reports:any[]=[],trackedOffers:Hex[]=[],discoveryLogs:any[]=[];
    const observe=()=>snapshot(node.client,d,Object.values(actors),trackedOffers,undefined,discoveryLogs);
    const read=async(c:string,method:string,args:any[]=[])=>integers(await node.client.readContract({address:a[c]!,abi:artifact(contracts[c]!).abi,functionName:method,args}));
    const send=async(from:Address,c:string,method:string,args:any[],label=method)=>{
      const data=encodeFunctionData({abi:artifact(contracts[c]!).abi,functionName:method,args});
      const before=await observe(),block=before.block;const simulation=await node.client.call({account:from,to:a[c]!,data,blockNumber:block.number});
      const receipt=await node.send(from,a[c]!,data),after=await node.client.getBlock({blockNumber:receipt.blockNumber});
      const events=decodedEvents(receipt.logs,d);discoveryLogs.push(...events);
      transactions.push({label,actor:from,to:a[c],data,simulation:simulation.data??'0x',transactionHash:receipt.transactionHash,receipt:integers(receipt),block:{number:after.number,hash:after.hash,timestamp:after.timestamp},events,before,after:await observe()});return receipt;
    };
    const actor=async(from:Address,c:string,method:string,args:any[])=>{
      const before=await observe(),block=before.block;const tx=prepareActor(d,block,{chainId:d.chainId,from,contract:c,method,args:raw(args)});
      const simulation=await node.client.call({account:from,to:tx.to,data:tx.data,blockNumber:block.number});const receipt=await node.send(from,tx.to,tx.data);
      const events=decodedEvents(receipt.logs,d);for(const event of events)if(event.decoded?.eventName==='OfferPosted')trackedOffers.push(event.decoded.args.offerId);
      transactions.push({label:method,...tx,actor:from,simulation:simulation.data??'0x',transactionHash:receipt.transactionHash,receipt:integers(receipt),events,before,after:await observe()});return receipt;
    };
    const approve=async(from:Address,purpose:string)=>{
      const before=await observe(),block=before.block;const tx=prepareActor(d,block,{chainId:d.chainId,from,approval:purpose,amount:input.approvalAmount});const simulation=await node.client.call({account:from,to:tx.to,data:tx.data,blockNumber:block.number});const receipt=await node.send(from,tx.to,tx.data);transactions.push({label:`approve-${purpose}`,...tx,actor:from,simulation:simulation.data??'0x',transactionHash:receipt.transactionHash,receipt:integers(receipt),events:decodedEvents(receipt.logs,d),before,after:await observe()});
    };
    const assetId=hashLabel(input.assetLabel),sessionId=hashLabel(input.sessionLabel),policyHash=hashLabel(input.policyLabel);
    const config=argsFor('AssetRegistry','scheduleAssetConfig',[assetId,{...input.config,assetToken:a.stock},input.effectiveAt])[1];
    await send(actors.owner!,'registry','scheduleAssetConfig',[assetId,config,rawUint(input.effectiveAt,64)]);
    const configHash:Hex=await read('registry','configHash',[assetId,rawUint(input.consent.configVersion,64)]);
    const report=async(fact:any)=>{
      await node.time(rawUint(fact.observedAt,64));const state=await read('oracle','assetState',[assetId]);
      // Only deployment identity and nonce linkage are bound here. All market facts come from the supplied input.
      const supplied={schemaVersion:'1',kind:fact.kind,chainId:d.chainId,oracle:a.oracle,assetId,sessionId,configHash,nonce:state.nextNonce.toString(),previousStateHash:state.stateHash,observedAt:fact.observedAt,validUntil:fact.validUntil,scheduledOpen:fact.scheduledOpen,scheduledClose:fact.scheduledClose,benchmarkPrice:fact.benchmarkPrice,corporateAction:'0',actionId:zero,multiplierNumerator:fact.multiplierNumerator,multiplierDenominator:fact.multiplierDenominator,halted:false,primarySourceHash:hashLabel(fact.primarySourceLabel),secondarySourceHash:fact.secondarySourceLabel?hashLabel(fact.secondarySourceLabel):zero};
      const parsed=argsFor('SessionOracle','acceptReport',[supplied])[0],payload=encodeAbiParameters(fn('SessionOracle','acceptReport').inputs,[parsed]);
      const receipt=await send(actors.owner!,'receiver','onReport',['0x',payload],fact.reference);
      reports.push({reference:fact.reference,input:supplied,payload,hash:keccak256(payload),transactionHash:receipt.transactionHash});
    };
    await report(input.reports[0]);await node.time(rawUint(input.effectiveAt,64));
    await send(actors.owner!,'cash','mint',[actors.lender,rawUint(input.lenderSupply)]);await approve(actors.lender!,'deposit');await actor(actors.lender!,'pool','deposit',[input.lenderSupply]);
    for(const role of ['borrower',...scenario.buyers.map((b:any)=>b.actor)]){
      await send(actors.owner!,'cash','mint',[actors[role],rawUint(input.cashFunding)]);await send(actors.owner!,'stock','mint',[actors[role],rawUint(input.stockFunding)]);await send(actors.owner!,'eligibility','setEligible',[assetId,actors[role],policyHash,true]);
    }
    await approve(actors.borrower!,'premium');await approve(actors.borrower!,'collateral');
    const ids:Hex[]=[],hashes:Hex[]=[];
    for(const buyer of scenario.buyers){const who=actors[buyer.actor]!;await approve(who,'offer');await actor(who,'book','postOffer',[{...input.offerCommon,assetId,policyHash,strike:buyer.strike,nonce:buyer.nonce}]);const id:Hex=await read('book','computeOfferId',[who,rawUint(buyer.nonce)]);ids.push(id);hashes.push(await read('book','termsHashOf',[id]));}
    const session=await read('oracle','sessionFact',[sessionId]);
    const quote={...input.consent,borrower:actors.borrower,recipient:actors.borrower,assetId,sessionId,configHash,policyHash,scheduledReportHash:session.scheduledReportHash,corporateActionHash:zero,weightedStrike:scenario.weightedStrike};
    const parsedQuote=argsFor('CoverManager','borrowWithCover',[quote,ids,hashes,zero])[0];
    const idsHash=(values:Hex[])=>keccak256(encodeAbiParameters([{type:'bytes32[]'}],[values]));
    const quoteHash=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'},{type:'address'},fn('CoverManager','borrowWithCover').inputs[0]!,{type:'bytes32'},{type:'bytes32'}],[hashLabel('BELL_COVER_QUOTE_V1'),31337n,a.manager!,parsedQuote,idsHash(ids),idsHash(hashes)]));
    const free=await snapshot(node.client,d,Object.values(actors),ids);
    await actor(actors.borrower!,'manager','borrowWithCover',[quote,ids,hashes,quoteHash]);
    const funded=await snapshot(node.client,d,Object.values(actors),ids);
    const predicted=constructReceipt(integers(parsedQuote),integers(config),ids,hashes,ids.map(id=>free.state.offers[id]),hashes,quoteHash,funded.block.timestamp,rawUint(input.reports[0].scheduledClose,64));
    assert.deepEqual(predicted,funded.state.receipts['1'].receipt,'exact receipt construction parity');
    transactions.at(-1).before=free;transactions.at(-1).after=funded;transactions.at(-1).parity=true;
    const lifecycle=async(method:'settle'|'terminalSettle',expectRevert=false)=>{
      const before=await snapshot(node.client,d,Object.values(actors),ids);const r=before.state.receipts['1'];
      const action:Action={kind:method==='settle'?'settle':'terminal',caller:actors.keeper!,now:before.block.timestamp,benchmark:r.benchmark};
      let predicted:State|undefined,expected:Hex|undefined;
      try{predicted=transition(engineState(before.state,d),action);}catch(error){if(!(error instanceof SolidityError))throw error;expected=encodeErrorResult({abi:artifact('CoverManager').abi,errorName:error.name,args:error.args});}
      const tx=prepareSettlement(d,before.block,actors.keeper!,1n,method);
      let simulation:Hex|undefined,actualError:Hex|undefined;
      try{simulation=(await node.client.call({account:tx.from,to:tx.to,data:tx.data,blockNumber:before.block.number})).data??'0x';}catch(error){actualError=errorBytes(error);if(!actualError)throw error;}
      assert.equal(actualError,expected,'exact simulation/revert parity');assert.equal(Boolean(expected),expectRevert,'requested action result');
      if(expected){const after=await snapshot(node.client,d,Object.values(actors),ids);assert.deepEqual(after,before,'reverted simulation changes no state');expectedReverts.push({method,...tx,action,data:actualError,expected,before,after});return;}
      const receipt=await node.send(tx.from,tx.to,tx.data);const after=await snapshot(node.client,d,Object.values(actors),ids);
      assert.deepEqual(engineState(after.state,d),predicted,'exact full observable lifecycle parity');assert.equal(after.state.receipts['1'].debt,debtOf(predicted!,after.block.timestamp));assert.equal(before.state.pool.totalSupply,after.state.pool.totalSupply);
      const conserved=conservation({timestamp:before.block.timestamp,pool:before.state.balances[a.pool!].cash,book:before.state.balances[a.book!].cash,debt:r.debt},{timestamp:after.block.timestamp,pool:after.state.balances[a.pool!].cash,book:after.state.balances[a.book!].cash,debt:after.state.receipts['1'].debt});
      transactions.push({label:method,...tx,actor:tx.from,action,simulation,transactionHash:receipt.transactionHash,receipt:integers(receipt),events:decodedEvents(receipt.logs,d),before,after,parity:true,conservation:conserved});
    };
    await lifecycle('settle',true);await lifecycle('terminalSettle',true);
    let normal:any=null;
    if(scenario.path==='normal-then-terminal'){
      await report(input.reports[1]);await report(input.reports[2]);
      await node.time(rawUint(input.actions[0].at,64));await lifecycle(input.actions[0].method);normal=await snapshot(node.client,d,Object.values(actors),ids);assert.ok(normal.state.receipts['1'].debt>0n,'partial settlement retains debt and cover');await lifecycle('settle',true);
    }else if(scenario.path!=='terminal-no-report')throw Error('unsupported requested replay path');
    await node.time(rawUint(input.actions[1].at,64));await lifecycle(input.actions[1].method);const terminal=await snapshot(node.client,d,Object.values(actors),ids);await lifecycle('terminalSettle',true);
    const outcome={normal:normal?{debt:normal.state.receipts['1'].debt,offers:normal.state.offers,claims:normal.state.claims}:null,terminal:{debt:terminal.state.receipts['1'].debt,offers:terminal.state.offers,claims:terminal.state.claims}};
    const result={id:scenario.id,inputHash:digest({input,scenario}),configHash:digest(input.config),deployment:d,deploymentReceipts:integers(deployed.receipts),reports,transactions,expectedReverts,outcome:raw(outcome),outcomeHash:digest(outcome),terminalDebt:terminal.state.receipts['1'].debt.toString(),parity:true,conservation:true,externalGates:{cre:'Task 11 authenticated CLI simulation remains gated by CRE login and supplied live configuration',arc:'No external broadcast; connected wallets required',reports:'Local supplied input facts through configured SimulationMarketEventReceiver forwarder; not live market evidence'}};
    writeEvidence(`keeper-${scenario.id}`,result);return result;
  }finally{await node.stop();}
}
export async function verifyReplay(path?:string){
  const input=JSON.parse(readFileSync(path??new URL('./fixtures/replay.json',import.meta.url),'utf8'));
  if(input.scenarios.length<3)throw Error('at least three buyer configurations required');const runs=[];
  for(const scenario of input.scenarios.slice(0,3))runs.push(await runReplay(input,scenario));
  runs.push(await runReplay(input,{...input.scenarios[0],id:'buyer-repeat'}));runs.push(await runReplay(input,{...input.scenarios[0],id:'terminal-no-report',path:'terminal-no-report'}));
  assert.equal(new Set(runs.slice(0,3).map(r=>r.outcomeHash)).size,3,'buyer inputs must change actual onchain outcomes');assert.equal(runs[0]!.outcomeHash,runs[3]!.outcomeHash,'identical economic inputs reproduce');
  const result={runs};writeEvidence('keeper-replay-summary',{runs:runs.map(({id,inputHash,outcomeHash,outcome,terminalDebt,parity,conservation,transactions})=>({id,inputHash,outcomeHash,outcome,terminalDebt,parity,conservation,transactionHashes:transactions.map(t=>t.transactionHash)}))});return result;
}
