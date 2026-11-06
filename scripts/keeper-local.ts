import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createPublicClient,http,encodeDeployData,encodeFunctionData,keccak256,type Address,type Hex} from 'viem';
import {artifact,contracts} from '../services/keeper/abi.ts';
import {requireAnvil} from '../services/keeper/anvil.ts';
import type {Deployment} from '../services/keeper/types.ts';
export async function localNode(){
  const server=createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port;await new Promise<void>(r=>server.close(()=>r()));
  const child=spawn('anvil',['--quiet','--port',String(port),'--timestamp','1000'],{stdio:'ignore'});
  let spawnError:Error|undefined;child.on('error',e=>{spawnError=e;});
  const rpcUrl=`http://127.0.0.1:${port}`,client=createPublicClient({transport:http(rpcUrl,{retryCount:0}),pollingInterval:10,cacheTime:0});
  const request=(method:string,params:any[]=[])=>client.request({method,params} as any) as Promise<any>;
  try{
    let ready=false;for(let i=0;i<100;i++){if(spawnError)throw spawnError;try{await requireAnvil({mode:'local',chainId:31337,rpcUrl},{request:({method,params})=>request(method,params)});ready=true;break;}catch{await new Promise(r=>setTimeout(r,50));}}
    if(!ready)throw Error('isolated Anvil unavailable');
    // Only after all four gates: unlocked local actors. No private key is read or logged.
    const actors:Address[]=(await request('eth_accounts')).map((x:string)=>x.toLowerCase());
    let timestamp=1000n;
    const time=async(t:bigint)=>{timestamp=t;await request('evm_setNextBlockTimestamp',[Number(t)]);await request('evm_mine');};
    const send=async(from:Address,to:Address|undefined,data:Hex)=>{
      await request('evm_setNextBlockTimestamp',[Number(timestamp)]);
      const hash:Hex=await request('eth_sendTransaction',[{from,...(to?{to}:{}),data,gas:'0xb71b00',value:'0x0'}]);
      const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw Error(`local transaction reverted: ${hash}`);return receipt;
    };
    return {client,request,actors,time,send,stop:async()=>{
      if(child.exitCode!==null||child.signalCode!==null)return;
      await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill('SIGTERM');});
    }};
  }catch(error){child.kill('SIGTERM');throw error;}
}
export async function deployLocal(node:Awaited<ReturnType<typeof localNode>>){
  const addresses:Record<string,Address>={},receipts:any[]=[];const owner=node.actors[0]!;
  const deploy=async(key:string,args:unknown[])=>{const a=artifact(contracts[key]!);const r=await node.send(owner,undefined,encodeDeployData({abi:a.abi,bytecode:a.bytecode.object,args}));addresses[key]=r.contractAddress!.toLowerCase() as Address;receipts.push(r);};
  await deploy('cash',[]);await deploy('stock',[owner]);await deploy('registry',[owner]);await deploy('oracle',[owner]);await deploy('eligibility',[]);
  await deploy('book',[addresses.cash,addresses.eligibility,owner]);await deploy('pool',[addresses.cash,owner]);await deploy('vault',[owner]);await deploy('manager',[addresses.registry,addresses.oracle,addresses.book,addresses.pool,addresses.vault]);await deploy('receiver',[addresses.oracle,owner]);
  for(const [key,method,args]of [['book','initialize',[addresses.manager,addresses.pool]],['pool','initialize',[addresses.manager]],['vault','initialize',[addresses.manager]],['oracle','bindReceiver',[addresses.receiver]]] as const){receipts.push(await node.send(owner,addresses[key]!,encodeFunctionData({abi:artifact(contracts[key]!).abi,functionName:method,args})));}
  const codeHashes:Record<string,Hex>={};for(const [key,address]of Object.entries(addresses))codeHashes[key]=keccak256((await node.client.getCode({address}))!);
  const deployment:Deployment={chainId:'31337',deploymentBlock:'1',addresses,codeHashes};return {deployment,receipts};
}
