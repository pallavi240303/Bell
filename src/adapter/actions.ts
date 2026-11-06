import type {Intent} from './wallet.ts';
import {argument} from './wallet.ts';
import {abis} from '../generated/abis.ts';
import {encodeAbiParameters,keccak256,stringToHex,type Address,type Hex} from 'viem';
import {uint} from './transport.ts';
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
