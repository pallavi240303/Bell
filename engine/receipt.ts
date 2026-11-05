import { BPS, SHARE_SCALE, MAX_CASH, MAX_SHARES, MAX_PRICE, MAX_TIME, ZERO, ZERO_ADDRESS } from './params.ts';
import { mulDivUp } from './math.ts';
import { debt } from './interest.ts';
import { isAtOrBelowTarget } from './settle.ts';
import { requireOfferStatus, validateReservation } from './offers.ts';
import { quoteHash } from './quote.ts';
import { fail, type Config, type Hex, type Offer, type Quote, type Receipt } from './types.ts';
/** Facts must be supplied from a coherent contract snapshot; this model does not authenticate oracle reports. */
export interface BorrowFacts { caller: Hex; borrowerNonce: bigint; chainId: bigint; manager: Hex; expectedHash: Hex; bindingsMatch: boolean; effectiveAt: bigint; tokenDecimals: bigint; configHash: Hex; halted: boolean; phase: bigint; scheduledClose: bigint; sessionAssetId: Hex; activeSessionId: Hex; sessionConfigHash: Hex; stateConfigHash: Hex; scheduledReportHash: Hex; actionHash: Hex; actionN: bigint; actionD: bigint; eligible: boolean[] }
export function validateBorrow(q: Quote, config: Config, ids: Hex[], hashes: Hex[], offers: Offer[], actualHashes: Hex[], now: bigint, facts: BorrowFacts): Receipt {
  if (q.borrower !== facts.caller) fail('InvalidBorrower');
  if (q.borrowerNonce !== facts.borrowerNonce) fail('InvalidBorrowerNonce');
  if (q.recipient === ZERO_ADDRESS) fail('ZeroAddress');
  if (now > q.expiry) fail('QuoteExpired');
  const identity = quoteHash(facts.chainId, facts.manager, q, ids, hashes);
  if (identity !== facts.expectedHash) fail('QuoteHashMismatch');
  if (!facts.bindingsMatch) fail('ComponentMismatch');
  if (facts.effectiveAt > now) fail('ConfigNotEffective');
  if (config.stockTokenDecimals !== 18n) fail('InvalidDecimals', config.stockTokenDecimals, config.cashTokenDecimals);
  if (facts.tokenDecimals !== 18n) fail('InvalidDecimals', facts.tokenDecimals, config.cashTokenDecimals);
  if (facts.configHash !== q.configHash) fail('ReferenceFactsMismatch');
  if (facts.halted) fail('AssetHalted');
  if (facts.phase !== 1n || now >= facts.scheduledClose || facts.sessionAssetId !== q.assetId || facts.activeSessionId !== q.sessionId) fail('InvalidSession');
  if (facts.sessionConfigHash !== q.configHash || facts.stateConfigHash !== q.configHash || facts.scheduledReportHash !== q.scheduledReportHash || facts.actionHash !== q.corporateActionHash) fail('ReferenceFactsMismatch');
  if (q.snapshotMultiplierNumerator !== (facts.actionHash === ZERO ? 1n : facts.actionN) || q.snapshotMultiplierDenominator !== (facts.actionHash === ZERO ? 1n : facts.actionD)) fail('ReferenceFactsMismatch');
  const receipt = constructReceipt(q, config, ids, hashes, offers, actualHashes, identity, now, facts.scheduledClose);
  const ltv = mulDivUp(q.principal, BPS * SHARE_SCALE, q.collateralShares * q.referencePrice);
  for (const [i, offer] of offers.entries()) validateReservation(offer, true, 1n, q.borrower, receipt.settlementDeadline, q.referencePrice, ltv, now, facts.eligible[i] ?? false);
  return receipt;
}
/** Mirrors _validateBorrow after registry/reference facts, then the stored receipt construction. */
export function constructReceipt(q: Quote, config: Config, ids: Hex[], hashes: Hex[], offers: Offer[], actualHashes: Hex[], identity: Hex, now: bigint, scheduledClose: bigint): Receipt {
  if (q.principal === 0n || q.principal > MAX_CASH) fail('UnsupportedCashAmount');
  if (q.collateralShares === 0n || q.collateralShares > MAX_SHARES) fail('InvalidCollateral');
  if (q.referencePrice === 0n || q.referencePrice > MAX_PRICE) fail('UnsupportedPrice');
  if (!isAtOrBelowTarget(q.principal, q.collateralShares, q.referencePrice, config.originationLtvBps)) fail('BorrowerLtvTooHigh');
  if (ids.length === 0 || ids.length > 8 || ids.length !== hashes.length) fail('InvalidOfferCount');
  if (offers.length !== ids.length || actualHashes.length !== ids.length) throw new TypeError('incomplete offer snapshot');
  let totalShares = 0n, premium = 0n, weighted = 0n, capacity = 0n, deadline = MAX_TIME, previousStrike = 0n;
  for (const [i, o] of offers.entries()) {
    requireOfferStatus(o, 1n); if (actualHashes[i] !== hashes[i]) fail('OfferTermsHashMismatch');
    const t = o.terms;
    if (t.assetId !== q.assetId || t.policyHash !== q.policyHash) fail('OfferIdentityMismatch');
    if (i !== 0 && (t.strike > previousStrike || (t.strike === previousStrike && ids[i]! <= ids[i - 1]!))) fail('InvalidOfferOrder');
    previousStrike = t.strike; totalShares += t.snapshotShares; premium += t.premium; weighted += t.snapshotShares * t.strike; capacity += o.cashCapacity;
    if (t.expiry < deadline) deadline = t.expiry;
  }
  if (totalShares === 0n || totalShares > q.collateralShares) fail('InvalidCollateral');
  if (totalShares !== q.totalOfferShares || premium !== q.totalPremium || weighted / totalShares !== q.weightedStrike) fail('QuoteTotalsMismatch');
  if (deadline <= scheduledClose || deadline < q.minSettlementDeadline || deadline > q.maxSettlementDeadline) fail('InvalidSettlementDeadline');
  const ceiling = debt(q.principal, config.rateNumerator, now, deadline, deadline, config.rateDenominator, 0n);
  if (capacity < ceiling) fail('InsufficientFundedCapacity', capacity, ceiling);
  return { consent: structuredClone(q), config: structuredClone(config), quoteHash: identity, offerIds: [...ids], offerTermsHashes: [...hashes], startTime: now, settlementDeadline: deadline, debtCeiling: ceiling, status: 1n, benchmarkReportHash: ZERO, benchmarkValuePerSnapshotShare: 0n, latestMultiplierNumerator: q.snapshotMultiplierNumerator, latestMultiplierDenominator: q.snapshotMultiplierDenominator };
}
