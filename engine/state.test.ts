import test from 'node:test';
import assert from 'node:assert/strict';
import { ZERO, MAX_TIME } from './params.ts';
import type { Config, Quote, Receipt } from './types.ts';
import { SolidityError } from './types.ts';
import { initialState, transition, type Action } from './state.ts';
const addr = (n: bigint) => `0x${n.toString(16).padStart(40, '0')}` as const;
const word = (n: bigint) => `0x${n.toString(16).padStart(64, '0')}` as const;
export function fixture() {
  const q: Quote = { borrower: addr(1n), recipient: addr(1n), borrowerNonce: 0n, expiry: 99n, assetId: word(1n), sessionId: word(2n), configVersion: 1n, configHash: word(3n), policyHash: word(4n), principal: 499n, collateralShares: 10n ** 19n, referencePrice: 100n, scheduledReportHash: word(5n), corporateActionHash: ZERO, snapshotMultiplierNumerator: 1n, snapshotMultiplierDenominator: 1n, totalPremium: 2n, totalOfferShares: 10n ** 19n, weightedStrike: 100n, minSettlementDeadline: 200n, maxSettlementDeadline: 200n };
  const config: Config = { assetToken: addr(8n), stockTokenDecimals: 18n, cashTokenDecimals: 6n, originationLtvBps: 6000n, targetLtvBps: 6500n, triggerLtvBps: 7500n, rateNumerator: 1n, rateDenominator: MAX_TIME, maxFills: 8n, maxActiveReceipts: 32n, supportedCorporateActions: 6n };
  const receipt: Receipt = { consent: q, config, quoteHash: word(10n), offerIds: [word(9n)], offerTermsHashes: [word(11n)], startTime: 1n, settlementDeadline: 200n, debtCeiling: 500n, status: 1n, benchmarkReportHash: ZERO, benchmarkValuePerSnapshotShare: 0n, latestMultiplierNumerator: 1n, latestMultiplierDenominator: 1n };
  return { q, config, receipt };
}
test('receipt construction validates deadline funding and exact offer order', async () => {
  const { constructReceipt } = await import('./receipt.ts'); const { makeOffer } = await import('./offers.ts');
  const { q, config } = fixture();
  const offer = makeOffer(addr(2n), { assetId: q.assetId, policyHash: q.policyHash, snapshotShares: q.totalOfferShares, strike: q.weightedStrike, premium: q.totalPremium, maxBorrowerLtvBps: 6000n, referencePrice: q.referencePrice, maxReferenceDeviationBps: 0n, expiry: 200n, nonce: 0n }, 1n, true, false);
  const r = constructReceipt(q, config, [word(9n)], [word(11n)], [offer], [word(11n)], word(10n), 1n, 100n);
  assert.equal(r.debtCeiling, 500n); assert.equal(r.startTime, 1n);
  assert.throws(() => constructReceipt(q, config, [], [], [], [], word(10n), 1n, 100n), { name: 'InvalidOfferCount' });
  assert.throws(() => constructReceipt({ ...q, maxSettlementDeadline: 199n }, config, [word(9n)], [word(11n)], [offer], [word(11n)], word(10n), 1n, 100n), { name: 'InvalidSettlementDeadline' });
});

