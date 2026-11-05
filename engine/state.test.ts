import test from 'node:test';
import assert from 'node:assert/strict';
import { ZERO, MAX_TIME } from './params.ts';
import type { Config, Quote, Receipt } from './types.ts';
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
