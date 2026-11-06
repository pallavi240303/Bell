import {artifact,contracts} from './abi.ts';
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
/** Capture one committed discovery boundary, then read only that canonical block. */
export async function indexedState(index:Pick<Indexer,'store'|'sync'>,rpc:any,watch:Hex[]=[]){
  await index.sync();const blocks=index.store.data.blocks.slice(),last=blocks.at(-1);
  if(!last)throw Error('no indexed deployment block');
  const block:Header={number:rawUint(last.header.number),hash:last.header.hash as Hex,timestamp:rawUint(last.header.timestamp)};
  const logs=blocks.flatMap(b=>b.logs),offers=logs.filter(l=>l.decoded?.eventName==='OfferPosted').map(l=>l.decoded.args.offerId as Hex);
  return snapshot(rpc,index.store.deployment,watch,offers,block,logs,true);
}
export async function indexedEvents(index:Pick<Indexer,'store'|'sync'>,rpc:any,boundary?:{number:bigint;hash:Hex}){
  await index.sync();const blocks=index.store.data.blocks.slice();
  const last=boundary?blocks.find(b=>BigInt(b.header.number)===boundary.number&&b.header.hash===boundary.hash):blocks.at(-1);
  if(!last)throw Error('evidence boundary unavailable');
  const block:Header={number:rawUint(last.header.number),hash:last.header.hash as Hex,timestamp:rawUint(last.header.timestamp)};
  const result=await coherent(rpc,async()=>blocks.filter(b=>BigInt(b.header.number)<=block.number).flatMap(b=>b.logs.map(log=>{
    if(BigInt(log.blockNumber)!==BigInt(b.header.number)||log.blockHash!==b.header.hash)throw Error('event provenance mismatch');
    return {...log,blockNumber:rawUint(b.header.number),blockHash:b.header.hash,blockTimestamp:rawUint(b.header.timestamp)};
  })),block);
  return {block:result.block,events:result.state};
}
/** Logs discover immutable identifiers only; every financial projection is refreshed from contract reads. */
export async function snapshot(rpc:any,d:Deployment,watch:Hex[]=[],offerIds:Hex[]=[],at?:Header,discoveryLogs:any[]=[],completeOfferDiscovery=false){
  return coherent(rpc,async(block)=>{
    const read=async(c:string,f:string,args:unknown[]=[])=>integers(await rpc.readContract({address:d.addresses[c],abi:artifact(contracts[c]!).abi,functionName:f,args,blockNumber:block.number}));
    const receipts:Record<string,any>={},offers:Record<string,any>={},claims:Record<string,any>={},actors=new Set(watch.map(a=>a.toLowerCase()));
    const assetIds=new Set<string>(),sessionIds=new Set<string>();
    const deploymentAddresses=new Set(Object.values(d.addresses).map(a=>a.toLowerCase()));
    const actorFields=['borrower','buyer','owner','payer','from','to','account','beneficiary','recipient','spender'];
    for(const log of discoveryLogs){
      if(!deploymentAddresses.has(String(log.address).toLowerCase()))continue;
      const args=log.decoded?.args;if(args?.assetId)assetIds.add(args.assetId);if(args?.sessionId&&args.sessionId!==`0x${'0'.repeat(64)}`)sessionIds.add(args.sessionId);
      for(const field of actorFields){const actor=args?.[field];if(typeof actor==='string'&&/^0x[0-9a-fA-F]{40}$/.test(actor)&&!/^0x0{40}$/i.test(actor))actors.add(actor.toLowerCase());}
    }
    Object.values(d.addresses).forEach(a=>actors.add(a.toLowerCase()));
    const nextReceiptId:bigint=await read('manager','nextReceiptId');
    const ids=new Set<Hex>(offerIds);
    for(let id=1n;id<nextReceiptId;id++){
      const receipt=await read('manager','getReceipt',[id]);receipt.offerIds.forEach((x:Hex)=>ids.add(x));actors.add(receipt.consent.borrower);actors.add(receipt.consent.recipient);assetIds.add(receipt.consent.assetId);sessionIds.add(receipt.consent.sessionId);
      const [debt,debtRecord,remainingShares,backing,outstandingUnits,benchmark,assetState]=await Promise.all([
        read('vault','debtOf',[id]),read('vault','getDebt',[id]),read('vault','remainingSnapshotShares',[id]),read('vault','backingOf',[id]),read('vault','outstandingClaimUnits',[id]),read('oracle','benchmarkOf',[receipt.consent.sessionId]),read('oracle','assetState',[receipt.consent.assetId])]);
      receipts[id.toString()]={receipt,debt,debtRecord,remainingShares,backing,outstandingUnits,benchmark,assetState};
    }
    const termsHashes:Record<string,Hex>={};
    for(const id of ids){offers[id]=await read('book','getOffer',[id]);termsHashes[id]=await read('book','termsHashOf',[id]);actors.add(offers[id].buyer);}
    const nextClaimId:bigint=await read('vault','nextClaimId');for(let id=1n;id<nextClaimId;id++){claims[id.toString()]=await read('vault','getClaim',[id]);actors.add(claims[id.toString()].owner);}
    const balances:Record<string,any>={};await Promise.all([...actors].map(async actor=>{
      const [cash,stock,premiumCredit,cashCredit,poolShares,cashAllowanceManager,stockAllowanceVault,borrowerNonce]=await Promise.all([read('cash','balanceOf',[actor]),read('stock','balanceOf',[actor]),read('book','premiumCredit',[actor]),read('book','cashCredit',[actor]),read('pool','balanceOf',[actor]),read('cash','allowance',[actor,d.addresses.manager]),read('stock','allowance',[actor,d.addresses.vault]),read('manager','borrowerNonce',[actor])]);
      const [cashAllowancePool,cashAllowanceBook,nativeGas,restricted]=await Promise.all([read('cash','allowance',[actor,d.addresses.pool]),read('cash','allowance',[actor,d.addresses.book]),rpc.getBalance({address:actor,blockNumber:block.number}),read('stock','restricted',[actor])]);
      balances[actor]={cash,stock,premiumCredit,cashCredit,poolShares,cashAllowanceManager,stockAllowanceVault,borrowerNonce,cashAllowancePool,cashAllowanceBook,nativeGas,restricted};
    }));
    const [totalAssets,totalSupply,activeReceiptIds,totalLockedCash,totalPremiumCredits,totalCashCredits,accountedBacking]=await Promise.all([read('pool','totalAssets'),read('pool','totalSupply'),read('pool','activeReceiptIds'),read('book','totalLockedCash'),read('book','totalPremiumCredits'),read('book','totalCashCredits'),read('vault','accountedBacking',[d.addresses.stock])]);
    const offerCoverage=projectCoverage(offers,receipts,totalLockedCash,completeOfferDiscovery);
    const assets:Record<string,any>={},sessions:Record<string,any>={};
    for(const id of assetIds){const configs:Record<string,any>={},latest:bigint=await read('registry','latestVersion',[id]);for(let version=1n;version<=latest;version++){const [config,effectiveAt,configHash]=await read('registry','getConfig',[id,version]);configs[version.toString()]={config,effectiveAt,configHash};}assets[id]={configs,state:await read('oracle','assetState',[id]),corporateAction:await read('oracle','latestCorporateAction',[id])};}
    for(const id of sessionIds)sessions[id]={fact:await read('oracle','sessionFact',[id]),benchmark:await read('oracle','benchmarkOf',[id])};
    const [cashSymbol,cashDecimals,stockSymbol,stockDecimals,paused]=await Promise.all([read('cash','symbol'),read('cash','decimals'),read('stock','symbol'),read('stock','decimals'),read('stock','paused')]);
    const receiverModes=discoveryLogs.filter(l=>l.address.toLowerCase()===d.addresses.receiver.toLowerCase()&&l.decoded?.eventName==='ReceiverReportAccepted').map(l=>integers(l.decoded.args.mode));
    return {receipts,offers,offerCoverage,termsHashes,claims,balances,assets,sessions,tokens:{cash:{symbol:cashSymbol,decimals:cashDecimals},stock:{symbol:stockSymbol,decimals:stockDecimals,paused}},receiverMode:receiverModes.at(-1)??null,pool:{totalAssets,totalSupply,activeReceiptIds},book:{totalLockedCash,totalPremiumCredits,totalCashCredits},accountedBacking,nextReceiptId,nextClaimId};
  },at);
}
