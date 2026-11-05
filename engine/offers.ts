import { BPS, ZERO, ZERO_ADDRESS } from './params.ts';
import { cash, price, checked } from './math.ts';
import { cashOwed, cashDelta } from './settle.ts';
import { hashEncoded, TERMS_ABI } from './quote.ts';
import { fail, fixed, uint, type Hex, type Offer, type OfferTerms } from './types.ts';
export function offerId(chainId: bigint, book: Hex, buyer: Hex, nonce: bigint): Hex { return hashEncoded('uint256,address,address,uint256', [chainId, book, buyer, nonce]); }
export function termsHash(id: Hex, offer: Offer): Hex { return hashEncoded(`bytes32,address,${TERMS_ABI},uint256`, [id, offer.buyer, offer.terms, offer.cashCapacity]); }
export function makeOffer(buyer: Hex, terms: OfferTerms, now: bigint, eligible: boolean, nonceUsed: boolean): Offer {
  if (terms.assetId === ZERO || terms.policyHash === ZERO || terms.snapshotShares === 0n || terms.strike === 0n || terms.referencePrice === 0n || terms.expiry <= now) fail('InvalidOfferTerms');
  if (terms.maxBorrowerLtvBps > BPS || terms.maxReferenceDeviationBps > BPS) fail('InvalidOfferTerms');
  cash(terms.premium); const capacity = cashOwed(terms.snapshotShares, terms.strike); price(terms.referencePrice);
  if (!eligible) fail('IneligibleBuyer', buyer);
  if (nonceUsed) fail('OfferNonceUsed', buyer, terms.nonce);
  return { buyer, terms: structuredClone(terms), cashCapacity: capacity, cumulativeExercisedShares: 0n, cumulativeCashCharged: 0n, receiptId: 0n, status: 1n };
}
export function requireOfferStatus(offer: Offer, status: bigint): void { if (offer.status !== status) fail('InvalidOfferState', status, offer.status); }
export function validateReservation(offer: Offer, hashMatches: boolean, receiptId: bigint, payer: Hex, deadline: bigint, reference: bigint, ltv: bigint, now: bigint, eligible: boolean): void {
  if (receiptId === 0n) fail('InvalidReceiptId'); if (payer === ZERO_ADDRESS) fail('ZeroAddress'); requireOfferStatus(offer, 1n);
  if (!hashMatches) fail('OfferTermsHashMismatch');
  const t = offer.terms;
  if (t.expiry < now || t.expiry < deadline) fail('OfferExpiredBeforeSettlement');
  if (ltv > t.maxBorrowerLtvBps) fail('BorrowerLtvTooHigh'); price(reference);
  if (!eligible) fail('IneligibleBuyer', offer.buyer);
  const difference = reference > t.referencePrice ? reference - t.referencePrice : t.referencePrice - reference;
  if (difference * BPS > t.referencePrice * t.maxReferenceDeviationBps) fail('ReferenceDeviationTooHigh');
}
export function exercise(offer: Offer, cumulative: bigint, applied: bigint, borrower: Hex): { offer: Offer; charged: bigint; excess: bigint } {
  uint(cumulative); uint(applied); fixed(borrower,20n);
  if (borrower === ZERO_ADDRESS) fail('ZeroAddress'); requireOfferStatus(offer, 2n);
  if (cumulative <= offer.cumulativeExercisedShares || cumulative > offer.terms.snapshotShares) fail('InvalidExerciseShares');
  const charged = cashDelta(offer.cumulativeExercisedShares, cumulative, offer.terms.strike);
  if (applied === 0n || applied > charged) fail('InvalidDebtApplied');
  return { offer: { ...offer, cumulativeExercisedShares: cumulative, cumulativeCashCharged: offer.cumulativeCashCharged + charged }, charged, excess: charged - applied };
}

