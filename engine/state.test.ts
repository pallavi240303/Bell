import test from 'node:test';
import assert from 'node:assert/strict';
import { ZERO, MAX_UINT } from './params.ts';
import type { Config, MarketFacts, Quote, Hex } from './types.ts';
import { SolidityError } from './types.ts';
import { initialState, transition, debtOf, totalAssets, executionCash, type Action, type State } from './state.ts';
import { policyHash, quoteHash } from './quote.ts';
import { makeOffer, termsHash } from './offers.ts';
export const addr=(n:bigint)=>`0x${n.toString(16).padStart(40,'0')}` as Hex;
export const word=(n:bigint)=>`0x${n.toString(16).padStart(64,'0')}` as Hex;
export function fixture(){
 const config:Config={assetToken:addr(8n),stockTokenDecimals:18n,cashTokenDecimals:6n,originationLtvBps:6000n,targetLtvBps:6500n,triggerLtvBps:7500n,rateNumerator:800n,rateDenominator:315360000000n,maxFills:8n,maxActiveReceipts:32n,supportedCorporateActions:6n};
 const m:MarketFacts={configFound:true,configAssetId:word(1n),configVersion:1n,config,effectiveAt:1n,configHash:word(3n),tokenDecimals:18n,cashDecimals:6n,bindingsMatch:true,halted:false,phase:1n,scheduledOpen:900n,scheduledClose:1500n,sessionAssetId:word(1n),activeSessionId:word(2n),sessionConfigHash:word(3n),stateConfigHash:word(3n),scheduledReportHash:word(5n),actionHash:ZERO,actionN:0n,actionD:0n,referenceInvalidated:false,referenceFact:{assetId:word(1n),sessionId:word(2n),configHash:word(3n),price:100000000n,multiplierNumerator:1n,multiplierDenominator:1n,observedAt:1000n,validUntil:2000n,corporateActionHash:ZERO,primarySourceHash:word(6n),secondarySourceHash:word(7n),reportHash:word(8n)},eligible:[true]};
 const s=initialState(1n,addr(9n),addr(10n),addr(3n),addr(4n),addr(5n));
 for(const who of [addr(1n),addr(2n),addr(6n)]){s.cashBalances[who]=10000000000n;s.cashAllowanceLoanManager[who]=MAX_UINT;s.cashAllowanceBook[who]=MAX_UINT;}
 s.cashBalances[s.pool]=100000000000n;s.stockBalances[config.assetToken]={[addr(1n)]:100n*10n**18n,[addr(2n)]:100n*10n**18n};s.stockAllowanceVault[config.assetToken]={[addr(1n)]:MAX_UINT,[addr(2n)]:MAX_UINT};
 const request={assetId:word(1n),configVersion:1n,configHash:m.configHash,principal:500000000n,collateralShares:10n*10n**18n,recipient:addr(1n),referenceReportHash:m.referenceFact.reportHash,expiry:1400n};
 return {s,m,request};
}
export function borrowed(){const f=fixture();return {...f,s:transition(f.s,{kind:'borrow',caller:addr(1n),now:1000n,request:f.request,market:f.m})};}
export function attach(s:State,m:MarketFacts,loanId=1n,now=1100n){
 const p=s.loans[loanId.toString()]!,t=p.debt.terms,id=word(s.nextReceiptId+100n),policy=policyHash(s.chainId,s.manager,p.loan.assetId,m.activeSessionId,m.configHash,t.snapshotMultiplierNumerator,t.snapshotMultiplierDenominator,s.profile,s.opensOffset,s.cutoffOffset);
 const o=makeOffer(addr(2n),{assetId:p.loan.assetId,policyHash:policy,snapshotShares:p.remainingShares,strike:100000000n,premium:200n,maxBorrowerLtvBps:7500n,referencePrice:100000000n,maxReferenceDeviationBps:10000n,expiry:m.scheduledClose+500n,nonce:s.nextReceiptId},now,true,false);
 s=structuredClone(s);s.offers[id]=o;s.termsHashes[id]=termsHash(id,o);s.totalLockedCash+=o.cashCapacity;s.cashBalances[s.book]=(s.cashBalances[s.book]??0n)+o.cashCapacity;
 const q:Quote={borrower:p.loan.borrower,recipient:p.loan.recipient,borrowerNonce:s.borrowerNonces[p.loan.borrower]??0n,expiry:now+100n,assetId:p.loan.assetId,sessionId:m.activeSessionId,configVersion:1n,configHash:m.configHash,policyHash:policy,principal:t.originalPrincipal,collateralShares:p.remainingShares,referencePrice:100000000n,scheduledReportHash:m.scheduledReportHash,corporateActionHash:m.actionHash,snapshotMultiplierNumerator:t.snapshotMultiplierNumerator,snapshotMultiplierDenominator:t.snapshotMultiplierDenominator,totalPremium:200n,totalOfferShares:p.remainingShares,weightedStrike:100000000n,minSettlementDeadline:m.scheduledClose+500n,maxSettlementDeadline:m.scheduledClose+500n,loanId,maxDebtAtAcceptance:MAX_UINT,maxDebtAtDeadline:MAX_UINT,referenceReportHash:m.referenceFact.reportHash};
 const action:Action={kind:'buyCover',caller:p.loan.borrower,loanId,now,market:m,quote:q,offerIds:[id],termsHashes:[s.termsHashes[id]!],expectedHash:quoteHash(s.chainId,s.manager,q,[id],[s.termsHashes[id]!])};return {before:s,action,s:transition(s,action),q};
}
test('ordinary borrow has no cover, preserves 8% basis through repay/attach/detach and renewed interest',()=>{
 let {s,m}=borrowed();assert.equal(Object.keys(s.receipts).length,0);assert.equal(s.totalPremiumCredits,0n);assert.deepEqual(s.activeLoanIds,[1n]);
 s=transition(s,{kind:'repay',loanId:1n,now:1050n,caller:addr(1n),amount:10000000n,market:m});const basis=structuredClone(s.loans['1']!.debt),before=s.cashBalances[addr(1n)]!;s=attach(s,m).s;
 assert.deepEqual(s.loans['1']!.debt,basis);assert.equal(s.cashBalances[addr(1n)],before-200n);
 s=transition(s,{kind:'settle',receiptId:1n,now:1501n,caller:addr(6n),market:m,benchmark:{finalized:true,assetId:word(1n),sessionId:word(2n),configHash:word(3n),price:100000000n,multiplierNumerator:1n,multiplierDenominator:1n,reportHash:word(90n)}});
 assert.equal(s.receipts['1']!.status,2n);assert.equal(s.loans['1']!.loan.status,1n);assert.equal(s.loans['1']!.activeCoverDeadline,0n);assert.equal(s.totalLockedCash,0n);assert.ok(debtOf(s,1n,2100n)>debtOf(s,1n,2000n));assert.equal(totalAssets(s,2100n),s.cashBalances[s.pool]!+debtOf(s,1n,2100n));
});
test('later receipt on same loan and other ordinary loan retain prior claims/backing and total pool debt',()=>{
 let {s,m,request}=borrowed();s=transition(s,{kind:'borrow',caller:addr(2n),now:1000n,request:{...request,recipient:addr(2n)},market:m});s=attach(s,m).s;
 s=transition(s,{kind:'settle',receiptId:1n,now:1501n,caller:addr(6n),market:m,benchmark:{finalized:true,assetId:word(1n),sessionId:word(2n),configHash:word(3n),price:60000000n,multiplierNumerator:1n,multiplierDenominator:1n,reportHash:word(90n)}});
 assert.ok(Object.keys(s.claims).length>0);const claims=structuredClone(s.claims),other=structuredClone(s.loans['2']);
 m={...m,activeSessionId:word(22n),scheduledOpen:2100n,scheduledClose:2700n,referenceFact:{...m.referenceFact,sessionId:word(22n),observedAt:2200n,validUntil:3200n,reportHash:word(88n)}};
 s=attach(s,m,1n,2200n).s;assert.equal(s.receipts['2']!.loanId,1n);assert.deepEqual(s.claims,claims);assert.deepEqual(s.loans['2'],other);
 const before=structuredClone(s);assert.throws(()=>transition(s,{kind:'terminal',receiptId:1n,now:2200n,caller:addr(6n),market:m}),{name:'ReceiptNotActive'});assert.deepEqual(s,before);
 assert.equal(totalAssets(s,2200n),s.cashBalances[s.pool]!+debtOf(s,1n,2200n)+debtOf(s,2n,2200n));
});
test('token allowance, pause, repayment string errors and full closure retain atomicity',()=>{
 let {s,m}=borrowed();const caller=addr(1n),token=m.config.assetToken;s.stockAllowanceVault[token]![caller]=10n;
 for(const kind of ['addCollateral','topUp'] as const){const before=structuredClone(s);assert.equal(transition(s,{kind,loanId:1n,now:1001n,caller,amount:4n,market:m}).stockAllowanceVault[token]![caller],6n);assert.throws(()=>transition(s,{kind,loanId:1n,now:1001n,caller,amount:11n,market:m,stockFailure:new SolidityError('TransfersPaused')}),{name:'ERC20InsufficientAllowance',args:[s.vault,10n,11n]});assert.deepEqual(s,before);}
 s.cashAllowanceLoanManager[caller]=3n;assert.throws(()=>transition(s,{kind:'repay',loanId:1n,now:1001n,caller,amount:4n,market:m}),{name:'Error',args:['allowance']});assert.throws(()=>transition(s,{kind:'repay',loanId:1n,now:1001n,caller:s.pool,amount:3n,market:m}),{name:'InvalidTokenBalanceDelta'});
 s.cashAllowanceLoanManager[caller]=MAX_UINT;s=attach(s,m).s;s=transition(s,{kind:'repay',loanId:1n,now:1101n,caller,amount:debtOf(s,1n,1101n),market:m});assert.equal(s.loans['1']!.loan.status,2n);assert.equal(s.receipts['1']!.status,2n);assert.equal(debtOf(s,1n,9999n),0n);
 assert.throws(()=>transition(s,{kind:'finalize',loanId:1n,now:1101n,caller:addr(2n)}),{name:'InvalidBorrower'});const before=structuredClone(s);assert.throws(()=>transition(s,{kind:'withdrawClaim',claimId:1n,now:1101n,caller,stockFailure:new SolidityError('TransfersPaused')}),{name:'TransfersPaused'});assert.deepEqual(s,before);
 s=transition(s,{kind:'withdrawClaim',claimId:1n,now:1101n,caller});s=transition(s,{kind:'finalize',loanId:1n,now:1101n,caller});assert.equal(s.loans['1']!.loan.status,3n);assert.equal(s.receipts['1']!.status,2n);
});
test('fresh-reference and canonical action checks do not affect repay/add',()=>{
 const {s,m}=borrowed(),before=structuredClone(s),caller=addr(1n);const halted={...m,halted:true};
 assert.throws(()=>transition(s,{kind:'withdrawCollateral',loanId:1n,now:1001n,caller,amount:1n,market:halted}),{name:'AssetHalted',args:[word(1n)]});
 assert.doesNotThrow(()=>transition(s,{kind:'repay',loanId:1n,now:1001n,caller,amount:1n,market:halted}));
 for(const field of ['now','amount','claimId'] as const)for(const invalid of [-1n,1n<<256n,1,'1'])assert.throws(()=>transition(s,{kind:'topUp',loanId:1n,now:1001n,caller,amount:1n,[field]:invalid} as Action),TypeError);
 for(const field of ['caller','to'] as const)for(const invalid of ['0x1','0x'+'A'.repeat(40),1n])assert.throws(()=>transition(s,{kind:'topUp',loanId:1n,now:1001n,caller,amount:1n,[field]:invalid} as Action),TypeError);
 const benchmark={finalized:true,assetId:word(1n),sessionId:word(2n),configHash:word(3n),reportHash:word(4n),price:1n,multiplierNumerator:1n,multiplierDenominator:1n};
 for(const field of ['multiplierNumerator','multiplierDenominator'] as const)for(const invalid of [-1n,1n<<128n])assert.throws(()=>transition(s,{kind:'topUp',loanId:1n,now:1001n,caller,amount:1n,benchmark:{...benchmark,[field]:invalid}}),TypeError);
 assert.throws(()=>transition(s,{kind:'topUp',loanId:1n,now:1001n,caller,amount:1n,benchmark:{...benchmark,reportHash:'0x12'}}),TypeError);
 assert.throws(()=>transition(s,{kind:'topUp',loanId:1n,now:1001n,caller,amount:1n,benchmark:{...benchmark,price:-1n}}),TypeError);
 assert.deepEqual(s,before);
});
test('ordinary insolvency writes off uncovered risk and leaves another loan intact',()=>{
 let {s,m,request}=borrowed();s=transition(s,{kind:'borrow',caller:addr(2n),now:1000n,request:{...request,recipient:addr(2n)},market:m});const other=structuredClone(s.loans['2']);m={...m,referenceFact:{...m.referenceFact,price:1000000n}};
 s=transition(s,{kind:'liquidate',loanId:1n,now:1001n,caller:addr(6n),amount:MAX_UINT,market:m});assert.equal(s.loans['1']!.loan.status,2n);assert.deepEqual(s.loans['2'],other);assert.deepEqual(s.activeLoanIds,[2n]);assert.equal(s.totalCashCredits,0n);
});
test('execution-cost envelope floors once and retains native remainder, separate from core transitions',()=>{
 assert.deepEqual(executionCash(10000000000000001n,10000n,5n,7294020000000000n),{native:2710980000000001n,cash:2710n,remainder:980000000001n});
 assert.throws(()=>executionCash(999n,1n,0n,0n),/provenance/);
});

