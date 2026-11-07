import type {Frame} from '../adapter/transport';
/** Human display only: exact transaction amounts remain in the adapter. */
export function displayAmount(value:unknown):string {
 if(value===undefined||value===null||value==='—')return '—';
 const text=String(value);if(!/^\d+(\.\d+)?$/.test(text))return text;
 const [whole='0',fraction='']=text.split('.');
 const digits=whole.replace(/\B(?=(\d{3})+(?!\d))/g,',');
 if(whole==='0'&&fraction&&!/^0*$/.test(fraction)&&Number(text)<0.01)return text;
 return digits+(fraction?'.'+fraction.slice(0,2).padEnd(2,'0'):'');
}
export const shortAddress=(value?:string)=>value?`${value.slice(0,6)}…${value.slice(-4)}`:'Not connected';
export function demoProgress(frame:Frame|undefined,loanId:string){
 const s=frame?.state,p=s?.loans?.[loanId];
 if(!s)return {stage:'readiness',index:0,title:'Get ready for the bell',description:'Connect to the network and load the current session.',actor:'lender'};
 if(!p)return {stage:'borrow',index:0,title:'Start with an ordinary loan',description:'Supply liquidity, then The borrower can borrow against her stock.',actor:'borrower'};
 const session=s.assets?.[p.loan.assetId]?.state.activeSessionId;
 const covers=Object.values(s.receipts??{}).filter((r:any)=>r.receipt.loanId.toString()===loanId&&(!session||r.receipt.consent.sessionId===session)) as any[];
 const cover=covers.find(r=>r.receipt.status===1n)??covers.at(-1);
 if(cover?.receipt.status===2n)return {stage:'outcome',index:5,title:'See where the money went',description:'Cover has ended. Review debt, repayment and outstanding stock claims.',actor:''};
 if(cover?.benchmark?.finalized)return {stage:'settle',index:4,title:'The reopening report is accepted',description:'Review the covered position and settle under its agreed terms.',actor:'borrower'};
 if(cover){const fact=s.sessions?.[cover.receipt.consent.sessionId]?.fact;return fact?.closeObservedAt>0n?{stage:'reopen',index:3,title:'Waiting for the reopening report',description:'The operator runs CRE. Accepted market facts will appear here.',actor:''}:{stage:'close',index:2,title:'Buyer cash is committed',description:'Cover is active for this session. Waiting for the closing report.',actor:''};}
 const offers=Object.values(s.offers??{}).filter((o:any)=>o.status===1n&&o.terms.assetId===p.loan.assetId&&o.terms.expiry>frame!.block.timestamp);
 return offers.length?{stage:'cover',index:1,title:'Back the loan before the close',description:'The borrower selects funded offers and reviews the cover premium.',actor:'borrower'}:{stage:'offers',index:1,title:'Set a price. Commit the cash.',description:'Buyers can post independently funded offers.',actor:'buyer'};
}