test('validateBorrow accepts coherent facts and preserves borrower/nonce/expiry precedence', async () => {
  const { validateBorrow } = await import('./receipt.ts');
  const { makeOffer } = await import('./offers.ts');
  const { quoteHash } = await import('./quote.ts');
  const { q, config } = fixture();
  const offer = makeOffer(addr(2n), { assetId:q.assetId,policyHash:q.policyHash,snapshotShares:q.totalOfferShares,strike:q.weightedStrike,premium:q.totalPremium,maxBorrowerLtvBps:6000n,referencePrice:q.referencePrice,maxReferenceDeviationBps:0n,expiry:200n,nonce:0n },1n,true,false);
  const ids=[word(9n)],hashes=[word(11n)],manager=addr(9n);
  const facts={caller:q.borrower,borrowerNonce:0n,chainId:1n,manager,expectedHash:quoteHash(1n,manager,q,ids,hashes),bindingsMatch:true,effectiveAt:1n,tokenDecimals:18n,configHash:q.configHash,halted:false,phase:1n,scheduledClose:100n,sessionAssetId:q.assetId,activeSessionId:q.sessionId,sessionConfigHash:q.configHash,stateConfigHash:q.configHash,scheduledReportHash:q.scheduledReportHash,actionHash:ZERO,actionN:1n,actionD:1n,eligible:[true]};
  assert.equal(validateBorrow(q,config,ids,hashes,[offer],hashes,1n,facts).debtCeiling,500n);
  assert.throws(()=>validateBorrow(q,config,ids,hashes,[offer],hashes,100n,{...facts,caller:addr(8n),borrowerNonce:2n}),{name:'InvalidBorrower'});
  assert.throws(()=>validateBorrow(q,config,ids,hashes,[offer],hashes,100n,{...facts,borrowerNonce:2n}),{name:'InvalidBorrowerNonce'});
  assert.throws(()=>validateBorrow(q,config,ids,hashes,[offer],hashes,100n,facts),{name:'QuoteExpired'});
});

function fundedState() {
  const { receipt, q } = fixture();
  const s = initialState(1n, receipt, [], addr(3n), addr(4n), addr(5n));
  s.cashBalances[q.borrower] = 1000n;
  s.stockBalances[q.borrower] = 1000n;
  s.cashAllowanceManager[q.borrower] = 1000n;
  s.stockAllowanceVault[q.borrower] = 10n;
  s.cashDecrementsInfiniteAllowance = true;
  return s;
}

test('finite stock approvals are spent, max approvals preserved, and insufficient approvals revert atomically', () => {
  for (const kind of ['addCollateral', 'topUp'] as const) {
    const s = fundedState(), before = structuredClone(s), caller = s.receipt.consent.borrower;
    const result = transition(s, { kind, now: 2n, caller, amount: 4n });
    assert.equal(result.stockAllowanceVault[caller], 6n);
    assert.throws(() => transition(s, { kind, now: 2n, caller, amount: 11n }), { name: 'ERC20InsufficientAllowance', args: [s.vault, 10n, 11n] });
    assert.throws(() => transition(s, { kind, now: 2n, caller, amount: 11n, stockFailure: new SolidityError('TransfersPaused') }), { name: 'ERC20InsufficientAllowance' });
    assert.deepEqual(s, before);
    s.stockAllowanceVault[caller] = (1n << 256n) - 1n;
    assert.equal(transition(s, { kind, now: 2n, caller, amount: 4n }).stockAllowanceVault[caller], (1n << 256n) - 1n);
  }
});

test('repay follows wrapper, allowance, token failure ordering and exact string errors', () => {
  const s = fundedState(), caller = s.receipt.consent.borrower;
  s.cashAllowanceManager[caller] = 3n;
  const before = structuredClone(s);
  assert.throws(() => transition(s, { kind: 'repay', now: 2n, caller, amount: 4n }), { name: 'Error', args: ['allowance'] });
  assert.throws(() => transition(s, { kind: 'repay', now: 2n, caller: s.pool, amount: 4n, cashFailure: new SolidityError('CashDebtTransition') }), { name: 'InvalidTokenBalanceDelta', args: [4n, 0n] });
  assert.throws(() => transition(s, { kind: 'repay', now: 2n, caller, amount: 3n, cashFailure: new SolidityError('CashDebtTransition') }), { name: 'CashDebtTransition' });
  assert.deepEqual(s, before);
  assert.equal(transition(s, { kind: 'repay', now: 2n, caller, amount: 3n }).cashAllowanceManager[caller], 0n);
});

