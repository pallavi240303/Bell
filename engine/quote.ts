import { encodeAbiParameters, parseAbiParameters, keccak256, stringToHex } from 'viem';
import { fixed, uint, type Hex, type Quote } from './types.ts';
export const QUOTE_ABI = '(address borrower,address recipient,uint256 borrowerNonce,uint64 expiry,bytes32 assetId,bytes32 sessionId,uint64 configVersion,bytes32 configHash,bytes32 policyHash,uint256 principal,uint256 collateralShares,uint256 referencePrice,bytes32 scheduledReportHash,bytes32 corporateActionHash,uint128 snapshotMultiplierNumerator,uint128 snapshotMultiplierDenominator,uint256 totalPremium,uint256 totalOfferShares,uint256 weightedStrike,uint64 minSettlementDeadline,uint64 maxSettlementDeadline)';
export const TERMS_ABI = '(bytes32 assetId,bytes32 policyHash,uint256 snapshotShares,uint256 strike,uint256 premium,uint16 maxBorrowerLtvBps,uint256 referencePrice,uint16 maxReferenceDeviationBps,uint64 expiry,uint256 nonce)';
export function encode(schema: string, values: readonly unknown[]): Hex { return encodeAbiParameters(parseAbiParameters(schema), values); }
export function hashEncoded(schema: string, values: readonly unknown[]): Hex { return keccak256(encode(schema, values)); }
export const QUOTE_DOMAIN = keccak256(stringToHex('BELL_COVER_QUOTE_V1'));
export function quoteHash(chainId: bigint, manager: Hex, quote: Quote, offerIds: readonly Hex[], termsHashes: readonly Hex[]): Hex {
  uint(chainId); fixed(manager, 20n);
  for (const id of [...offerIds, ...termsHashes]) fixed(id, 32n);
  return hashEncoded(`bytes32,uint256,address,${QUOTE_ABI},bytes32,bytes32`, [QUOTE_DOMAIN, chainId, manager, quote, hashEncoded('bytes32[]', [offerIds]), hashEncoded('bytes32[]', [termsHashes])]);
}
