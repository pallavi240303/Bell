import type {Intent} from './wallet.ts';
import {argument} from './wallet.ts';
import {abis} from '../generated/abis.ts';
import {encodeAbiParameters,encodeFunctionData,parseUnits,keccak256,stringToHex,type Address,type Hex} from 'viem';
import {uint} from './transport.ts';
export function offerTerms(text:string,shares:string,strike:string,premium:string):Record<string,unknown>{
  const terms=JSON.parse(text);
  const units=(value:string,decimals:number)=>{
    if(!new RegExp(`^(0|[1-9][0-9]*)(\\.[0-9]{1,${decimals}})?$`).test(value))throw Error('Exact nonnegative token amount required');
    return parseUnits(value,decimals).toString();
  };
  if(!terms||typeof terms!=='object'||Array.isArray(terms))throw Error('Complete offer terms required');
  const result={...terms,snapshotShares:units(shares,18),strike:units(strike,6),premium:units(premium,6)};
  const fn=abis.book.find(x=>x.type==='function'&&x.name==='postOffer')!;
  const tuple=(fn as Extract<typeof fn,{type:'function'}>).inputs[0]!;
  if(Object.keys(result).some(key=>!tuple.components.some(c=>c.name===key)))throw Error('Unexpected offer term');
  // Validate the entire generated tuple before a cancel transaction can be requested.
  encodeFunctionData({abi:abis.book,functionName:'postOffer',args:[argument(tuple,result) as any]});
  return result;
}
export function hashBundle(chainId:string,manager:Address,quote:unknown,offerIds:Hex[],termsHashes:Hex[]):Hex{
  const fn=abis.manager.find(x=>x.type==='function'&&x.name==='buyCover')!;
  const tuple=(fn as Extract<typeof fn,{type:'function'}>).inputs[1]!;
  const hashArray=(ids:Hex[])=>keccak256(encodeAbiParameters([{type:'bytes32[]'}],[ids]));
  return keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'},{type:'address'},tuple,{type:'bytes32'},{type:'bytes32'}],[keccak256(stringToHex('BELL_COVER_QUOTE_V2')),uint(chainId),manager,argument(tuple,quote),hashArray(offerIds),hashArray(termsHashes)]));
}
export function coverIntent(loanId:string,quote:unknown,offerIds:string[],termsHashes:string[],expectedQuoteHash:string):Intent{
  if(offerIds.length<1||offerIds.length>8)throw Error('Select one to eight whole lots');
  if(offerIds.length!==termsHashes.length)throw Error('Each lot requires its immutable terms hash');
  if(new Set(offerIds).size!==offerIds.length)throw Error('Duplicate lot');
  return {contract:'manager',method:'buyCover',args:[loanId,quote,offerIds,termsHashes,expectedQuoteHash]};
}
export async function editOffer(offer:{status:bigint;terms:{nonce:bigint}},id:string,terms:Record<string,unknown>,send:(intent:Intent)=>Promise<unknown>){
  if(offer.status!==1n)throw Error('Only FREE offers are editable');if(terms.nonce===offer.terms.nonce.toString())throw Error('Use a fresh nonce');
  await send({contract:'book',method:'cancelOffer',args:[id]});
  await send({contract:'book',method:'postOffer',args:[terms]});
}