test('public transition rejects noncanonical ABI domains before touching state', () => {
  const s = fundedState(), before = structuredClone(s);
  const base: Action = { kind: 'topUp', now: 2n, caller: s.receipt.consent.borrower, amount: 1n };
  for (const field of ['now', 'amount', 'claimId'] as const) {
    for (const invalid of [-1n, 1n << 256n, 1, '1']) {
      assert.throws(() => transition(s, { ...base, [field]: invalid } as Action), TypeError);
    }
  }
  for (const field of ['caller', 'to'] as const) {
    for (const invalid of ['0x1', '0x' + 'A'.repeat(40), 1n]) {
      assert.throws(() => transition(s, { ...base, [field]: invalid } as Action), TypeError);
    }
  }
  const b = { finalized: true, assetId: word(1n), sessionId: word(2n), configHash: word(3n), reportHash: word(4n), price: 1n, multiplierNumerator: 1n, multiplierDenominator: 1n };
  for (const field of ['multiplierNumerator', 'multiplierDenominator'] as const) {
    assert.throws(() => transition(s, { ...base, benchmark: { ...b, [field]: 1n << 128n } }), TypeError);
    assert.throws(() => transition(s, { ...base, benchmark: { ...b, [field]: -1n } }), TypeError);
  }
  assert.throws(() => transition(s, { ...base, benchmark: { ...b, price: -1n } }), TypeError);
  assert.throws(() => transition(s, { ...base, benchmark: { ...b, reportHash: '0x12' } }), TypeError);
  assert.deepEqual(s, before);
});
test('claim conversion floors once, permits zero-unit recorded claims and rejects invalid multipliers', async () => {
  const { convertedUnits } = await import('./claims.ts');
  assert.equal(convertedUnits(1n, 1n, 3n, 1n, 2n), 1n);
  assert.equal(convertedUnits(1n << 120n, 1n << 120n, 1n << 120n, 1n << 120n, 1n << 120n), 1n << 120n);
  assert.equal(convertedUnits(1n, 1n, 1n, 1n, 10n), 0n);
  assert.throws(() => convertedUnits(0n, 1n, 1n, 1n, 1n), { name: 'UnsupportedShareAmount' });
  assert.throws(() => convertedUnits(1n, 1n, 1n, 0n, 1n), { name: 'InvalidMultiplier' });
});
test('lifecycle transitions preserve full state on failure and close only after delivery', async () => {
  const { initialState, transition, debtOf } = await import('./state.ts'); const { makeOffer } = await import('./offers.ts');
  const { receipt, q } = fixture(); const offer = makeOffer(addr(2n), { assetId:q.assetId, policyHash:q.policyHash, snapshotShares:q.totalOfferShares, strike:q.weightedStrike,premium:2n,maxBorrowerLtvBps:6000n,referencePrice:100n,maxReferenceDeviationBps:0n,expiry:200n,nonce:0n }, 1n,true,false); offer.status=2n;offer.receiptId=1n;
  const s = initialState(1n, receipt, [offer], addr(3n), addr(4n), addr(5n));
  s.cashBalances[q.borrower]=1000n;s.cashBalances[s.pool]=10000n;s.stockBalances[s.vault]=q.collateralShares;
  s.cashAllowanceManager[q.borrower]=(1n<<256n)-1n;s.cashDecrementsInfiniteAllowance=true;
  const before=structuredClone(s);
  assert.throws(() => transition(s,{kind:'repay',now:2n,caller:q.borrower,amount:0n}),{name:'InvalidDebtApplied'});assert.deepEqual(s,before);
  const paid=transition(s,{kind:'repay',now:2n,caller:q.borrower,amount:debtOf(s,2n)});
  assert.equal(paid.receipt.status,2n);assert.equal(paid.remainingShares,0n);assert.equal(paid.claims.length,1);
  assert.equal(paid.cashAllowanceManager[q.borrower],((1n<<256n)-1n)-500n);
  assert.equal(debtOf(paid,999n),0n);assert.equal(paid.offers[0]!.status,3n);
  assert.throws(()=>transition(paid,{kind:'finalize',now:2n,caller:q.borrower}),{name:'HandoffIncomplete'});
  const delivered=transition(paid,{kind:'withdrawClaim',now:2n,caller:q.borrower,claimId:1n,to:q.borrower});
  const closed=transition(delivered,{kind:'finalize',now:2n,caller:q.borrower}); assert.equal(closed.receipt.status,3n);assert.equal(closed.backing,0n);
  assert.deepEqual(s,before);
});