test('installed NAV callbacks and injected token reverts remain distinct for book withdrawals',()=>{
 const {s}=borrowed(),caller=addr(2n);s.cashBalances[s.book]=2n;s.premiumCredits[caller]=1n;s.cashCredits[caller]=1n;s.totalPremiumCredits=1n;s.totalCashCredits=1n;
 for(const kind of ['withdrawPremium','withdrawCredit'] as const){
  const before=structuredClone(s),action:Action={kind,caller,to:caller,now:1100n,amount:1n,poolNavCallback:true};
  const after=transition(s,action);assert.equal(after.cashBalances[caller],s.cashBalances[caller]!+1n);assert.equal(after.cashBalances[s.book],1n);
  assert.throws(()=>transition(s,{...action,cashFailure:new SolidityError('CashDebtTransition')}),{name:'CashDebtTransition'});assert.deepEqual(s,before);
 }
 assert.throws(()=>transition(s,{kind:'repay',loanId:1n,caller:addr(1n),now:1100n,amount:1n,poolNavCallback:true}),{name:'CashDebtTransition'});
});

test('future claim headroom rejects before token allowance and preserves source state',()=>{
 const {s,m}=borrowed(),p=s.loans['1']!,B=(1n<<64n)-1n,M=(1n<<128n)-1n,R=B*B;
 p.debt.terms.snapshotMultiplierNumerator=1n;p.debt.terms.snapshotMultiplierDenominator=B;
 p.remainingShares=1n;p.outstandingUnits=(M-1n)*R;
 m.actionHash=word(999n);m.actionN=1n;m.actionD=B;
 const h=MAX_UINT/R-(M-1n),before=structuredClone(s),caller=addr(1n);
 s.stockAllowanceVault[m.config.assetToken]![caller]=0n;const zeroAllowance=structuredClone(s);
 assert.throws(()=>transition(s,{kind:'addCollateral',loanId:1n,now:1001n,caller,amount:h,market:m,stockFailure:new SolidityError('TransfersPaused')}),{name:'UnsupportedShareAmount'});
 assert.deepEqual(s,zeroAllowance);
 s.stockAllowanceVault[m.config.assetToken]![caller]=before.stockAllowanceVault[m.config.assetToken]![caller]!;
 const safe=transition(s,{kind:'addCollateral',loanId:1n,now:1001n,caller,amount:h-1n,market:m});
 assert.equal(safe.loans['1']!.remainingShares,h);assert.equal(safe.loans['1']!.outstandingUnits,p.outstandingUnits);
 assert.deepEqual(s,before);
});
test('monetary snapshot and add reject unsupported component while pure conversion remains wide',()=>{
 const {s,m,request}=fixture(),B=(1n<<64n)-1n;
 m.referenceFact.multiplierDenominator=B+1n;
 assert.throws(()=>transition(s,{kind:'borrow',caller:addr(1n),now:1000n,request,market:m}),{name:'InvalidMultiplier'});
 const f=borrowed();f.m.actionHash=word(999n);f.m.actionN=B+1n;f.m.actionD=1n;
 assert.throws(()=>transition(f.s,{kind:'addCollateral',loanId:1n,caller:addr(1n),now:1001n,amount:1n,market:f.m}),{name:'InvalidMultiplier'});
});
