/** Non-authoritative, deterministic test/preview model. Contracts alone authorize money movement. */
export type Hex = `0x${string}`;
export class SolidityError extends Error {
  constructor(name: string, public readonly args: readonly (bigint | Hex)[] = []) { super(name); this.name = name; }
}
export function fail(name: string, ...args: (bigint | Hex)[]): never { throw new SolidityError(name, args); }
export function uint(value: bigint, bits = 256n): bigint {
  if (typeof value !== 'bigint' || value < 0n || value >= 1n << bits) throw new TypeError(`invalid uint${bits}`);
  return value;
}
export function fixed(value: string, bytes: bigint): Hex {
  if (!/^0x[0-9a-f]*$/.test(value) || BigInt(value.length - 2) !== bytes * 2n) throw new TypeError('invalid fixed hex');
  return value as Hex;
}
export interface Lot { strike: bigint; totalShares: bigint; exercisedShares: bigint }
export interface Fill { additionalShares: bigint; cashCharged: bigint; debtApplied: bigint; borrowerExcess: bigint }
export interface Plan { outcome: bigint; fills: Fill[]; fillCount: bigint; debtAfter: bigint; collateralAfter: bigint; borrowerExcess: bigint }
export interface OfferTerms { assetId: Hex; policyHash: Hex; snapshotShares: bigint; strike: bigint; premium: bigint; maxBorrowerLtvBps: bigint; referencePrice: bigint; maxReferenceDeviationBps: bigint; expiry: bigint; nonce: bigint }
export interface Offer { buyer: Hex; terms: OfferTerms; cashCapacity: bigint; cumulativeExercisedShares: bigint; cumulativeCashCharged: bigint; receiptId: bigint; status: bigint }
export interface Quote { borrower: Hex; recipient: Hex; borrowerNonce: bigint; expiry: bigint; assetId: Hex; sessionId: Hex; configVersion: bigint; configHash: Hex; policyHash: Hex; principal: bigint; collateralShares: bigint; referencePrice: bigint; scheduledReportHash: Hex; corporateActionHash: Hex; snapshotMultiplierNumerator: bigint; snapshotMultiplierDenominator: bigint; totalPremium: bigint; totalOfferShares: bigint; weightedStrike: bigint; minSettlementDeadline: bigint; maxSettlementDeadline: bigint }
export interface Config { assetToken: Hex; stockTokenDecimals: bigint; cashTokenDecimals: bigint; originationLtvBps: bigint; targetLtvBps: bigint; triggerLtvBps: bigint; rateNumerator: bigint; rateDenominator: bigint; maxFills: bigint; maxActiveReceipts: bigint; supportedCorporateActions: bigint }
export interface Receipt { consent: Quote; config: Config; quoteHash: Hex; offerIds: Hex[]; offerTermsHashes: Hex[]; startTime: bigint; settlementDeadline: bigint; debtCeiling: bigint; status: bigint; benchmarkReportHash: Hex; benchmarkValuePerSnapshotShare: bigint; latestMultiplierNumerator: bigint; latestMultiplierDenominator: bigint }
export interface DebtTerms { borrower: Hex; assetId: Hex; assetToken: Hex; originalPrincipal: bigint; rateNumerator: bigint; rateDenominator: bigint; startTime: bigint; settlementDeadline: bigint; snapshotCollateral: bigint; snapshotMultiplierNumerator: bigint; snapshotMultiplierDenominator: bigint }
export interface DebtRecord { terms: DebtTerms; cumulativeDebtReduction: bigint; closed: boolean }
export interface Claim { owner: Hex; receiptId: bigint; snapshotShares: bigint; reportMultiplierNumerator: bigint; reportMultiplierDenominator: bigint; maturesAt: bigint; withdrawn: boolean; deliveryUnits: bigint }
