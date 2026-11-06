import { encodeAbiParameters, parseAbiParameters, keccak256, stringToHex, type AbiParameter } from 'viem';
import { fixed, uint, type Hex, type Quote } from './types.ts';
export const QUOTE_ABI = '(address borrower,address recipient,uint256 borrowerNonce,uint64 expiry,bytes32 assetId,bytes32 sessionId,uint64 configVersion,bytes32 configHash,bytes32 policyHash,uint256 principal,uint256 collateralShares,uint256 referencePrice,bytes32 scheduledReportHash,bytes32 corporateActionHash,uint128 snapshotMultiplierNumerator,uint128 snapshotMultiplierDenominator,uint256 totalPremium,uint256 totalOfferShares,uint256 weightedStrike,uint64 minSettlementDeadline,uint64 maxSettlementDeadline,uint256 loanId,uint256 maxDebtAtAcceptance,uint256 maxDebtAtDeadline,bytes32 referenceReportHash)';
export const TERMS_ABI = '(bytes32 assetId,bytes32 policyHash,uint256 snapshotShares,uint256 strike,uint256 premium,uint16 maxBorrowerLtvBps,uint256 referencePrice,uint16 maxReferenceDeviationBps,uint64 expiry,uint256 nonce)';
export function encode(schema: string, values: readonly unknown[]): Hex { return encodeAbiParameters(abiParameters(schema), values); }
export function hashEncoded(schema: string, values: readonly unknown[]): Hex { return keccak256(encode(schema, values)); }
export const QUOTE_DOMAIN = keccak256(stringToHex('BELL_COVER_QUOTE_V2'));
export function quoteHash(chainId: bigint, manager: Hex, quote: Quote, offerIds: readonly Hex[], termsHashes: readonly Hex[]): Hex {
  uint(chainId); fixed(manager, 20n);
  for (const id of [...offerIds, ...termsHashes]) fixed(id, 32n);
  return hashEncoded(`bytes32,uint256,address,${QUOTE_ABI},bytes32,bytes32`, [QUOTE_DOMAIN, chainId, manager, quote, hashEncoded('bytes32[]', [offerIds]), hashEncoded('bytes32[]', [termsHashes])]);
}

export function policyHash(chainId:bigint,manager:Hex,assetId:Hex,sessionId:Hex,configHash:Hex,loanN:bigint,loanD:bigint,profile:bigint,opens:bigint,cutoff:bigint):Hex {
 return hashEncoded('bytes32,uint256,address,bytes32,bytes32,bytes32,uint128,uint128,uint8,uint64,uint64',[keccak256(stringToHex('BELL_SESSION_COVER_POLICY_V1')),chainId,manager,assetId,sessionId,configHash,loanN,loanD,profile,opens,cutoff]);
}

/** Parse our fixed tuple schemas by nesting depth, avoiding abitype's per-character recursion on full snapshots. */
export function abiParameters(schema:string):readonly AbiParameter[] {
 const parts:string[]=[];let depth=0,start=0;
 for(let i=0;i<schema.length;i++){const c=schema[i];if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&depth===0){parts.push(schema.slice(start,i).trim());start=i+1;}if(depth<0)throw new TypeError('invalid ABI tuple');}
 if(depth!==0)throw new TypeError('unbalanced ABI tuple');parts.push(schema.slice(start).trim());
 return parts.map(part=>{
  if(!part.startsWith('('))return parseAbiParameters(part)[0]!;
  let d=0,end=-1;for(let i=0;i<part.length;i++){if(part[i]==='(')d++;if(part[i]===')'&&--d===0){end=i;break;}}
  if(end<0)throw new TypeError('unbalanced ABI tuple');
  const tail=part.slice(end+1).match(/^((?:\[[0-9]*\])*)(?:\s+([A-Za-z_][A-Za-z0-9_]*))?$/);if(!tail)throw new TypeError('invalid ABI tuple suffix');
  return {type:`tuple${tail[1]}`,name:tail[2]??'',components:abiParameters(part.slice(1,end))} as AbiParameter;
 });
}
