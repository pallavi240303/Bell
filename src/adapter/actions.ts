import type {Intent} from './wallet.ts';
import {argument} from './wallet.ts';
import {abis} from '../generated/abis.ts';
import {encodeAbiParameters,encodeFunctionData,parseUnits,keccak256,stringToHex,type Address,type Hex} from 'viem';
import {uint} from './transport.ts';
export function offerTerms(text:string,shares:string,strike:string,premium:string):Record<string,unknown>{
  const terms=JSON.parse(text);
  const units=(value:string,decimals:number)=>{
    if(!new RegExp(`^(0|[1-9][0-9]*)(\\.[0-9]{1,${decimals}})?$`).test(value))throw Error('Exact nonnegative token amount required');
    return parseUnits(value,decimals).toString();
  };
  if(!terms||typeof terms!=='object'||Array.isArray(terms))throw Error('Complete offer terms required');
  const result={...terms,snapshotShares:units(shares,18),strike:units(strike,6),premium:units(premium,6)};
  const fn=abis.book.find(x=>x.type==='function'&&x.name==='postOffer')!;
  const tuple=(fn as Extract<typeof fn,{type:'function'}>).inputs[0]!;
  if(Object.keys(result).some(key=>!tuple.components.some(c=>c.name===key)))throw Error('Unexpected offer term');
  // Validate the entire generated tuple before a cancel transaction can be requested.
  encodeFunctionData({abi:abis.book,functionName:'postOffer',args:[argument(tuple,result) as any]});
  return result;
}
export function hashBundle(chainId:string,manager:Address,quote:unknown,offerIds:Hex[],termsHashes:Hex[]):Hex{
  const fn=abis.manager.find(x=>x.type==='function'&&x.name==='borrowWithCover')!;
  const tuple=(fn as Extract<typeof fn,{type:'function'}>).inputs[0]!;
  const hashArray=(ids:Hex[])=>keccak256(encodeAbiParameters([{type:'bytes32[]'}],[ids]));
  return keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'},{type:'address'},tuple,{type:'bytes32'},{type:'bytes32'}],[keccak256(stringToHex('BELL_COVER_QUOTE_V1')),uint(chainId),manager,argument(tuple,quote),hashArray(offerIds),hashArray(termsHashes)]));
}
export function borrowIntent(quote:unknown,offerIds:string[],termsHashes:string[],expectedQuoteHash:string):Intent{
  if(offerIds.length<1||offerIds.length>8)throw Error('Select one to eight whole lots');
  if(offerIds.length!==termsHashes.length)throw Error('Each lot requires its immutable terms hash');
  if(new Set(offerIds).size!==offerIds.length)throw Error('Duplicate lot');
  return {contract:'manager',method:'borrowWithCover',args:[quote,offerIds,termsHashes,expectedQuoteHash]};
}
export async function editOffer(offer:{status:bigint;terms:{nonce:bigint}},id:string,terms:Record<string,unknown>,send:(intent:Intent)=>Promise<unknown>){
  if(offer.status!==1n)throw Error('Only FREE offers are editable');if(terms.nonce===offer.terms.nonce.toString())throw Error('Use a fresh nonce');
  await send({contract:'book',method:'cancelOffer',args:[id]});
  await send({contract:'book',method:'postOffer',args:[terms]});
}
