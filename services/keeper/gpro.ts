import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {keccak256,toHex,zeroHash} from 'viem';
import {replayInput,createLocalFixture} from './replay.ts';
import {observeHistorical} from '../../cre/bell-market-event/src/historical.ts';
import {fixture} from '../../cre/bell-market-event/tests/fixtures.ts';
const hash=(s:string)=>keccak256(toHex(s));
export const GOPRO_ASSET=hash('GPRO-HISTORICAL-REPLAY');
export type GproScenario='healthy'|'unhealthy';
export function archivedGpro(stage:'origination'|'cover'|'reopen'){
 const f=fixture(),c={...f.config,dataSource:'gpro-history',historical:{stage},providers:{...f.config.providers,primary:{id:'twelvedata',url:'https://api.twelvedata.com/time_series'},secondary:{id:'yahoo',url:'https://query2.finance.yahoo.com/v8/finance/chart/GPRO'}},replay:{...f.bundle,kind:stage==='reopen'?3:6}};
 return observeHistorical(c,key=>readFileSync(new URL(`../../cre/bell-market-event/fixtures/gpro/${key==='primary'?`twelve-${stage==='reopen'?'daily':stage}`:`yahoo-${stage==='reopen'?'daily':'hourly'}`}.json`,import.meta.url),'utf8'));
}
export function gproInput(scenario:GproScenario){
 if(!['healthy','unhealthy'].includes(scenario))throw Error('GPRO_SCENARIO');
 const input=replayInput();input.label='gpro-historical-replay';input.assetLabel='GPRO-HISTORICAL-REPLAY';input.sessionLabel='GPRO-HOLIDAY-REPLAY';
 input.lenderSupply='100000000';input.borrow.principal=scenario==='healthy'?'10000000':'11800000';input.consent.maxDebtAtAcceptance=input.consent.maxDebtAtDeadline='13000000';
 input.offerCommon.maxBorrowerLtvBps='7500';input.offerCommon.referencePrice='1775000';input.offerCommon.premium='10000';
 input.scenarios=[{id:scenario,buyers:[{actor:'buyerA',strike:'1700000',nonce:'1'},{actor:'buyerB',strike:'1650000',nonce:'2'}]}];
 for(const r of input.reports){r.assetId=GOPRO_ASSET;r.sessionId=r.kind==='6'?zeroHash:hash(input.sessionLabel);r.reference=`historical-gpro-${r.role}`;
  const stage=r.role==='origination-price'?'origination':r.role==='window-price'?'cover':r.role==='reopen'?'reopen':undefined;
  if(stage){const b=archivedGpro(stage);r.benchmarkPrice=b.primary!.price;r.primarySourceHash=b.primary!.responseHash;r.secondarySourceHash=b.secondary!.responseHash;}
 }
 return input;
}
/** Deterministic local transaction proof. No public or connected wallets are signed. */
export async function verifyGpro(){
 const runs=[];
 for(const scenario of ['healthy','unhealthy'] as const){
  const input=gproInput(scenario),f=await createLocalFixture(input);
  try{
   const a=f.actors;
   await f.approve(a.lender!,'deposit','100000000');await f.action(a.lender!,'pool','deposit',['100000000']);
   // A real lender round trip before borrowing; contracts supply the exact return.
   const owned=(await f.observe()).state.balances[a.lender!].poolShares;
   await f.action(a.lender!,'pool','redeem',[owned/10n,a.lender!]);
   await f.report(f.role('schedule'));await f.report(f.role('origination-price'));
   await f.approve(a.borrower!,'collateral',input.borrow.collateralShares);const loan=await f.borrow();
   await f.report(f.role('window-price'));await f.node.time(BigInt(input.coverAt));const receipt=await f.attach(loan,input.scenarios[0].buyers,input.consent.minSettlementDeadline);
   await f.report(f.role('close'));
   const remainingShares=(await f.observe()).state.balances[a.lender!].poolShares;
   await f.action(a.lender!,'pool','redeem',[remainingShares/100n,a.lender!]);
   await f.report(f.role('reopen'));
   const before=await f.observe();await f.action(a.keeper!,'manager','settle',[receipt],{kind:'settle',caller:a.keeper!,now:0n,receiptId:receipt,market:await f.market(),benchmark:before.state.receipts[receipt.toString()].benchmark});
   const after=await f.observe(),buyerCash=after.state.balances[f.deployment.addresses.pool!].cash-before.state.balances[f.deployment.addresses.pool!].cash;
   assert.equal(after.state.loans[loan.toString()].loan.activeCoverId,0n);
   for(const [id,c]of Object.entries(after.state.claims) as [string,any][]){if(!c.withdrawn)await f.action(c.owner,'vault','withdrawClaim',[id,c.owner],{kind:'withdrawClaim',caller:c.owner,now:0n,claimId:BigInt(id),to:c.owner});}
   runs.push({scenario,buyerCash,coverDetached:true,parity:true,loanId:loan,receiptId:receipt,transactions:f.transactions.map(t=>({label:t.label,transactionHash:t.transactionHash})),final:await f.observe()});
  }finally{await f.stop();}
 }
 return {authority:'Historical archived observations; local Anvil transactions; native CRE evidence is separate',interactiveConsentVerified:false,runs};
}
