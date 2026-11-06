import test from 'node:test';
import assert from 'node:assert/strict';
import * as interest from './interest.ts';
import { quoteHash } from './quote.ts';
const address=(n:bigint)=>`0x${n.toString(16).padStart(40,'0')}` as const;
const word=(n:bigint)=>`0x${n.toString(16).padStart(64,'0')}` as const;
const fixtureQuote=()=>({borrower:address(1n),recipient:address(2n),borrowerNonce:0n,expiry:1000n,assetId:word(1n),sessionId:word(2n),configVersion:1n,configHash:word(3n),policyHash:word(4n),principal:900n,collateralShares:10n**19n,referencePrice:110n,scheduledReportHash:word(5n),corporateActionHash:word(0n),snapshotMultiplierNumerator:1n,snapshotMultiplierDenominator:1n,totalPremium:0n,totalOfferShares:10n**19n,weightedStrike:100n,minSettlementDeadline:1000n,maxSettlementDeadline:1100n});
test('wide debt supports ordinary original-basis accrual beyond uint128',()=>{
  assert.equal(typeof interest.debtWide,'function');
  const p=(1n<<128n)-1n;
  assert.equal(interest.debtWide(p,10000n,0n,2n,1n,p),p*20000n);
});
test('V2 quote binds loan identity, acceptance/deadline ceilings and reference',()=>{
  const q={...fixtureQuote(),loanId:9n,maxDebtAtAcceptance:900n,maxDebtAtDeadline:1000n,referenceReportHash:word(99n)};
  const h=quoteHash(1n,address(9n),q,[],[]);
  for(const key of ['loanId','maxDebtAtAcceptance','maxDebtAtDeadline','referenceReportHash'] as const){
    const v=q[key];const changed=typeof v==='bigint'?v+1n:word(BigInt(v)+1n);
    assert.notEqual(quoteHash(1n,address(9n),{...q,[key]:changed},[],[]),h,key);
  }
});
