/** Unsigned actor/operator packets. No key reads, signing or broadcasts. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeEventLog,encodeAbiParameters,encodeFunctionData,keccak256,type Address,type Hex} from 'viem';
import {artifact,argsFor,contracts,fn,protocolError} from '../services/keeper/abi.ts';
import {clientFor,verifyDeployment,validateDeployment} from '../services/keeper/config.ts';
import {assertSafe,digest} from '../services/keeper/evidence.ts';
import {snapshot,revertBytes} from '../services/keeper/state.ts';
import {prepareActor,prepareSettlement,type Unsigned} from '../services/keeper/transactions.ts';
import {bindReport} from '../services/keeper/replay.ts';
import {exactKeys,integers,json,raw,rawUint,type Deployment,type Header} from '../services/keeper/types.ts';
import {quoteHash,policyHash} from '../engine/quote.ts';
import {transition,type Action} from '../engine/state.ts';
import {snapshot as engineSnapshot,errorData} from '../engine/cli.ts';
import {SolidityError} from '../engine/types.ts';
import {engineInput,engineState,marketFacts,compareState,verifyNativeExecution} from '../services/keeper/parity.ts';
import {ARC_TESTNET} from './arc-deploy.ts';
const zero=`0x${'0'.repeat(64)}` as Hex;
const roles=['owner','lender','borrower','buyerA','buyerB','keeper'] as const;
export interface SmokeScenario {
 actors:Record<typeof roles[number],Address>;assetId:Hex;sessionId:Hex;effectiveAt:string;lenderSupply:string;
 config:Record<string,string>;borrow:Record<string,string>;consent:Record<string,string>;loanId:string;receiptId:string;
 offers:{actor:'buyerA'|'buyerB';approvalAmount:string;terms:Record<string,string>}[];
}
export function validateSmokeScenario(input:unknown):asserts input is SmokeScenario{
 assertSafe(input);const s=input as SmokeScenario;if(!s||typeof s!=='object'||Array.isArray(s))throw Error('Explicit smoke scenario required');
 exactKeys(s as any,['actors','assetId','sessionId','effectiveAt','lenderSupply','config','borrow','consent','loanId','receiptId','offers']);
 if(!s.actors||roles.some(r=>!/^0x[0-9a-fA-F]{40}$/.test(s.actors[r]??'')||/^0x0{40}$/i.test(s.actors[r])))throw Error('Six explicit public actor addresses required');exactKeys(s.actors,[...roles]);
 if(new Set(['lender','borrower','buyerA','buyerB'].map(r=>s.actors[r as typeof roles[number]].toLowerCase())).size!==4)throw Error('Distinct economic actor addresses required');
 for(const id of [s.assetId,s.sessionId])if(typeof id!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(id)||id===zero)throw Error('Explicit asset/session identity required');
 rawUint(s.effectiveAt,64);rawUint(s.loanId);rawUint(s.receiptId);
 if(s.config?.rateNumerator!=='800'||s.config.rateDenominator!=='315360000000')throw Error('Smoke requires actual 8% simple annual interest');argsFor('AssetRegistry','scheduleAssetConfig',[s.assetId,s.config,s.effectiveAt]);
 exactKeys(s.borrow,['configVersion','principal','collateralShares','expiry']);for(const key of ['configVersion','principal','collateralShares','expiry'])rawUint(s.borrow[key]);
 if(rawUint(s.lenderSupply)===0n||rawUint(s.lenderSupply)>1000000n||rawUint(s.borrow.principal)===0n||rawUint(s.borrow.principal)>500000n||rawUint(s.borrow.collateralShares)>10000000000000000n)throw Error('Smoke exposure exceeds 1 USDC supply / 0.5 USDC principal / 0.01 share bounds');
 if(!Array.isArray(s.offers)||s.offers.length!==2||s.offers[0]?.actor!=='buyerA'||s.offers[1]?.actor!=='buyerB')throw Error('Two ordered buyer lots required');
 for(const o of s.offers){exactKeys(o as any,['actor','approvalAmount','terms']);if(rawUint(o.approvalAmount)>1000000n)throw Error('Buyer approval exceeds exposure bound');argsFor('CommitmentBook','postOffer',[o.terms]);if(o.terms.assetId!==s.assetId||rawUint(o.terms.snapshotShares)>5000000000000000n)throw Error('Buyer lot domain/exposure mismatch');}
 const keys=['borrowerNonce','expiry','configVersion','principal','collateralShares','referencePrice','snapshotMultiplierNumerator','snapshotMultiplierDenominator','totalPremium','totalOfferShares','weightedStrike','minSettlementDeadline','maxSettlementDeadline','maxDebtAtAcceptance','maxDebtAtDeadline'];exactKeys(s.consent,keys);for(const key of keys)rawUint(s.consent[key]);
 if(rawUint(s.consent.principal)===0n||rawUint(s.consent.principal)>500000n||rawUint(s.consent.collateralShares)>10000000000000000n)throw Error('Smoke consent exposure exceeds 0.5 USDC principal / 0.01 share bounds');
}
async function context(client:any,d:Deployment,s:SmokeScenario,source?:Header){
 validateSmokeScenario(s);const block=await verifyDeployment(client,d,source);
 if(s.config.assetToken?.toLowerCase()!==d.addresses.stock.toLowerCase())throw Error('Scenario stock differs from deployment');if(d.chainId===String(ARC_TESTNET.chainId)&&d.addresses.cash.toLowerCase()!==ARC_TESTNET.cash.toLowerCase())throw Error('Arc canonical USDC required');
 const read=async(c:string,f:string,args:any[]=[])=>integers(await client.readContract({address:d.addresses[c],abi:artifact(contracts[c]!).abi,functionName:f,args,blockNumber:block.number}));
 if((await read('registry','owner')).toLowerCase()!==s.actors.owner.toLowerCase())throw Error('Explicit registry owner mismatch');
 if(d.chainId===String(ARC_TESTNET.chainId)&&(await read('receiver','forwarder')).toLowerCase()!==ARC_TESTNET.forwarder.toLowerCase())throw Error('Simulation forwarder binding mismatch');
 const ids:Hex[]=[];for(const o of s.offers)ids.push(await read('book','computeOfferId',[s.actors[o.actor],rawUint(o.terms.nonce)]));
 // Configured asset facts are requested explicitly, independently of indexed receipts.
 const discovery=[{address:d.addresses.registry,decoded:{eventName:'RequestedAsset',args:{assetId:s.assetId}}}];
 const before=await snapshot(client,d,Object.values(s.actors),ids,block,discovery);return {block,read,ids,before,discovery};
}
export interface SmokePacket {
 schemaVersion:1;mode:string;authority:'CONTRACTS';reportAuthority:'SIMULATION ONLY · NO DON OR LIVE PROOF';broadcast:false;
 action:string;scenarioHash:Hex;deploymentHash:Hex;transaction:Unsigned;simulation:Hex;before:any;loanId?:string;receiptId?:string;request?:any;quote?:any;offerIds?:Hex[];termsHashes?:Hex[];quoteHash?:Hex;model?:Action;
}
export async function prepareSmoke(client:any,d:Deployment,s:SmokeScenario,action:string){return prepareSmokeAt(client,d,s,action);}
async function prepareSmokeAt(client:any,d:Deployment,s:SmokeScenario,action:string,source?:Header):Promise<SmokePacket>{
 const {block,read,ids,before}=await context(client,d,s,source);let transaction:Unsigned,extra:Partial<SmokePacket>={};
 const direct=(role:typeof roles[number],c:string,method:string,args:any[]):Unsigned=>({chainId:d.chainId,from:s.actors[role].toLowerCase() as Address,to:d.addresses[c]!,data:encodeFunctionData({abi:artifact(contracts[c]!).abi,functionName:method,args:argsFor(contracts[c]!,method,args)}),value:'0',sourceBlock:block.number.toString(),sourceBlockHash:block.hash});
 const actor=(role:typeof roles[number],c:string,method:string,args:any[])=>prepareActor(d,block,{chainId:d.chainId,from:s.actors[role],contract:c,method,args:raw(args)},client);
 const approval=(role:typeof roles[number],purpose:string,amount:string)=>prepareActor(d,block,{chainId:d.chainId,from:s.actors[role],approval:purpose,amount},client);
 const scenarioConfig=async(version:bigint)=>{
  const expected=integers(argsFor('AssetRegistry','scheduleAssetConfig',[s.assetId,s.config,s.effectiveAt])[1]);
  const [actual,effectiveAt,identity]=await read('registry','getConfig',[s.assetId,version]);
  assert.deepEqual(actual,expected,'Scenario config differs from selected registry config');
  assert.equal(effectiveAt,rawUint(s.effectiveAt,64),'Scenario config effective time differs from registry');
  const expectedHash=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint64'},{type:'uint64'},fn('AssetRegistry','scheduleAssetConfig').inputs[1]!],[s.assetId,version,effectiveAt,expected]));
  assert.equal(identity,expectedHash,'Scenario config identity differs from registry');
  assert.equal(await read('registry','configHash',[s.assetId,version]),identity,'Registry config hash getter mismatch');
  return identity as Hex;
 };

 if(action==='config')transaction=direct('owner','registry','scheduleAssetConfig',[s.assetId,s.config,s.effectiveAt]);
 else if(action==='mint-collateral')transaction=direct('owner','stock','mint',[s.actors.borrower,s.borrow.collateralShares]);
 else if(action==='eligible-buyerA'||action==='eligible-buyerB'){const role=action.slice(9) as 'buyerA'|'buyerB',o=s.offers.find(x=>x.actor===role)!;transaction=direct('owner','eligibility','setEligible',[s.assetId,s.actors[role],o.terms.policyHash,true]);}
 else if(action==='approve-lender')transaction=await approval('lender','deposit',s.lenderSupply);
 else if(action==='supply')transaction=await actor('lender','pool','deposit',[s.lenderSupply]);
 else if(action==='approve-premium')transaction=await approval('borrower','premium',s.consent.totalPremium!);
 else if(action==='approve-repay')transaction=await approval('borrower','repay',s.consent.maxDebtAtAcceptance!);
 else if(action==='approve-collateral')transaction=await approval('borrower','collateral',s.borrow.collateralShares!);
 else if(action==='approve-buyerA'||action==='approve-buyerB'){const role=action.slice(8) as 'buyerA'|'buyerB';transaction=await approval(role,'offer',s.offers.find(o=>o.actor===role)!.approvalAmount);}
 else if(action==='post-buyerA'||action==='post-buyerB'){const role=action.slice(5) as 'buyerA'|'buyerB';transaction=await actor(role,'book','postOffer',[s.offers.find(o=>o.actor===role)!.terms]);}
 else if(action==='borrow'){
  const configHash=await scenarioConfig(rawUint(s.borrow.configVersion,64)),reference=before.state.assets[s.assetId].latestReference;
  const request={...s.borrow,assetId:s.assetId,configHash,recipient:s.actors.borrower,referenceReportHash:reference.reportHash};const parsed=integers(argsFor('LoanManager','borrow',[request])[0]);
  const model:Action={kind:'borrow',caller:s.actors.borrower.toLowerCase() as Address,now:block.timestamp,request:parsed,market:await marketFacts(client,d,before,s.assetId,rawUint(s.borrow.configVersion))};
  transaction=await actor('borrower','loanManager','borrow',[request]);extra={request,loanId:before.state.nextLoanId.toString(),model};
 }else if(action==='buyCover'){
  const p=before.state.loans[s.loanId];if(!p)throw Error('Explicit existing loan required');if(p.debtRecord.terms.originalPrincipal>500000n||p.remainingShares>10000000000000000n)throw Error('Selected loan smoke exposure exceeds 0.5 USDC principal / 0.01 share bounds');const session=await read('oracle','sessionFact',[s.sessionId]),state=before.state.assets[s.assetId].state;
  const configHash=await scenarioConfig(rawUint(s.consent.configVersion,64)),policy=await read('manager','policyHash',[s.assetId,s.sessionId,configHash,p.debtRecord.terms.snapshotMultiplierNumerator,p.debtRecord.terms.snapshotMultiplierDenominator]);
  assert.equal(policy,policyHash(BigInt(d.chainId),d.addresses.manager,s.assetId,s.sessionId,configHash,p.debtRecord.terms.snapshotMultiplierNumerator,p.debtRecord.terms.snapshotMultiplierDenominator,before.state.coverPolicy.profile,before.state.coverPolicy.coverOpensBeforeClose,before.state.coverPolicy.coverCutoffBeforeClose),'Scenario cover policy differs from registry-bound policy');
  const quote={...s.consent,borrower:s.actors.borrower.toLowerCase(),recipient:p.loan.recipient,loanId:s.loanId,assetId:s.assetId,sessionId:s.sessionId,configHash,policyHash:policy,scheduledReportHash:session.scheduledReportHash,corporateActionHash:state.latestCorporateActionHash,referenceReportHash:before.state.assets[s.assetId].latestReference.reportHash};
  const hashes=ids.map(id=>before.state.termsHashes[id]!),parsed=integers(argsFor('CoverManager','buyCover',[s.loanId,quote,ids,hashes,zero])[1]),identity=quoteHash(BigInt(d.chainId),d.addresses.manager,parsed,ids,hashes);
  const model:Action={kind:'buyCover',caller:s.actors.borrower.toLowerCase() as Address,now:block.timestamp,loanId:rawUint(s.loanId),quote:parsed,offerIds:ids,termsHashes:hashes,expectedHash:identity,market:await marketFacts(client,d,before,s.assetId,rawUint(s.consent.configVersion),ids)};
  transaction=await actor('borrower','manager','buyCover',[s.loanId,quote,ids,hashes,identity]);extra={quote,loanId:s.loanId,receiptId:before.state.nextReceiptId.toString(),offerIds:ids,termsHashes:hashes,quoteHash:identity,model};
 }else if(action==='settle'||action==='terminal'){
  const r=before.state.receipts[s.receiptId];if(!r)throw Error('Explicit receipt missing');transaction=await prepareSettlement(d,block,s.actors.keeper,rawUint(s.receiptId),action==='settle'?'settle':'terminalSettle',client);
  extra={loanId:r.receipt.loanId.toString(),receiptId:s.receiptId,model:{kind:action==='settle'?'settle':'terminal',caller:s.actors.keeper.toLowerCase() as Address,now:block.timestamp,receiptId:rawUint(s.receiptId),benchmark:r.benchmark,market:await marketFacts(client,d,before,s.assetId,rawUint(s.consent.configVersion))}};
 }else throw Error('Unknown smoke action');
 if(!transaction.to)throw Error('Deployment destination absent');
 let simulation:Hex;try{simulation=(await client.call({account:transaction.from,to:transaction.to,data:transaction.data,blockNumber:block.number})).data??'0x';}catch(e){const data=revertBytes(e);if(!data)throw e;let decoded;try{decoded=protocolError(data);}catch{throw e;}throw new Error(`Simulation rejected: ${decoded.errorName}`,{cause:e});}await verifyDeployment(client,d,block);
 return {schemaVersion:1,mode:d.chainId===String(ARC_TESTNET.chainId)?'ARC TESTNET · UNSIGNED':'LOCAL VALIDATION · UNSIGNED',authority:'CONTRACTS',reportAuthority:'SIMULATION ONLY · NO DON OR LIVE PROOF',broadcast:false,action,scenarioHash:digest(s),deploymentHash:digest(d),transaction,simulation,before,...extra};
}
export async function bindSmokeReport(client:any,d:Deployment,s:SmokeScenario,fact:Record<string,unknown>){
 const {read,block}=await context(client,d,s),isPrice=fact.kind==='6';if(fact.assetId!==s.assetId||fact.sessionId!==(isPrice?zero:s.sessionId))throw Error('Supplied report domain mismatch');
 const state=await read('oracle','assetState',[s.assetId]),configHash=await read('registry','configHash',[s.assetId,rawUint(s.borrow.configVersion,64)]);
 if(isPrice){const session=await read('oracle','sessionFact',[state.activeSessionId]);if(state.activeSessionId!==s.sessionId||session.phase!==1n||String(session.scheduledOpen)!==fact.scheduledOpen||String(session.scheduledClose)!==fact.scheduledClose)throw Error('Price active schedule provenance mismatch');}
 if((await client.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Report binding source block replaced during reads');
 return {...bindReport(fact,{chainId:d.chainId,oracle:d.addresses.oracle,configHash,nonce:state.nextNonce.toString(),previousStateHash:state.stateHash}),authority:'SUPPLIED FACTS · SIMULATION ONLY',forwarder:ARC_TESTNET.forwarder,receiver:d.addresses.receiver};
}
export async function verifySmokeReceipt(client:any,d:Deployment,s:SmokeScenario,p:SmokePacket,hash:Hex){
 validateSmokeScenario(s);if(p.scenarioHash!==digest(s)||p.deploymentHash!==digest(d))throw Error('Smoke packet identity changed');
 const receipt=await client.getTransactionReceipt({hash}),tx=await client.getTransaction({hash});
 if(tx.hash!==hash||receipt.transactionHash!==hash||tx.from.toLowerCase()!==p.transaction.from.toLowerCase()||tx.to?.toLowerCase()!==p.transaction.to.toLowerCase()||tx.input!==p.transaction.data||tx.value!==0n||tx.chainId!==Number(d.chainId))throw Error('Smoke transaction identity mismatch');
 const source=await client.getBlock({blockNumber:rawUint(p.transaction.sourceBlock)});if(source.hash!==p.transaction.sourceBlockHash)throw Error('Prepared source replaced');
 const expected=await prepareSmokeAt(client,d,s,p.action,source);assert.deepEqual(raw(p),raw(expected),'Smoke packet transaction does not match scenario action at source block');
 const block=await client.getBlock({blockNumber:receipt.blockNumber}),parent=await client.getBlock({blockNumber:receipt.blockNumber-1n});
 if(block.hash!==receipt.blockHash||tx.blockHash!==block.hash||block.parentHash!==parent.hash)throw Error('Receipt canonical provenance mismatch');await verifyDeployment(client,d,block);
 const discovery=[{address:d.addresses.registry,decoded:{eventName:'RequestedAsset',args:{assetId:s.assetId}}}],ids=p.offerIds??Object.keys(p.before.state.offers) as Hex[];
 const before=await snapshot(client,d,Object.values(s.actors),ids,parent,discovery),after=await snapshot(client,d,Object.values(s.actors),ids,block,discovery);
 if(parent.number<source.number)throw Error('Receipt predates prepared source');
 if(p.model){
  for(const actor of Object.keys(before.state.balances)){const b=before.state.balances[actor],prior=expected.before.state.balances[actor];if(b.nativeGas!==prior?.nativeGas||b.cashAllowancePool!==prior.cashAllowancePool)throw Error('intermediate actor mutation before inclusion');}
  const marketIdentity=(s:any)=>({assets:Object.fromEntries(Object.entries(s.assets).map(([id,a]:[string,any])=>{const {referenceCheck,...facts}=a;return [id,facts];})),sessions:s.sessions,coverPolicy:s.coverPolicy,stockPolicy:Object.fromEntries(Object.entries(s.stockTokens).map(([token,t]:[string,any])=>[token,{paused:t.paused,restricted:Object.fromEntries(Object.entries(t.balances).map(([actor,b]:[string,any])=>[actor,b.restricted]))}]))});
  assert.deepEqual(raw(marketIdentity(expected.before.state)),raw(marketIdentity(before.state)),'intermediate oracle/config/token-policy mutation before inclusion');
  const noAction=engineState(expected.before.state,d);assert.deepEqual(engineSnapshot(noAction,engineInput(before.state,d),parent.timestamp),engineInput(before.state,d),'intermediate protocol/actor mutation before inclusion');}
 let postcondition='CONFIRMED EXACT TRANSACTION · CANONICAL SNAPSHOT',gas:any=null,revertData:Hex|undefined;
 if(p.model){
  const model=structuredClone(expected.model!) as Action;model.now=block.timestamp;model.market=await marketFacts(client,d,before,s.assetId,rawUint((p.action==='borrow'?s.borrow:s.consent).configVersion),p.offerIds??[]);
  let predicted=engineState(before.state,d),expectedError:Hex|undefined;try{predicted=transition(predicted,model);}catch(e){if(!(e instanceof SolidityError))throw e;expectedError=errorData(e);}
  if(receipt.status==='reverted'){try{await client.call({account:tx.from,to:tx.to,data:tx.input,blockNumber:block.number});}catch(e){revertData=revertBytes(e);}if(!expectedError||revertData!==expectedError)throw Error('reverted transaction lacks exact modeled error evidence');}
  else if(expectedError)throw Error('successful receipt disagrees with modeled rejection');
  if(d.chainId===String(ARC_TESTNET.chainId)){const caller=p.transaction.from,delta=predicted.cashBalances[caller]!-before.state.balances[caller].cash;gas=await verifyNativeExecution(client,d,hash,caller,delta);predicted.cashBalances[caller]=gas.cash;}
  compareState(predicted,after.state,d,block.timestamp);postcondition='EXACT ENGINE TRANSITION PARITY';
 }else if(receipt.status!=='success')throw Error('Smoke transaction reverted');
 const events=receipt.logs.flatMap((log:any)=>{const name=Object.keys(d.addresses).find(k=>d.addresses[k]!.toLowerCase()===log.address.toLowerCase());if(!name)return [];try{return [{address:log.address,...integers(decodeEventLog({abi:artifact(contracts[name]!).abi,data:log.data,topics:log.topics}))}];}catch{return [];}});
 await verifyDeployment(client,d,parent);await verifyDeployment(client,d,block);
 return {transactionHash:hash,explorerUrl:d.chainId===String(ARC_TESTNET.chainId)?`${ARC_TESTNET.explorer}/tx/${hash}`:null,receipt,events,before,after,postcondition,gas,revertData,interactiveConsentVerified:false};
}
export async function verifySmokeReport(client:any,d:Deployment,s:SmokeScenario,bound:{input:any;payload:Hex},hash:Hex){
 validateSmokeScenario(s);const receipt=await client.getTransactionReceipt({hash}),price=bound.input.kind==='6',sessionId=price?zero:s.sessionId;
 if(receipt.transactionHash!==hash)throw Error('Report receipt identity mismatch');
 if(receipt.status!=='success'||bound.input.assetId!==s.assetId||bound.input.sessionId!==sessionId||bound.input.chainId!==d.chainId||bound.input.oracle.toLowerCase()!==d.addresses.oracle.toLowerCase())throw Error('Report receipt/domain mismatch');
 if(encodeAbiParameters(fn('SessionOracle','acceptReport').inputs,argsFor('SessionOracle','acceptReport',[bound.input]))!==bound.payload)throw Error('Report payload/input mismatch');
 const reportHash=keccak256(bound.payload);let accepted:any;
 for(const log of receipt.logs){if(log.address.toLowerCase()!==d.addresses.oracle.toLowerCase())continue;try{const e=decodeEventLog({abi:artifact('SessionOracle').abi,data:log.data,topics:log.topics}) as any;if(e.args.reportHash===reportHash){if(e.eventName==='MarketEventAccepted')accepted=integers(e.args);}}catch{}}
 if(!accepted||accepted.assetId!==s.assetId||accepted.sessionId!==sessionId||accepted.nonce!==rawUint(bound.input.nonce,64)||accepted.kind!==rawUint(bound.input.kind,8))throw Error('Report was not accepted by oracle event');
 const block=await client.getBlock({blockNumber:receipt.blockNumber});if(block.hash!==receipt.blockHash)throw Error('Report block replaced');await verifyDeployment(client,d,block);
 const read=async(f:string,args:any[])=>integers(await client.readContract({address:d.addresses.oracle,abi:artifact('SessionOracle').abi,functionName:f,args,blockNumber:block.number}));
 const state=await read('assetState',[s.assetId]),session=await read('sessionFact',[s.sessionId]);
 if(state.stateHash!==accepted.newStateHash||state.nextNonce!==accepted.nonce+1n)throw Error('Report accepted state mismatch');
 if(price){const reference=await read('latestReference',[s.assetId]);if(reference.reportHash!==reportHash||reference.sessionId!==s.sessionId||state.activeSessionId!==s.sessionId||session.phase!==1n||session.scheduledOpen!==rawUint(bound.input.scheduledOpen)||session.scheduledClose!==rawUint(bound.input.scheduledClose)||reference.assetId!==s.assetId||reference.configHash!==bound.input.configHash||reference.price!==rawUint(bound.input.benchmarkPrice)||reference.observedAt!==rawUint(bound.input.observedAt)||reference.validUntil!==rawUint(bound.input.validUntil)||reference.multiplierNumerator!==rawUint(bound.input.multiplierNumerator)||reference.multiplierDenominator!==rawUint(bound.input.multiplierDenominator)||reference.primarySourceHash!==bound.input.primarySourceHash||reference.secondarySourceHash!==bound.input.secondarySourceHash||reference.corporateActionHash!==state.latestCorporateActionHash)throw Error('Report reference/schedule mismatch');}
 else{const field=({'1':'scheduledReportHash','2':'closeReportHash','3':'reopenReportHash'} as Record<string,string>)[String(bound.input.kind)];if(!field||session[field]!==reportHash)throw Error('Report session mismatch');if(bound.input.kind==='3'){const benchmark=await read('benchmarkOf',[s.sessionId]);if(!benchmark.finalized||benchmark.reportHash!==reportHash||benchmark.price!==rawUint(bound.input.benchmarkPrice))throw Error('Report benchmark mismatch');}}
 if((await client.getBlock({blockNumber:block.number})).hash!==receipt.blockHash)throw Error('Report inclusion block replaced during final state reads');
 return {accepted:true,authority:'SUPPLIED FACTS · SIMULATION ONLY · NO DON OR LIVE PROOF',transactionHash:hash,reportHash,block,state,session,event:accepted};
}
async function main(){const [scenarioPath,action,packetPath,hash]=process.argv.slice(2);if(!scenarioPath||!action||process.argv.includes('--broadcast'))throw Error('Usage: arc-replay.ts SCENARIO.json ACTION [PACKET.json TX_HASH]; unsigned only');const root=fileURLToPath(new URL('../',import.meta.url)),d=JSON.parse(readFileSync(resolve(root,'deployments/runs/arc-optional-cover.json'),'utf8'));validateDeployment(d);if(d.chainId!==String(ARC_TESTNET.chainId))throw Error('Arc manifest required');const s=JSON.parse(readFileSync(resolve(scenarioPath),'utf8'));validateSmokeScenario(s);const client=clientFor(ARC_TESTNET.rpc);console.log(json(action==='verify'?await verifySmokeReceipt(client,d,s,JSON.parse(readFileSync(resolve(packetPath!),'utf8')),hash as Hex):await prepareSmoke(client,d,s,action)));}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Arc unsigned preparation stopped. Refresh explicit inputs, canonical state and accepted reports. No transaction broadcast.');process.exitCode=1;});
