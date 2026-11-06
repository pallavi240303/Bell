import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {encodeAbiParameters,encodeFunctionData,decodeEventLog,keccak256,toHex,type Hex,type Address} from 'viem';
import {artifact,fn,argsFor,contracts} from './abi.ts';
import {snapshot,revertBytes} from './state.ts';
import {prepareActor,prepareSettlement} from './transactions.ts';
import {raw,rawUint,integers,exactKeys,json,type Deployment} from './types.ts';
import {digest,writeEvidence,assertSafe} from './evidence.ts';
import {localNode,deployLocal} from '../../scripts/keeper-local.ts';
import {transition,debtOf,type Action} from '../../engine/state.ts';
import {quoteHash,policyHash} from '../../engine/quote.ts';
import {makeOffer,offerId,termsHash} from '../../engine/offers.ts';
import {errorData} from '../../engine/cli.ts';
import {SolidityError} from '../../engine/types.ts';
import {engineState,compareState,marketFacts} from './parity.ts';
import {verifyDeployment} from './config.ts';
const zero=`0x${'0'.repeat(64)}` as Hex;
const hashLabel=(label:string)=>keccak256(toHex(label));
const reportFields=['reference','kind','assetId','sessionId','observedAt','validUntil','scheduledOpen','scheduledClose','benchmarkPrice','corporateAction','actionId','multiplierNumerator','multiplierDenominator','halted','primarySourceHash','secondarySourceHash'];
interface ReportDomain {chainId:string;oracle:Address;configHash:Hex;nonce:string;previousStateHash:Hex}
export function bindReport(fact:Record<string,unknown>,domain:ReportDomain){
 if(!fact||typeof fact!=='object'||Array.isArray(fact))throw Error('report facts required');
 exactKeys(fact,[...reportFields,'role']);for(const field of reportFields)if(!Object.hasOwn(fact,field))throw Error(`report fact required: ${field}`);
 if(typeof fact.reference!=='string'||!fact.reference.length)throw Error('report reference required');
 if(!['1','2','3','6'].includes(fact.kind as string))throw Error('unsupported report kind');
 if(fact.corporateAction!=='0'||fact.actionId!==zero)throw Error('unsupported corporate-action facts');
 if(fact.kind==='6'&&fact.sessionId!==zero)throw Error('MARKET_PRICE requires asset-level sessionId zero');
 const {reference,role,...facts}=fact,input={schemaVersion:'1',...facts,...domain};const parsed=argsFor('SessionOracle','acceptReport',[input])[0];
 return {reference,input,payload:encodeAbiParameters(fn('SessionOracle','acceptReport').inputs,[parsed])};
}
export function transactionSeal(tx:any){const {evidenceHash,...body}=tx;return digest(body);}
function decodedEvents(logs:readonly any[],d:Deployment){return logs.map(log=>{const c=Object.keys(d.addresses).find(k=>d.addresses[k]!.toLowerCase()===log.address.toLowerCase());let decoded:any=null;if(c)try{decoded=decodeEventLog({abi:artifact(contracts[c]!).abi,data:log.data,topics:log.topics});}catch{}return integers({...log,decoded});});}
export const replayInput=()=>JSON.parse(readFileSync(new URL('./fixtures/replay.json',import.meta.url),'utf8'));
/** Reused by automation and the manual operator. Only local demo setup signs here. */
export async function createLocalFixture(input:any=replayInput(),options:{port?:number;actors?:Record<string,Address>;setupReportTransport?:(node:Awaited<ReturnType<typeof localNode>>)=>Promise<{forwarder:Address;encode:(receiver:Address,payload:Hex)=>Hex}>}={}){
 assertSafe(input);const node=await localNode({port:options.port});
 try{
  const actors=Object.fromEntries(Object.entries({...input.actors,...options.actors,owner:node.actors[0]}).map(([role,address])=>[role,String(address).toLowerCase()])) as Record<string,Address>;
  for(const actor of Object.values(actors))if(!/^0x[0-9a-fA-F]{40}$/.test(actor)||/^0x0{40}$/i.test(actor))throw Error('public actor address required');
  const economic=['lender','borrower','buyerA','buyerB'].map(r=>actors[r]!.toLowerCase());assert.equal(new Set(economic).size,4,'distinct economic actors required');
  const reportTransport=await options.setupReportTransport?.(node);
  const {deployment:d,receipts:deploymentReceipts}=await deployLocal(node,{forwarder:reportTransport?.forwarder}),a=d.addresses,logs:any[]=[],trackedOffers:Hex[]=[],transactions:any[]=[],expectedReverts:any[]=[],reports:any[]=[];
  const read=async(c:string,f:string,args:any[]=[])=>integers(await node.client.readContract({address:a[c]!,abi:artifact(contracts[c]!).abi,functionName:f,args}));
  const observe=()=>snapshot(node.client,d,Object.values(actors),trackedOffers,undefined,logs);
  const finish=async(before:any,from:Address,to:Address,data:Hex,label:string,extra:any={})=>{
   const simulation=(await node.client.call({account:from,to,data,blockNumber:before.block.number})).data??'0x';
   const receipt=await node.send(from,to,data),block=await node.client.getBlock({blockNumber:receipt.blockNumber});
   const events=decodedEvents(receipt.logs,d);logs.push(...events);for(const e of events)if(e.decoded?.eventName==='OfferPosted')trackedOffers.push(e.decoded.args.offerId);
   const after=await observe(),entry={label,actor:from,to,data,simulation,transactionHash:receipt.transactionHash,receipt:integers(receipt),block:integers(block),events,before,after,...extra};
   transactions.push(entry);return entry;
  };
  const send=async(from:Address,c:string,method:string,args:any[],label=method)=>finish(await observe(),from,a[c]!,encodeFunctionData({abi:artifact(contracts[c]!).abi,functionName:method,args}),label);
  const approve=async(from:Address,purpose:string,amount=input.approvalAmount)=>{const before=await observe(),tx=await prepareActor(d,before.block,{chainId:d.chainId,from,approval:purpose,amount},node.client);return finish(before,tx.from,tx.to,tx.data,`approve-${purpose}`,{unsigned:tx});};
  const assetId=hashLabel(input.assetLabel);let sessionId=hashLabel(input.sessionLabel);
  const config=argsFor('AssetRegistry','scheduleAssetConfig',[assetId,{...input.config,assetToken:a.stock},input.effectiveAt])[1];
  await send(actors.owner!,'registry','scheduleAssetConfig',[assetId,config,rawUint(input.effectiveAt,64)]);
  const configHash:Hex=await read('registry','configHash',[assetId,rawUint(input.borrow.configVersion,64)]);
  const report=async(fact:any)=>{
   await node.time(rawUint(fact.observedAt,64));const state=await read('oracle','assetState',[assetId]);
   if(fact.kind==='6'){const session=await read('oracle','sessionFact',[state.activeSessionId]);if(session.assetId!==assetId||String(session.scheduledOpen)!==fact.scheduledOpen||String(session.scheduledClose)!==fact.scheduledClose||session.phase!==1n)throw Error('price active-session provenance mismatch');}
   const bound=bindReport(fact,{chainId:d.chainId,oracle:a.oracle!,configHash,nonce:state.nextNonce.toString(),previousStateHash:state.stateHash});const tx=reportTransport?await finish(await observe(),actors.owner!,reportTransport.forwarder,reportTransport.encode(a.receiver!,bound.payload),fact.reference):await send(actors.owner!,'receiver','onReport',['0x',bound.payload],fact.reference);
   const expectedHash=keccak256(bound.payload),actual=await read('oracle','assetState',[assetId]);assert.equal(actual.nextNonce,state.nextNonce+1n);
   if(fact.kind==='6')assert.equal((await read('oracle','latestReference',[assetId])).reportHash,expectedHash);
   reports.push({...bound,hash:expectedHash,transactionHash:tx.transactionHash});return tx;
  };
  // Funding is fixture setup, never represents user financial consent.
  for(const actor of new Set(Object.values(actors))){await node.request('anvil_setBalance',[actor,'0x3635c9adc5dea00000']);await send(actors.owner!,'cash','mint',[actor,rawUint(input.cashFunding)]);await send(actors.owner!,'stock','mint',[actor,rawUint(input.stockFunding)]);}
  const role=(name:string)=>{const f=input.reports.find((r:any)=>r.role===name);if(!f)throw Error(`report role required: ${name}`);return f;};
  const action=async(from:Address,c:string,method:string,args:any[],model?:Action,label=method,expectRevert=false)=>{
   const before=await observe(),tx=c==='manager'&&(method==='settle'||method==='terminalSettle')?await prepareSettlement(d,before.block,from,args[0],method,node.client):await prepareActor(d,before.block,{chainId:d.chainId,from,contract:c,method,args:raw(args)},node.client);
   let predicted:any,expected:Hex|undefined;if(model)try{predicted=transition(engineState(before.state,d),{...model,caller:from,now:before.block.timestamp});}catch(e){if(!(e instanceof SolidityError))throw e;expected=errorData(e);}
   let actualError:Hex|undefined;try{await node.client.call({account:from,to:tx.to,data:tx.data,blockNumber:before.block.number});}catch(e){actualError=revertBytes(e);if(!actualError)throw e;}
   assert.equal(actualError,expected,'exact simulation/revert parity');assert.equal(!!expected,expectRevert,`requested action outcome: ${method} ${expected??'success'}`);
   if(expected){const after=await observe();assert.deepEqual(after,before,'failed simulation rollback');expectedReverts.push({label,method,...tx,action:model,revertData:actualError,expectedRevertData:expected,before,after});return null;}
   const entry=await finish(before,from,tx.to,tx.data,label,{unsigned:tx,action:model});
   if(model){const at={...model,caller:from,now:entry.block.timestamp};predicted=transition(engineState(before.state,d),at);compareState(predicted,entry.after.state,d,entry.block.timestamp);entry.parity=true;}
   if(method==='postOffer'){const terms=integers(argsFor('CommitmentBook','postOffer',raw(args))[0]),id=offerId(BigInt(d.chainId),a.book!,from,terms.nonce),offer=makeOffer(from,terms,entry.block.timestamp,true,false);assert.deepEqual(entry.after.state.offers[id],offer);assert.equal(entry.after.state.termsHashes[id],termsHash(id,offer));assert.equal(before.state.balances[from].cash-entry.after.state.balances[from].cash,offer.cashCapacity);assert.equal(entry.after.state.book.totalLockedCash-before.state.book.totalLockedCash,offer.cashCapacity);entry.parity=true;}
   entry.evidenceHash=transactionSeal(entry);return entry;
  };
  const market=async(version=rawUint(input.borrow.configVersion),ids:Hex[]=[])=>marketFacts(node.client,d,await observe(),assetId,version,ids);
  const borrow=async(from=actors.borrower!,principal=input.borrow.principal,expiry=input.borrow.expiry)=>{
   const before=await observe(),ref=before.state.assets[assetId].latestReference,request={...input.borrow,assetId,configHash,recipient:from,referenceReportHash:ref.reportHash,expiry,principal};
   const parsed=integers(argsFor('LoanManager','borrow',[request])[0]);const loanId=before.state.nextLoanId;
   await action(from,'loanManager','borrow',[request],{kind:'borrow',caller:from,now:0n,request:parsed,market:await market()});return loanId;
  };
  const attach=async(loanId:bigint,buyers:any[],deadline:string,nonceOffset=0n,coverExpiry=input.consent.expiry)=>{
   const before=await observe(),p=before.state.loans[loanId.toString()],t=p.debtRecord.terms,session=await read('oracle','sessionFact',[sessionId]);
   const policy=await read('manager','policyHash',[assetId,sessionId,configHash,t.snapshotMultiplierNumerator,t.snapshotMultiplierDenominator]);
   assert.equal(policy,policyHash(BigInt(d.chainId),a.manager!,assetId,sessionId,configHash,t.snapshotMultiplierNumerator,t.snapshotMultiplierDenominator,before.state.coverPolicy.profile,before.state.coverPolicy.coverOpensBeforeClose,before.state.coverPolicy.coverCutoffBeforeClose));
   const ids:Hex[]=[],hashes:Hex[]=[];let weighted=0n,total=0n,premium=0n;
   for(const [i,b]of buyers.entries()){
    const buyer=actors[b.actor]!,shares=buyers.length===2&&nonceOffset!==0n?(i===0?p.remainingShares/2n:p.remainingShares-p.remainingShares/2n):rawUint(input.offerCommon.snapshotShares);
    await send(actors.owner!,'eligibility','setEligible',[assetId,buyer,policy,true]);await approve(buyer,'offer');
    const terms={...input.offerCommon,assetId,policyHash:policy,snapshotShares:shares.toString(),strike:b.strike,nonce:(rawUint(b.nonce)+nonceOffset).toString(),expiry:deadline};
    await action(buyer,'book','postOffer',[terms]);const id=await read('book','computeOfferId',[buyer,rawUint(terms.nonce)]);ids.push(id);hashes.push(await read('book','termsHashOf',[id]));weighted+=shares*rawUint(b.strike);total+=shares;premium+=rawUint(terms.premium);
   }
   const frame=await observe(),q={...input.consent,borrower:actors.borrower,recipient:p.loan.recipient,borrowerNonce:frame.state.balances[actors.borrower!].borrowerNonce.toString(),expiry:coverExpiry,assetId,sessionId,configHash,policyHash:policy,scheduledReportHash:session.scheduledReportHash,corporateActionHash:frame.state.assets[assetId].state.latestCorporateActionHash,principal:t.originalPrincipal.toString(),collateralShares:p.remainingShares.toString(),referencePrice:frame.state.assets[assetId].latestReference.price.toString(),snapshotMultiplierNumerator:t.snapshotMultiplierNumerator.toString(),snapshotMultiplierDenominator:t.snapshotMultiplierDenominator.toString(),totalPremium:premium.toString(),totalOfferShares:total.toString(),weightedStrike:(weighted/total).toString(),minSettlementDeadline:deadline,maxSettlementDeadline:deadline,loanId:loanId.toString(),referenceReportHash:frame.state.assets[assetId].latestReference.reportHash};
   const quote=integers(argsFor('CoverManager','buyCover',[loanId.toString(),q,ids,hashes,zero])[1]),identity=quoteHash(BigInt(d.chainId),a.manager!,quote,ids,hashes),receiptId=frame.state.nextReceiptId;
   await approve(actors.borrower!,'premium');const accepted=await action(actors.borrower!,'manager','buyCover',[loanId,q,ids,hashes,identity],{kind:'buyCover',caller:actors.borrower!,now:0n,loanId,quote,offerIds:ids,termsHashes:hashes,expectedHash:identity,market:await market(rawUint(q.configVersion),ids)});
   const after=accepted!.after.state;assert.deepEqual(after.loans[loanId.toString()].debtRecord,accepted!.before.state.loans[loanId.toString()].debtRecord,'cover preserves original debt basis');assert.equal(after.balances[actors.borrower!].cash,accepted!.before.state.balances[actors.borrower!].cash-premium,'cover transfers premium only');assert.equal(after.loans[loanId.toString()].backing,p.backing,'cover no collateral transfer');return receiptId;
  };
  return {node,deployment:d,deploymentReceipts,actors,input,assetId,configHash,get sessionId(){return sessionId;},set sessionId(value:Hex){sessionId=value;},read,observe,send,approve,report,role,action,market,borrow,attach,transactions,expectedReverts,reports,stop:node.stop};
 }catch(e){await node.stop();throw e;}
}
export async function runReplay(input:any,scenario:any){
 for(const fact of input.reports)bindReport(fact,{chainId:'31337',oracle:'0x0000000000000000000000000000000000000001',configHash:zero,nonce:'1',previousStateHash:zero});
 const f=await createLocalFixture(input);try{
  const {node,actors:a,deployment:d}=f;
  await f.approve(a.lender!,'deposit');await f.action(a.lender!,'pool','deposit',[input.lenderSupply]);
  await f.report(f.role('schedule'));await f.report(f.role('origination-price'));
  await f.approve(a.borrower!,'collateral');await f.approve(a.borrower!,'repay');const loanId=await f.borrow();
  assert.equal((await f.observe()).state.nextReceiptId,1n,'ordinary loan exists before offers/cover');
  await node.time(rawUint(input.repayAt));await f.action(a.borrower!,'loanManager','repay',[loanId,input.partialRepay],{kind:'repay',caller:a.borrower!,now:0n,loanId,amount:rawUint(input.partialRepay),market:await f.market()});
  await f.report(f.role('window-price'));await node.time(rawUint(input.coverAt));const receiptId=await f.attach(loanId,scenario.buyers,input.consent.minSettlementDeadline);
  const lifecycle=async(receipt:bigint,kind:'settle'|'terminal',expect=false,label=kind)=>{const frame=await f.observe(),r=frame.state.receipts[receipt.toString()];return f.action(a.keeper!,'manager',kind==='settle'?'settle':'terminalSettle',[receipt],{kind,caller:a.keeper!,now:0n,receiptId:receipt,market:await f.market(),benchmark:r.benchmark},label,expect);};
  await lifecycle(receiptId,'settle',true);await lifecycle(receiptId,'terminal',true);
  let normal:any=null,accruedDebt:any=null,secondReceiptId:any=null,distinctLoanId:any=null;
  if(scenario.path==='terminal-no-reopen'){
   await node.time(rawUint(input.actions.terminalAt));await f.send(a.owner!,'stock','setPaused',[true]);await lifecycle(receiptId,'terminal');await lifecycle(receiptId,'terminal',true);
  }else if(scenario.path==='full-close'){
   const frame=await f.observe(),amount=frame.state.loans[loanId.toString()].debt;
   await f.action(a.borrower!,'loanManager','repay',[loanId,amount],{kind:'repay',caller:a.borrower!,now:0n,loanId,amount,market:await f.market()});await lifecycle(receiptId,'terminal',true);
  }else{
   await f.report(f.role('close'));await f.report({...f.role('reopen'),benchmarkPrice:scenario.benchmarkPrice??f.role('reopen').benchmarkPrice});await lifecycle(receiptId,'settle');
   const frame=await f.observe(),p=frame.state.loans[loanId.toString()];normal={debt:p.debt,receiptStatus:frame.state.receipts[receiptId.toString()].receipt.status,activeCoverId:p.loan.activeCoverId,offers:frame.state.offers,claims:frame.state.claims};
   await lifecycle(receiptId,'settle',true);await node.time(101000n);accruedDebt=(await f.observe()).state.loans[loanId.toString()].debt;
   if(scenario.path==='second-session'){
    f.sessionId=hashLabel(`${input.sessionLabel}-NEXT`);const schedule={...f.role('schedule'),reference:'local-supplied-next-schedule',sessionId:f.sessionId,observedAt:'101000',scheduledOpen:'101100',scheduledClose:'105000',validUntil:'120000'};
    await f.report(schedule);await f.report({...f.role('window-price'),reference:'local-supplied-next-price',scheduledOpen:'101100',scheduledClose:'105000',observedAt:'104500',validUntil:'106000'});
    // Earlier claim remains; simultaneous loan3 intentionally differs from receipt1/2.
    await f.borrow(a.borrower!,'1000000',input.secondSession.borrowExpiry);distinctLoanId=await f.borrow(a.borrower!,'2000000',input.secondSession.borrowExpiry);
    secondReceiptId=await f.attach(loanId,scenario.buyers,input.secondSession.deadline,10n,input.secondSession.consentExpiry);await lifecycle(receiptId,'terminal',true);
    await f.report({...f.role('close'),reference:'local-supplied-next-close',sessionId:f.sessionId,scheduledOpen:'101100',scheduledClose:'105000',observedAt:'105000',validUntil:'120000'});
    await f.report({...f.role('reopen'),reference:'local-supplied-next-reopen',sessionId:f.sessionId,scheduledOpen:'101100',scheduledClose:'105000',observedAt:'105100',validUntil:'106000',benchmarkPrice:'100000000'});await lifecycle(secondReceiptId,'settle');
   }
   const current=await f.observe(),amount=current.state.loans[loanId.toString()].debt;if(amount>0n)await f.action(a.borrower!,'loanManager','repay',[loanId,amount],{kind:'repay',caller:a.borrower!,now:0n,loanId,amount,market:await f.market()});
  }
  const claims=(await f.observe()).state.claims,first=Object.entries(claims).find(([,c]:[string,any])=>!c.withdrawn);
  if(first){const [id,c]=first as [string,any];await f.send(a.owner!,'stock','setPaused',[true]);await f.action(c.owner,'vault','withdrawClaim',[id,c.owner],{kind:'withdrawClaim',caller:c.owner,now:0n,claimId:BigInt(id),to:c.owner,stockFailure:new SolidityError('TransfersPaused')},'paused-claim-rejected',true);await f.send(a.owner!,'stock','setPaused',[false]);await f.action(c.owner,'vault','withdrawClaim',[id,c.owner],{kind:'withdrawClaim',caller:c.owner,now:0n,claimId:BigInt(id),to:c.owner});}
  const final=await f.observe(),outcome=raw<any>({normal,accruedDebt,secondReceiptId,distinctLoanId,finalDebt:final.state.loans[loanId.toString()].debt,loans:final.state.loans,claims:final.state.claims,offers:final.state.offers,pool:final.state.pool,book:final.state.book});
  // Finalize all seals after canonical snapshots/parity have stopped changing.
  for(const tx of f.transactions)tx.evidenceHash=transactionSeal(tx);
  const result={id:scenario.id,inputHash:digest({input,scenario}),deployment:d,deploymentReceipts:raw<any[]>(f.deploymentReceipts),reports:raw<any[]>(f.reports),transactions:raw<any[]>(f.transactions),expectedReverts:raw<any[]>(f.expectedReverts),outcome,outcomeHash:digest(outcome),parity:true,interactiveConsentVerified:false};writeEvidence(`keeper-${scenario.id}`,result);return result;
 }finally{await f.stop();}
}
export async function verifyReplay(path?:string){const input=path?JSON.parse(readFileSync(path,'utf8')):replayInput();if(input.scenarios.length<3)throw Error('at least three buyer configurations required');const runs=[];for(const scenario of input.scenarios.slice(0,3))runs.push(await runReplay(input,scenario));runs.push(await runReplay(input,{...input.scenarios[0],id:'buyer-repeat'}));runs.push(await runReplay(input,{...input.scenarios[0],id:'terminal-no-reopen',path:'terminal-no-reopen'}));for(const extra of input.extraScenarios)runs.push(await runReplay(input,{...input.scenarios[0],...extra}));assert.equal(new Set(runs.slice(0,3).map(r=>r.outcomeHash)).size,3,'offer input sensitivity');assert.equal(runs[0]!.outcomeHash,runs[3]!.outcomeHash,'identical economic input repeat');writeEvidence('keeper-replay-summary',{runs:runs.map(({id,inputHash,outcomeHash,outcome,parity})=>({id,inputHash,outcomeHash,outcome,parity}))});return {runs};}
/** Manual fixture: public wallets are funded locally; no user loans/offers/approvals are sent. */
export async function bootstrapLocal(options:{port?:number;actors?:Record<string,Address>;directory?:string}={}){
 const f=await createLocalFixture(replayInput(),{port:options.port??8545,actors:options.actors});try{
  await f.report(f.role('schedule'));await f.report(f.role('window-price'));await f.node.time(rawUint(f.input.coverAt));
  const frame=await f.observe(),reference=frame.state.assets[f.assetId].latestReference;
  const policy=await f.read('manager','policyHash',[f.assetId,f.sessionId,f.configHash,reference.multiplierNumerator,reference.multiplierDenominator]);
  for(const buyer of [f.actors.buyerA!,f.actors.buyerB!])await f.send(f.actors.owner!,'eligibility','setEligible',[f.assetId,buyer,policy,true],'manual-buyer-policy');
  const directory=resolve(options.directory??'deployments/runs/local-optional');mkdirSync(directory,{recursive:true});
  const metadata={chainId:f.deployment.chainId,rpcUrl:f.node.client.transport.url,actors:f.actors,assetId:f.assetId,sessionId:f.sessionId,configHash:f.configHash,profile:'REPLAY',stoppedBefore:'user loan, offers and approvals',interactiveConsentVerified:false};
  writeFileSync(resolve(directory,'manifest.json'),json(f.deployment)+'\n');writeFileSync(resolve(directory,'actors.json'),json(metadata)+'\n');
  const operatorStep=async(role:'close'|'reopen'|'terminal',fact?:any)=>{if(role==='terminal'){await f.node.time(rawUint(f.input.actions.terminalAt));return f.observe();}return f.report(fact??f.role(role));};
  return {...f,metadata,directory,operatorStep};
 }catch(e){await f.stop();throw e;}
}
