import {artifact,contracts} from './abi.ts';
import {decodeErrorResult,encodeErrorResult,type Hex as ViemHex} from 'viem';
import {integers,rawUint,type Deployment,type Header,type Hex} from './types.ts';
import type {Indexer} from './indexer.ts';
/** Accounting display only: source fields remain available and no transaction uses this projection. */
interface CoverageOfferFacts {status:bigint;cashCapacity:bigint;cumulativeCashCharged:bigint;receiptId:bigint}
export function projectCoverage(offers:Record<string,CoverageOfferFacts>,receipts:Record<string,any>,totalLockedCash:bigint,complete:boolean){
  let discovered=0n;const offerCoverage:Record<string,{currentLockedCash:bigint}>={};
  for(const [id,offer]of Object.entries(offers)){
    if(offer.cumulativeCashCharged>offer.cashCapacity)throw Error('offer cash underflow');
    const currentLockedCash=offer.status===1n||offer.status===2n?offer.cashCapacity-offer.cumulativeCashCharged:0n;
    offerCoverage[id]={currentLockedCash};discovered+=currentLockedCash;
  }
  if(discovered>totalLockedCash)throw Error('discovered coverage exceeds global cash');
  if(complete&&discovered!==totalLockedCash)throw Error('complete offer discovery does not match global cash');
  for(const [id,position]of Object.entries(receipts)){
    position.receiptRemainingCoverage=0n;
    if(position.receipt.status!==1n)continue;
    for(const offerId of position.receipt.offerIds){
      const offer=offers[offerId];if(!offer)throw Error('receipt offer missing');
      if(offer.status===2n){if(offer.receiptId.toString()!==id)throw Error('receipt offer mismatch');position.receiptRemainingCoverage+=offerCoverage[offerId]!.currentLockedCash;}
    }
  }return offerCoverage;
}
export async function coherent<T>(rpc:any,read:(block:Header)=>Promise<T>,at?:Header):Promise<{block:Header;state:T}>{
  const block=at??await rpc.getBlock({blockTag:'latest'});if(!block?.hash)throw Error('canonical block unavailable');
  if(at&&(await rpc.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('source block replaced');
  const state=await read(block);
  if((await rpc.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('source block replaced during reads');
  return {block:{number:block.number,hash:block.hash,timestamp:block.timestamp,...(block.parentHash?{parentHash:block.parentHash}:{})},state};
}
/** Canonical cash is shared network-wide; expose/discover only BELL counterparties. */
function relevantEvent(d:Deployment){
  const cash=d.addresses.cash.toLowerCase(),protocol=new Set(Object.values(d.addresses).map(address=>address.toLowerCase()).filter(address=>address!==cash));
  return (log:any)=>{
    const address=String(log.address).toLowerCase();if(address!==cash)return protocol.has(address);
    const args=log.decoded?.args,fields=log.decoded?.eventName==='Transfer'?['from','to']:log.decoded?.eventName==='Approval'?['owner','spender']:[];
    return fields.some(field=>typeof args?.[field]==='string'&&protocol.has(args[field].toLowerCase()));
  };
}
/** Capture one committed discovery boundary, then read only that canonical block. */
export async function indexedState(index:Pick<Indexer,'store'|'sync'>,rpc:any,watch:Hex[]=[]){
  await index.sync();const blocks=index.store.data.blocks.slice(),last=blocks.at(-1);
  if(!last)throw Error('no indexed deployment block');
  const block:Header={number:rawUint(last.header.number),hash:last.header.hash as Hex,timestamp:rawUint(last.header.timestamp)};
  const logs=blocks.flatMap(b=>b.logs),offers=logs.filter(l=>l.decoded?.eventName==='OfferPosted').map(l=>l.decoded.args.offerId as Hex);
  return snapshot(rpc,index.store.deployment,watch,offers,block,logs,true);
}
export async function indexedEvents(index:Pick<Indexer,'store'|'sync'>,rpc:any,boundary?:{number:bigint;hash:Hex}){
  let blocks=index.store.data.blocks.slice();
  const committed=boundary?blocks.findIndex(b=>BigInt(b.header.number)===boundary.number&&b.header.hash===boundary.hash):-1;
  if(committed>=0)blocks=blocks.slice(0,committed+1);
  else{await index.sync();blocks=index.store.data.blocks.slice();}
  const last=boundary?blocks.find(b=>BigInt(b.header.number)===boundary.number&&b.header.hash===boundary.hash):blocks.at(-1);
  if(!last)throw Error('evidence boundary unavailable');
  const block:Header={number:rawUint(last.header.number),hash:last.header.hash as Hex,timestamp:rawUint(last.header.timestamp)};
  const relevant=relevantEvent(index.store.deployment);
  const result=await coherent(rpc,async()=>blocks.filter(b=>BigInt(b.header.number)<=block.number).flatMap(b=>b.logs.map(log=>{
    if(BigInt(log.blockNumber)!==BigInt(b.header.number)||log.blockHash!==b.header.hash)throw Error('event provenance mismatch');
    return {...log,blockNumber:rawUint(b.header.number),blockHash:b.header.hash,blockTimestamp:rawUint(b.header.timestamp)};
  }).filter(relevant)),block);
  return {block:result.block,events:result.state};
}
/** Logs discover immutable identifiers only; every financial projection is refreshed from contract reads. */
export function revertBytes(error:any):ViemHex|undefined {
  if(typeof error==='string'&&/^0x[0-9a-f]*$/i.test(error))return error as ViemHex;
  if(error&&typeof error==='object')return revertBytes(error.data)??revertBytes(error.cause)??revertBytes(error.error);return undefined;
}
/** Only known exact oracle failures are facts; RPC failures never become market state. */
export async function referenceCheck(read:(f:string,args:any[])=>Promise<any>,assetId:Hex){
  try{return {ok:true,referenceInvalidated:false,revertData:'0x' as Hex,fact:await read('requireFreshReference',[assetId])};}
  catch(error){const data=revertBytes(error);if(!data)throw error;
    const decoded=decodeErrorResult({abi:artifact('SessionOracle').abi,data});
    const known=['AssetHalted','ReferenceUnavailable','ReferenceSessionNotOpen','FutureObservation','ReportExpired','StaleReference','InvalidReferenceValidity'];
    if(!known.includes(decoded.errorName))throw error;
    const invalid=encodeErrorResult({abi:artifact('SessionOracle').abi,errorName:'ReferenceUnavailable',args:[assetId]});
    if(decoded.errorName==='ReferenceUnavailable'&&data!==invalid)throw Error('reference error asset mismatch');
    return {ok:false,referenceInvalidated:data===invalid,revertData:data};
  }
}
export async function snapshot(rpc:any,d:Deployment,watch:Hex[]=[],offerIds:Hex[]=[],at?:Header,discoveryLogs:any[]=[],completeOfferDiscovery=false){
 return coherent(rpc,async(block)=>{
  const read=async(c:string,f:string,args:unknown[]=[])=>integers(await rpc.readContract({address:d.addresses[c],abi:artifact(contracts[c]!).abi,functionName:f,args,blockNumber:block.number}));
  const tokenRead=async(token:string,f:string,args:unknown[]=[])=>integers(await rpc.readContract({address:token,abi:artifact('MockStockToken').abi,functionName:f,args,blockNumber:block.number}));
  const loans:Record<string,any>={},receipts:Record<string,any>={},offers:Record<string,any>={},claims:Record<string,any>={},actors=new Set(watch.map(a=>a.toLowerCase()));
  const assetIds=new Set<Hex>(),sessionIds=new Set<Hex>(),tokenIds=new Set<string>([d.addresses.stock]);
  const relevant=relevantEvent(d),zero=`0x${'0'.repeat(64)}`;
  for(const log of discoveryLogs){if(!relevant(log))continue;const args=log.decoded?.args;if(args?.assetId)assetIds.add(args.assetId);if(args?.sessionId&&args.sessionId!==zero)sessionIds.add(args.sessionId);
   for(const field of ['borrower','buyer','owner','payer','from','to','account','beneficiary','recipient','spender']){const actor=args?.[field];if(typeof actor==='string'&&/^0x[0-9a-fA-F]{40}$/.test(actor)&&!/^0x0{40}$/i.test(actor))actors.add(actor.toLowerCase());}}
  Object.values(d.addresses).forEach(a=>actors.add(a.toLowerCase()));
  const nextLoanId:bigint=await read('loanManager','nextLoanId');
  for(let id=1n;id<nextLoanId;id++){
   const loan=await read('loanManager','getLoan',[id]);actors.add(loan.borrower);actors.add(loan.recipient);assetIds.add(loan.assetId);tokenIds.add(loan.config.assetToken);
   const [debt,debtRecord,remainingShares,backing,outstandingUnits,activeCoverDeadline,opensAt,cutoffAt]=await Promise.all([read('loanManager','debtOf',[id]),read('vault','getDebt',[id]),read('vault','remainingSnapshotShares',[id]),read('vault','backingOf',[id]),read('vault','outstandingClaimUnits',[id]),read('vault','activeCoverDeadline',[id]),read('loanManager','coverWindowOpensAt',[id]),read('loanManager','coverWindowCutoffAt',[id])]);
   loans[id.toString()]={loan,debt,debtRecord,remainingShares,backing,outstandingUnits,activeCoverDeadline,opensAt,cutoffAt,currentCoverage:0n};
  }
  const nextReceiptId:bigint=await read('manager','nextReceiptId'),ids=new Set<Hex>(offerIds);
  for(let id=1n;id<nextReceiptId;id++){const receipt=await read('manager','getReceipt',[id]);if(!loans[receipt.loanId.toString()])throw Error('receipt loan missing');receipt.offerIds.forEach((x:Hex)=>ids.add(x));assetIds.add(receipt.consent.assetId);sessionIds.add(receipt.consent.sessionId);receipts[id.toString()]={receipt,benchmark:await read('oracle','benchmarkOf',[receipt.consent.sessionId])};}
  const termsHashes:Record<string,Hex>={};for(const id of ids){offers[id]=await read('book','getOffer',[id]);termsHashes[id]=await read('book','termsHashOf',[id]);actors.add(offers[id].buyer);assetIds.add(offers[id].terms.assetId);}
  const nextClaimId:bigint=await read('vault','nextClaimId');for(let id=1n;id<nextClaimId;id++){const c=await read('vault','getClaim',[id]);claims[id.toString()]=c;actors.add(c.owner);if(!loans[c.receiptId.toString()])throw Error('claim loan missing');}
  const assets:Record<string,any>={},sessions:Record<string,any>={};
  for(const id of assetIds){const configs:Record<string,any>={},latest:bigint=await read('registry','latestVersion',[id]);for(let version=1n;version<=latest;version++){const [config,effectiveAt,configHash]=await read('registry','getConfig',[id,version]);configs[version.toString()]={config,effectiveAt,configHash};tokenIds.add(config.assetToken);}
   const state=await read('oracle','assetState',[id]),latestReference=await read('oracle','latestReference',[id]),check=await referenceCheck((f,args)=>read('oracle',f,args),id);
   if(check.ok&&JSON.stringify(check.fact,(_,v)=>typeof v==='bigint'?v.toString():v)!==JSON.stringify(latestReference,(_,v)=>typeof v==='bigint'?v.toString():v))throw Error('reference read mismatch');
   const {fact,...referenceResult}=check;assets[id]={configs,state,corporateAction:await read('oracle','latestCorporateAction',[id]),latestReference,referenceCheck:referenceResult};if(state.activeSessionId!==zero)sessionIds.add(state.activeSessionId);
  }
  for(const id of sessionIds)sessions[id]={fact:await read('oracle','sessionFact',[id]),benchmark:await read('oracle','benchmarkOf',[id])};
  const balances:Record<string,any>={};await Promise.all([...actors].sort().map(async actor=>{
   const [cash,premiumCredit,cashCredit,poolShares,cashAllowanceLoanManager,cashAllowanceBook,borrowerNonce,cashAllowancePool,nativeGas]=await Promise.all([read('cash','balanceOf',[actor]),read('book','premiumCredit',[actor]),read('book','cashCredit',[actor]),read('pool','balanceOf',[actor]),read('cash','allowance',[actor,d.addresses.loanManager]),read('cash','allowance',[actor,d.addresses.book]),read('manager','borrowerNonce',[actor]),read('cash','allowance',[actor,d.addresses.pool]),rpc.getBalance({address:actor,blockNumber:block.number})]);
   balances[actor]={cash,premiumCredit,cashCredit,poolShares,cashAllowanceLoanManager,cashAllowanceBook,borrowerNonce,cashAllowancePool,nativeGas};
  }));
  const stockTokens:Record<string,any>={};for(const token of [...tokenIds].sort()){
   const [symbol,decimals,accountedBacking]=await Promise.all([tokenRead(token,'symbol'),tokenRead(token,'decimals'),read('vault','accountedBacking',[token])]);
   const tokenBalances:Record<string,any>={};for(const actor of [...actors].sort()){const [balance,allowanceVault]=await Promise.all([tokenRead(token,'balanceOf',[actor]),tokenRead(token,'allowance',[actor,d.addresses.vault])]);tokenBalances[actor]={balance,allowanceVault};}
   stockTokens[token]={symbol,decimals,accountedBacking,balances:tokenBalances};
   if(token===d.addresses.stock){stockTokens[token].paused=await tokenRead(token,'paused');for(const actor of actors){tokenBalances[actor].restricted=await tokenRead(token,'restricted',[actor]);Object.assign(balances[actor],{stock:tokenBalances[actor].balance,stockAllowanceVault:tokenBalances[actor].allowanceVault,restricted:tokenBalances[actor].restricted});}}
  }
  const [totalAssets,totalSupply,activeLoanIds,totalLockedCash,totalPremiumCredits,totalCashCredits,profile,coverOpensBeforeClose,coverCutoffBeforeClose,cashSymbol,cashDecimals]=await Promise.all([read('pool','totalAssets'),read('pool','totalSupply'),read('pool','activeReceiptIds'),read('book','totalLockedCash'),read('book','totalPremiumCredits'),read('book','totalCashCredits'),read('manager','profile'),read('manager','coverOpensBeforeClose'),read('manager','coverCutoffBeforeClose'),read('cash','symbol'),read('cash','decimals')]);
  const offerCoverage=projectCoverage(offers,receipts,totalLockedCash,completeOfferDiscovery);
  for(const [id,p]of Object.entries(loans)){if(p.loan.activeCoverId!==0n){const r=receipts[p.loan.activeCoverId.toString()];if(!r||r.receipt.status!==1n||r.receipt.loanId.toString()!==id)throw Error('active cover binding mismatch');p.currentCoverage=r.receiptRemainingCoverage;}}
  const receiverModes=discoveryLogs.filter(l=>l.address.toLowerCase()===d.addresses.receiver.toLowerCase()&&l.decoded?.eventName==='ReceiverReportAccepted').map(l=>integers(l.decoded.args.mode));
  const stock=stockTokens[d.addresses.stock];
  return {loans,receipts,offers,offerCoverage,termsHashes,claims,balances,assets,sessions,stockTokens,coverPolicy:{profile,coverOpensBeforeClose,coverCutoffBeforeClose},tokens:{cash:{symbol:cashSymbol,decimals:cashDecimals},stock:{symbol:stock.symbol,decimals:stock.decimals,paused:stock.paused}},receiverMode:receiverModes.at(-1)??null,pool:{totalAssets,totalSupply,activeLoanIds},book:{totalLockedCash,totalPremiumCredits,totalCashCredits},nextLoanId,nextReceiptId,nextClaimId};
 },at);
}
