import test from 'node:test';
import assert from 'node:assert/strict';
import { ZERO } from './params.ts';
import type { Quote } from './types.ts';
export const address = (n: bigint) => `0x${n.toString(16).padStart(40, '0')}` as const;
export const word = (n: bigint) => `0x${n.toString(16).padStart(64, '0')}` as const;
export function fixtureQuote(): Quote { return { borrower: address(1n), recipient: address(2n), borrowerNonce: 3n, expiry: 1000n, assetId: word(4n), sessionId: word(5n), configVersion: 6n, configHash: word(7n), policyHash: word(8n), principal: 900n, collateralShares: 10n ** 19n, referencePrice: 110n, scheduledReportHash: word(12n), corporateActionHash: ZERO, snapshotMultiplierNumerator: 2n, snapshotMultiplierDenominator: 1n, totalPremium: 14n, totalOfferShares: 9n * 10n ** 18n, weightedStrike: 150n, minSettlementDeadline: 900n, loanId: 9n, maxDebtAtAcceptance: 1000n, maxDebtAtDeadline: 1100n, referenceReportHash: word(99n), maxSettlementDeadline: 1100n }; }
test('canonical quote hashing binds every static field, domain, order and lengths', async () => {
  const { quoteHash } = await import('./quote.ts'); const q = fixtureQuote();
  const hash = quoteHash(1n, address(9n), q, [word(1n), word(2n)], [word(3n)]);
  for (const [key, value] of Object.entries(q)) {
    const changed = typeof value === 'bigint' ? value + 1n : `0x${(BigInt(value) + 1n).toString(16).padStart(value.length - 2, '0')}`;
    assert.notEqual(quoteHash(1n, address(9n), { ...q, [key]: changed }, [word(1n), word(2n)], [word(3n)]), hash, key);
  }
  assert.notEqual(quoteHash(2n, address(9n), q, [word(1n), word(2n)], [word(3n)]), hash);
  assert.notEqual(quoteHash(1n, address(10n), q, [word(1n), word(2n)], [word(3n)]), hash);
  assert.notEqual(quoteHash(1n, address(9n), q, [word(2n), word(1n)], [word(3n)]), hash);
  assert.notEqual(quoteHash(1n, address(9n), q, [word(1n)], [word(2n), word(3n)]), hash);
});
test('offer hash, capacity and reserve validation preserve immutable terms', async () => {
  const m = await import('./offers.ts');
  const terms = { assetId: word(1n), policyHash: word(2n), snapshotShares: 10n ** 18n, strike: 3n, premium: 2n, maxBorrowerLtvBps: 6000n, referencePrice: 10n, maxReferenceDeviationBps: 1000n, expiry: 100n, nonce: 1n };
  const offer = m.makeOffer(address(1n), terms, 1n, true, false); assert.equal(offer.cashCapacity, 3n);
  assert.throws(() => m.makeOffer(address(1n), terms, 100n, true, false), { name: 'InvalidOfferTerms' });
  assert.throws(() => m.makeOffer(address(1n), terms, 1n, true, true), { name: 'OfferNonceUsed', args: [address(1n), 1n] });
  m.validateReservation(offer, true, 1n, address(2n), 90n, 11n, 6000n, 1n, true);
  assert.throws(() => m.validateReservation(offer, true, 1n, address(2n), 90n, 12n, 6000n, 1n, true), { name: 'ReferenceDeviationTooHigh' });
});
test('book lifecycle posts, cancels, reserves, cumulatively exercises and releases atomically', async () => {
  const { bookTransition, emptyBook, offerId } = await import('./offers.ts');
  const buyer=address(1n),borrower=address(2n),manager=address(3n),book=address(4n),pool=address(5n);
  const terms={assetId:word(1n),policyHash:word(2n),snapshotShares:10n**18n,strike:100n,premium:2n,maxBorrowerLtvBps:6000n,referencePrice:100n,maxReferenceDeviationBps:0n,expiry:100n,nonce:1n};
  let s=emptyBook(1n,book,manager,pool);s.balances[buyer]=1000n;s.balances[borrower]=1000n;s.allowances[buyer]=1000n;s.allowances[borrower]=1000n;
  const id=offerId(1n,book,buyer,1n),id2=offerId(1n,book,buyer,2n);
  s=bookTransition(s,{kind:'post',caller:buyer,now:1n,terms,eligible:true});
  assert.equal(s.locked,100n);assert.equal(s.allowances[buyer],900n);
  s=bookTransition(s,{kind:'cancel',caller:buyer,now:1n,id});assert.equal(s.cashCredits[buyer],100n);
  const before=structuredClone(s);
  assert.throws(()=>bookTransition(s,{kind:'post',caller:buyer,now:1n,terms,eligible:true}),{name:'OfferNonceUsed',args:[buyer,1n]});assert.deepEqual(s,before);
  s=bookTransition(s,{kind:'post',caller:buyer,now:1n,terms:{...terms,nonce:2n},eligible:true});
  s=bookTransition(s,{kind:'reserve',caller:manager,now:1n,id:id2,termsHash:s.termsHashes[id2],receiptId:1n,payer:borrower,deadline:100n,reference:100n,ltv:5000n,eligible:true});
  assert.equal(s.premiumCredits[buyer],2n);
  s=bookTransition(s,{kind:'exercise',caller:manager,now:1n,id:id2,cumulative:5n*10n**17n,applied:49n,borrower});assert.equal(s.cashCredits[borrower],1n);
  s=bookTransition(s,{kind:'release',caller:manager,now:1n,id:id2});assert.equal(s.locked,0n);assert.equal(s.cashCredits[buyer],150n);
});
