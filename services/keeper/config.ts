import {createPublicClient,http,keccak256} from 'viem';
import {rawUint,exactKeys,requiredComponents,type Deployment,type Header} from './types.ts';
export function clientFor(rpcUrl:string){return createPublicClient({transport:http(rpcUrl),batch:{multicall:false}});}
export function validateDeployment(value:unknown):asserts value is Deployment {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('deployment manifest required');
  const d=value as Deployment;exactKeys(d as unknown as Record<string,unknown>,['chainId','deploymentBlock','addresses','codeHashes']);
  if(rawUint(d.chainId)===0n)throw Error('deployment chain must be positive');rawUint(d.deploymentBlock);
  if(!d.addresses||!d.codeHashes||typeof d.addresses!=='object'||typeof d.codeHashes!=='object'||Array.isArray(d.addresses)||Array.isArray(d.codeHashes))throw Error('deployment addresses and code hashes required');
  exactKeys(d.addresses,[...requiredComponents,'eligibility']);exactKeys(d.codeHashes,Object.keys(d.addresses));
  for(const name of requiredComponents)if(!Object.hasOwn(d.addresses,name))throw Error(`deployment component required: ${name}`);
  const seen=new Set<string>();
  for(const [name,address]of Object.entries(d.addresses)){
    if(typeof address!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(address)||/^0x0{40}$/i.test(address))throw Error(`invalid deployment address: ${name}`);
    if(seen.has(address.toLowerCase()))throw Error('duplicate deployment address');seen.add(address.toLowerCase());
    if(typeof d.codeHashes[name]!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(d.codeHashes[name]!))throw Error(`deployment code hash required: ${name}`);
  }
}
export async function verifyDeployment(client:any,d:Deployment,source?:Header):Promise<Header>{
  validateDeployment(d);
  const chain=await client.getChainId();if(!Number.isSafeInteger(chain)||BigInt(chain)!==rawUint(d.chainId))throw Error('deployment chain mismatch');
  const block=await client.getBlock(source?{blockNumber:source.number}:{blockTag:'latest'});
  if(!block?.hash||source&&block.hash!==source.hash)throw Error('deployment source block replaced');
  if(rawUint(d.deploymentBlock)>block.number)throw Error('deployment block is after source block');
  for(const [name,address]of Object.entries(d.addresses)){
    const code=await client.getCode({address,blockNumber:block.number});if(!code||code==='0x')throw Error(`missing deployment code: ${name}`);
    if(keccak256(code)!==d.codeHashes[name]!.toLowerCase())throw Error(`deployment code mismatch: ${name}`);
  }
  if((await client.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('deployment source block replaced during code reads');
  return {number:block.number,hash:block.hash,timestamp:block.timestamp};
}
