import {createPublicClient,createTransport,http,keccak256,type Transport} from 'viem';
import {rawUint,exactKeys,requiredComponents,type Deployment,type Header} from './types.ts';
import {artifact,contracts} from './abi.ts';
/** FIFO attempt budget sits outside HTTP deadlines; retries must re-enter it. */
function rpcQueue(){
  type Job={cost:number;run:()=>Promise<any>;resolve:(value:any)=>void;reject:(error:unknown)=>void;signal?:AbortSignal;cancelled:boolean;cleanup:()=>void};
  const queue:Job[]=[],sent:number[]=[];let running=false;
  const abortError=()=>new DOMException('The operation was aborted.','AbortError');
  async function drain(){
    try{
      while(queue.length){
        while(queue[0]?.cancelled)queue.shift();if(!queue.length)break;
        const now=Date.now();while(sent.length&&now-sent[0]!>=1000)sent.shift();
        let available=24-sent.length;
        if(available<queue[0]!.cost){await new Promise(r=>setTimeout(r,Math.max(1,sent[0]!+1000-now)));continue;}
        const group:Job[]=[],signal=queue[0]!.signal;
        while(group.length<6&&queue.length&&queue[0]!.signal===signal&&queue[0]!.cost<=available){const job=queue.shift()!;job.cleanup();if(!job.cancelled){group.push(job);available-=job.cost;}}
        const budgetStart=sent.length;sent.push(...group.flatMap(job=>Array<number>(job.cost).fill(Date.now())));
        // Waiting for all inner calls includes response-body completion. Each inner
        // HTTP attempt has its native timeout; no second group overlaps this one.
        await Promise.all(group.map(async job=>{try{job.resolve(await job.run());}catch(error){job.reject(error);}}));
        // Hold cost until one second after the response finishes, so network
        // latency cannot compress server-observed arrivals into a fresh burst.
        const completed=Date.now();for(let i=budgetStart;i<sent.length;i++)sent[i]=completed;
      }
    }finally{running=false;}
  }
  return (run:()=>Promise<any>,method:string,signal?:AbortSignal)=>new Promise<any>((resolve,reject)=>{
    if(signal?.aborted){reject(abortError());return;}
    const cost=['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode'].includes(method)?1:4;
    const job:Job={cost,run,resolve,reject,signal,cancelled:false,cleanup:()=>signal?.removeEventListener('abort',cancel)};
    const cancel=()=>{job.cancelled=true;reject(abortError());};signal?.addEventListener('abort',cancel,{once:true});queue.push(job);
    if(!running){running=true;setTimeout(()=>{void drain();},2);}
  });
}
export function clientFor(rpcUrl:string){
  const transport:Transport=options=>{
    const inner=http(rpcUrl,{batch:{batchSize:8,wait:2},retryCount:0})(options),enqueue=rpcQueue();
    return createTransport({...inner.config,retryCount:options.retryCount??3,request:(args,requestOptions)=>enqueue(()=>inner.request(args,{...requestOptions,retryCount:0}),args.method,requestOptions?.signal)},inner.value);
  };
  return createPublicClient({transport,batch:{multicall:false}});
}
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
  const read=async(c:string,f:string)=>client.readContract({address:d.addresses[c],abi:artifact(contracts[c]!).abi,functionName:f,blockNumber:block.number});
  for(const [c,f,target]of [['manager','loanManager','loanManager'],['loanManager','coverManager','manager'],['book','coverManager','manager'],['book','protectedPool','pool'],['pool','coverManager','loanManager'],['vault','coverManager','loanManager'],['oracle','receiver','receiver'],['receiver','oracle','oracle'],['manager','registry','registry'],['manager','oracle','oracle'],['manager','book','book'],['manager','pool','pool'],['manager','vault','vault'],['loanManager','registry','registry'],['loanManager','oracle','oracle'],['loanManager','pool','pool'],['loanManager','vault','vault'],['pool','cashToken','cash'],['book','cashToken','cash']])if(String(await read(c!,f!)).toLowerCase()!==d.addresses[target!]!.toLowerCase())throw Error(`deployment wiring mismatch: ${c}.${f}`);
  const [profile,opens,cutoff]=await Promise.all([read('manager','profile'),read('manager','coverOpensBeforeClose'),read('manager','coverCutoffBeforeClose')]);
  if(!(BigInt(profile)===0n&&BigInt(opens)===7200n&&BigInt(cutoff)===1800n||BigInt(profile)===1n&&BigInt(opens)===600n&&BigInt(cutoff)===60n))throw Error('deployment immutable profile mismatch');
  if((await client.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('deployment source block replaced during code reads');
  return {number:block.number,hash:block.hash,timestamp:block.timestamp};
}
