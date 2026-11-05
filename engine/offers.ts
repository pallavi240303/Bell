import { BPS, ZERO, ZERO_ADDRESS } from './params.ts';
import { cash, price } from './math.ts';
import { cashOwed, cashDelta } from './settle.ts';
import { hashEncoded, TERMS_ABI } from './quote.ts';
import { fail, type Hex, type Offer, type OfferTerms } from './types.ts';
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
  if (borrower === ZERO_ADDRESS) fail('ZeroAddress'); requireOfferStatus(offer, 2n);
  if (cumulative <= offer.cumulativeExercisedShares || cumulative > offer.terms.snapshotShares) fail('InvalidExerciseShares');
  const charged = cashDelta(offer.cumulativeExercisedShares, cumulative, offer.terms.strike);
  if (applied === 0n || applied > charged) fail('InvalidDebtApplied');
  return { offer: { ...offer, cumulativeExercisedShares: cumulative, cumulativeCashCharged: offer.cumulativeCashCharged + charged }, charged, excess: charged - applied };
}