export interface BookState {
  chainId: bigint; book: Hex; manager: Hex; pool: Hex;
  offers: Record<Hex,Offer>; termsHashes: Record<Hex,Hex>; usedNonces: Record<string,boolean>;
  locked: bigint; premiums: bigint; credits: bigint;
  balances: Record<Hex,bigint>; allowances: Record<Hex,bigint>;
  premiumCredits: Record<Hex,bigint>; cashCredits: Record<Hex,bigint>;
}
export interface BookAction {
  kind:'post'|'cancel'|'reserve'|'exercise'|'release'; caller:Hex; now:bigint;
  id?:Hex; terms?:OfferTerms; eligible?:boolean; termsHash?:Hex;
  receiptId?:bigint; payer?:Hex; deadline?:bigint; reference?:bigint; ltv?:bigint;
  cumulative?:bigint; applied?:bigint; borrower?:Hex;
}
export function emptyBook(chainId:bigint,book:Hex,manager:Hex,pool:Hex):BookState {
  uint(chainId);for(const address of [book,manager,pool])fixed(address,20n);
  return {chainId,book,manager,pool,offers:{},termsHashes:{},usedNonces:{},locked:0n,premiums:0n,credits:0n,balances:{},allowances:{},premiumCredits:{},cashCredits:{}};
}
function validateBookAction(a:BookAction):void {
  if(!['post','cancel','reserve','exercise','release'].includes(a.kind))throw new TypeError('unknown book action');
  fixed(a.caller,20n);uint(a.now);
  for(const address of [a.payer,a.borrower])if(address!==undefined)fixed(address,20n);
  for(const id of [a.id,a.termsHash])if(id!==undefined)fixed(id,32n);
  for(const value of [a.receiptId,a.reference,a.cumulative,a.applied])if(value!==undefined)uint(value);
  if(a.deadline!==undefined)uint(a.deadline,64n);
  if(a.ltv!==undefined)uint(a.ltv,16n);
  if(a.eligible!==undefined&&typeof a.eligible!=='boolean')throw new TypeError('invalid bool');
  if(a.terms!==undefined){
    const t=a.terms;fixed(t.assetId,32n);fixed(t.policyHash,32n);
    for(const value of [t.snapshotShares,t.strike,t.premium,t.referencePrice,t.nonce])uint(value);
    uint(t.maxBorrowerLtvBps,16n);uint(t.maxReferenceDeviationBps,16n);uint(t.expiry,64n);
  }
}
function bookCredit(map:Record<Hex,bigint>,who:Hex,amount:bigint):void {map[who]=checked((map[who]??0n)+amount);}
function bookPull(s:BookState,from:Hex,amount:bigint):void {
  if(from===s.book)fail('InvalidTokenBalanceDelta',amount,0n);
  const approved=s.allowances[from]??0n;
  if(approved<amount)fail('Error','allowance');
  s.allowances[from]=approved-amount;
  if((s.balances[from]??0n)<amount)fail('Error','balance');
  s.balances[from]=(s.balances[from]??0n)-amount;bookCredit(s.balances,s.book,amount);
}
function bookPush(s:BookState,to:Hex,amount:bigint):void {
  if(to===s.book)fail('InvalidTokenBalanceDelta',amount,0n);
  if((s.balances[s.book]??0n)<amount)fail('Error','balance');
  s.balances[s.book]=(s.balances[s.book]??0n)-amount;bookCredit(s.balances,to,amount);
}
function absentOffer():Offer {return {buyer:ZERO_ADDRESS,terms:{assetId:ZERO,policyHash:ZERO,snapshotShares:0n,strike:0n,premium:0n,maxBorrowerLtvBps:0n,referencePrice:0n,maxReferenceDeviationBps:0n,expiry:0n,nonce:0n},cashCapacity:0n,cumulativeExercisedShares:0n,cumulativeCashCharged:0n,receiptId:0n,status:0n};}
/** Atomic CommitmentBook transition over the supplied eligibility and MockCashToken snapshot. */
export function bookTransition(input:BookState,a:BookAction):BookState {
  validateBookAction(a);
  const s=structuredClone(input);
  if(a.kind==='post'){
    if(s.manager===ZERO_ADDRESS)fail('NotInitialized');
    if(!a.terms)throw new TypeError('missing offer terms');
    const key=`${a.caller}:${a.terms.nonce}`;
    const offer=makeOffer(a.caller,a.terms,a.now,a.eligible??false,s.usedNonces[key]??false);
    const id=offerId(s.chainId,s.book,a.caller,a.terms.nonce);
    s.usedNonces[key]=true;s.offers[id]=offer;s.termsHashes[id]=termsHash(id,offer);
    s.locked=checked(s.locked+offer.cashCapacity);
    bookPull(s,a.caller,offer.cashCapacity);
  }else{
    if(!a.id)throw new TypeError('missing offer id');
    const offer=s.offers[a.id]??absentOffer();
    if(a.kind==='cancel'){
      if(a.caller!==offer.buyer)fail('NotOfferBuyer',a.caller);
      requireOfferStatus(offer,1n);
      offer.status=4n;s.locked-=offer.cashCapacity;s.credits=checked(s.credits+offer.cashCapacity);
      bookCredit(s.cashCredits,offer.buyer,offer.cashCapacity);
    }else{
      if(a.caller!==s.manager)fail('UnauthorizedManager',a.caller);
      if(a.kind==='reserve'){
        validateReservation(offer,(s.termsHashes[a.id]??ZERO)===(a.termsHash??ZERO),a.receiptId??0n,a.payer??ZERO_ADDRESS,a.deadline??0n,a.reference??0n,a.ltv??0n,a.now,a.eligible??false);
        offer.status=2n;offer.receiptId=a.receiptId??0n;
        if(offer.terms.premium!==0n){
          bookCredit(s.premiumCredits,offer.buyer,offer.terms.premium);s.premiums=checked(s.premiums+offer.terms.premium);
          bookPull(s,a.payer??ZERO_ADDRESS,offer.terms.premium);
        }
      }else if(a.kind==='exercise'){
        const result=exercise(offer,a.cumulative??0n,a.applied??0n,a.borrower??ZERO_ADDRESS);
        s.offers[a.id]=result.offer;s.locked-=result.charged;
        if(result.excess!==0n){bookCredit(s.cashCredits,a.borrower??ZERO_ADDRESS,result.excess);s.credits=checked(s.credits+result.excess);}
        bookPush(s,s.pool,a.applied??0n);
      }else{
        requireOfferStatus(offer,2n);
        const unused=offer.cashCapacity-offer.cumulativeCashCharged;
        offer.status=3n;s.locked-=unused;s.credits=checked(s.credits+unused);bookCredit(s.cashCredits,offer.buyer,unused);
      }
    }
  }
  const liabilities=s.locked+s.premiums+s.credits,available=s.balances[s.book]??0n;
  if(available<liabilities)fail('LiabilityShortfall',available,liabilities);
  return s;
}
