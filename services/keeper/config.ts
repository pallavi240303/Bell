import {createPublicClient,http,keccak256} from 'viem';
import {rawUint,type Deployment} from './types.ts';
export function clientFor(rpcUrl:string){return createPublicClient({transport:http(rpcUrl),batch:{multicall:false}});}
export async function verifyDeployment(client:ReturnType<typeof clientFor>,d:Deployment){
  if(BigInt(await client.getChainId())!==rawUint(d.chainId))throw Error('deployment chain mismatch');
  rawUint(d.deploymentBlock);
  for(const [name,address]of Object.entries(d.addresses)){
    const code=await client.getCode({address});if(!code||code==='0x')throw Error(`missing deployment code: ${name}`);
    if(d.codeHashes?.[name]&&keccak256(code)!==d.codeHashes[name])throw Error(`deployment code mismatch: ${name}`);
  }
}
