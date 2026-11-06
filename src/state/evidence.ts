/** Display-only attribution from exact accepted contract events; never infer a missing charge. */
export function claimPayment(id:string,claim:any,state:any,events:any[],addresses:Record<string,string>|undefined):{paid?:bigint;strike?:bigint}{
 if(!addresses)return {};
 const fills=events.filter(e=>e.address===addresses.manager&&e.decoded?.eventName==='ReceiptOfferExercised'&&e.decoded.args.claimId?.toString()===id);
 if(fills.length!==1)return {};const fill=fills[0],a=fill.decoded.args,o=state.offers?.[a.offerId],r=state.receipts?.[a.receiptId?.toString()]?.receipt;
 if(!o||o.buyer!==claim.owner||a.additionalShares!==claim.snapshotShares||r?.loanId!==claim.receiptId)return {};
 const charges=events.filter(e=>e.address===addresses.book&&e.transactionHash===fill.transactionHash&&e.decoded?.eventName==='OfferExercised'&&e.decoded.args.offerId===a.offerId&&e.decoded.args.receiptId===a.receiptId&&e.decoded.args.debtApplied===a.debtApplied);
 if(charges.length!==1)return {};return {paid:charges[0].decoded.args.cashCharged,strike:o.terms.strike};
}
export function repaidFromCover(events:any[],manager:string|undefined):bigint{
 const seen=new Set<string>();let sum=0n;
 for(const e of events){if(!manager||e.address!==manager||e.decoded?.eventName!=='ReceiptOfferExercised'||typeof e.decoded.args.debtApplied!=='bigint'||!e.transactionHash||e.logIndex===undefined)continue;const key=`${e.transactionHash}:${e.logIndex}`;if(!seen.has(key)){seen.add(key);sum+=e.decoded.args.debtApplied;}}
 return sum;
}
