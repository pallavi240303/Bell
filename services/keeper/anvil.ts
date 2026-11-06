import {privateKeyToAccount} from 'viem/accounts';
import type {Hex} from 'viem';
export interface LocalOptions {mode:string;chainId:number;rpcUrl:string}
export async function requireAnvil(options:LocalOptions,rpc:{request:(args:any)=>Promise<any>}){
  const url=new URL(options.rpcUrl);
  if(options.mode!=='local'||options.chainId!==31337||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Anvil controls and actor signing require explicit local chain 31337 on loopback');
  const metadata=await rpc.request({method:'anvil_nodeInfo',params:[]});
  if(!metadata||typeof metadata!=='object')throw Error('Anvil capability unavailable');
  const chain=await rpc.request({method:'eth_chainId',params:[]});if(BigInt(chain)!==31337n)throw Error('Anvil chain mismatch');
}
export async function localActors(options:LocalOptions,rpc:{request:(args:any)=>Promise<any>},load:()=>Hex[]){
  await requireAnvil(options,rpc);return load().map(key=>privateKeyToAccount(key));
}