/** Pure previews from verified canonical observations; contracts simulate every submitted intent. */
import type {Frame} from './transport.ts';
import {json} from './transport.ts';
import {loanPrice,positionDebt,projectedDebt} from '../../engine/receipt.ts';
import {policyHash} from '../../engine/quote.ts';
import {mulDivDown} from '../../engine/math.ts';
export function position(p:any){return {...p,debt:p.debtRecord};}
export function marketContext(frame:Frame,assetId?:string){
 const now=frame.block.timestamp;
 const entry=assetId?[assetId,frame.state.assets?.[assetId]]:Object.entries(frame.state.assets??{}).find(([,a]:any)=>a.referenceCheck?.ok);
 if(!entry?.[1])throw Error('Verified asset metadata unavailable');const [id,a]=entry as [string,any],session=frame.state.sessions?.[a.state.activeSessionId]?.fact;
 if(!a.referenceCheck?.ok||a.referenceCheck.referenceInvalidated||a.state.halted||!session||session.phase!==1n||now<session.scheduledOpen||now>=session.scheduledClose||a.latestReference.validUntil<now||a.latestReference.observedAt>now||now-a.latestReference.observedAt>1800n)throw Error('Fresh open-session reference required');
 const version=Object.entries(a.configs).find(([,c]:any)=>c.configHash===session.configHash&&c.configHash===a.state.configHash&&c.effectiveAt<=now);
 if(!version)throw Error('Effective session configuration unavailable');return {assetId:id,asset:a,session,sessionId:a.state.activeSessionId,version:version[0],config:(version[1] as any).config,configHash:(version[1] as any).configHash,reference:a.latestReference};
}
const raw=(v:any)=>JSON.parse(json(v));
export function borrowRequest(frame:Frame,account:string,amounts:Record<string,unknown>={}){
 const m=marketContext(frame);return raw({assetId:m.assetId,configVersion:m.version,configHash:m.configHash,principal:'',collateralShares:'',recipient:account,referenceReportHash:m.reference.reportHash,expiry:(m.reference.validUntil<m.session.scheduledClose?m.reference.validUntil:m.session.scheduledClose-1n),...amounts});
}
export function offerTarget(frame:Frame,selection?:string){
 const loans=Object.entries(frame.state.loans??{}).filter(([,p]:any)=>p.loan.status===1n);
 if(selection&&selection!=='current'){const chosen=loans.find(([id])=>id===selection);if(!chosen)throw Error('Choose an existing loan share basis');return {loanId:chosen[0],position:chosen[1] as any};}
 const m=marketContext(frame),r=m.reference,bases=new Set([`${m.assetId}:${r.multiplierNumerator}:${r.multiplierDenominator}`,...loans.map(([,p]:any)=>`${p.loan.assetId}:${p.debtRecord.terms.snapshotMultiplierNumerator}:${p.debtRecord.terms.snapshotMultiplierDenominator}`)]);
 if(!selection&&bases.size>1)throw Error('Choose a share basis: current units or an existing loan');return {loanId:'current',position:undefined};
}
export function offerTemplate(frame:Frame,chainId:string,manager:Address,account:string,existing:Record<string,unknown>={},selection?:string){
 const target=offerTarget(frame,selection),p=target.position,m=marketContext(frame,p?.loan.assetId),cp=frame.state.coverPolicy,r=m.reference;
 const n=p?.debtRecord.terms.snapshotMultiplierNumerator??r.multiplierNumerator,d=p?.debtRecord.terms.snapshotMultiplierDenominator??r.multiplierDenominator;
 const nonces=Object.values(frame.state.offers??{}).filter((o:any)=>o.buyer===account).map((o:any)=>o.terms.nonce as bigint);
 const nonce=nonces.reduce((a,b)=>a>b?a:b,-1n)+1n;
 const manual=Object.fromEntries(['snapshotShares','strike','premium','maxBorrowerLtvBps','maxReferenceDeviationBps','expiry','nonce'].filter(k=>existing[k]!==undefined).map(k=>[k,existing[k]]));
 return raw({assetId:m.assetId,policyHash:policyHash(uint(chainId),manager,m.assetId as Hex,m.sessionId,m.configHash,n,d,cp.profile,cp.coverOpensBeforeClose,cp.coverCutoffBeforeClose),snapshotShares:'',strike:'',premium:'',maxBorrowerLtvBps:m.config.originationLtvBps,referencePrice:p?loanPrice(position(p),r):r.price,maxReferenceDeviationBps:0n,expiry:'',nonce,...manual});
}
export function coverPreview(frame:Frame,chainId:string,manager:Address,account:string,loanId:string,ids:string[],bounds:Record<string,unknown>={}){
 const p=frame.state.loans?.[loanId];if(!p||p.loan.borrower!==account||p.loan.status!==1n||p.loan.activeCoverId!==0n)throw Error('Select an owned active uncovered loan');
 if(ids.length<1||ids.length>8||new Set(ids).size!==ids.length)throw Error('Select one to eight whole lots');
 const m=marketContext(frame,p.loan.assetId),cp=frame.state.coverPolicy,t=p.debtRecord.terms;
 const opens=BigInt(m.session.scheduledClose)-BigInt(cp.coverOpensBeforeClose),cutoff=BigInt(m.session.scheduledClose)-BigInt(cp.coverCutoffBeforeClose);
 if(m.session.scheduledOpen>opens||frame.block.timestamp<opens||frame.block.timestamp>=cutoff)throw Error('Outside the cover window');
 const lots=ids.map(id=>{const o=frame.state.offers?.[id];if(!o||o.status!==1n||!frame.state.termsHashes?.[id])throw Error('FREE immutable lots required');return o;});
 let total=0n,premium=0n,weighted=0n,deadline=lots[0].terms.expiry;
 for(const o of lots){total+=o.terms.snapshotShares;premium+=o.terms.premium;weighted+=BigInt(o.terms.snapshotShares)*BigInt(o.terms.strike);if(o.terms.expiry<deadline)deadline=o.terms.expiry;}
 if(total===0n||deadline<=m.session.scheduledClose)throw Error('Lots need a funded deadline after close');
 const expiry=m.reference.validUntil<cutoff?m.reference.validUntil:cutoff-1n;
 return raw({borrower:account,recipient:p.loan.recipient,borrowerNonce:frame.state.balances[account].borrowerNonce,expiry,assetId:m.assetId,sessionId:m.sessionId,configVersion:m.version,configHash:m.configHash,policyHash:policyHash(uint(chainId),manager,m.assetId as Hex,m.sessionId,m.configHash,t.snapshotMultiplierNumerator,t.snapshotMultiplierDenominator,cp.profile,cp.coverOpensBeforeClose,cp.coverCutoffBeforeClose),principal:t.originalPrincipal,collateralShares:p.remainingShares,referencePrice:loanPrice(position(p),m.reference),scheduledReportHash:m.session.scheduledReportHash,corporateActionHash:m.asset.state.latestCorporateActionHash,snapshotMultiplierNumerator:t.snapshotMultiplierNumerator,snapshotMultiplierDenominator:t.snapshotMultiplierDenominator,totalPremium:premium,totalOfferShares:total,weightedStrike:mulDivDown(weighted,1n,total),minSettlementDeadline:deadline,maxSettlementDeadline:deadline,loanId,maxDebtAtAcceptance:projectedDebt(position(p),expiry,frame.block.timestamp),maxDebtAtDeadline:projectedDebt(position(p),deadline,frame.block.timestamp),referenceReportHash:m.reference.reportHash,...bounds});
}
export function borrowIntent(request:unknown):Intent{return {contract:'loanManager',method:'borrow',args:[request]};}
