import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {createServer as httpServer} from 'node:http';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {encodeFunctionData} from 'viem';
import {localNode,deployLocal} from '../../../scripts/keeper-local.ts';
import {artifact} from '../abi.ts';
import {json} from '../types.ts';

test('real keeper CLI indexes discovery without historical financial reads and serves a pinned complete state',async()=>{
 const node=await localNode();let child:ReturnType<typeof spawn>|undefined;let proxy:ReturnType<typeof httpServer>|undefined;
 try{
  const d=(await deployLocal(node)).deployment;d.deploymentBlock=(await node.client.getBlockNumber()).toString();
  const owner=node.actors[0]!,lender=node.actors[1]!;
  const send=(name:string,address:any,method:string,args:any[])=>node.send(owner,address,encodeFunctionData({abi:artifact(name).abi,functionName:method,args}));
  await send('MockCashToken',d.addresses.cash,'mint',[owner,1000000n]);await send('MockCashToken',d.addresses.cash,'approve',[d.addresses.pool,1000000n]);await send('ProtectedPool',d.addresses.pool,'deposit',[1000000n]);await send('ProtectedPool',d.addresses.pool,'transfer',[lender,1n]);
  for(let i=0;i<6;i++)await node.time(1001n+BigInt(i));
  const head=await node.client.getBlock();const financialBlocks:string[]=[],batchSizes:number[]=[];let snapshotReads=0,rejectHeader=false;const snapshotData=encodeFunctionData({abi:artifact('CoverManager').abi,functionName:'nextReceiptId'});
  proxy=httpServer(async(req,res)=>{let text='';for await(const part of req)text+=String(part);const body=JSON.parse(text);if(Array.isArray(body))batchSizes.push(body.length);for(const rpc of Array.isArray(body)?body:[body])if(rpc.method==='eth_call'){financialBlocks.push(rpc.params[1]);if(rpc.params[0].to===d.addresses.manager&&rpc.params[0].data===snapshotData)snapshotReads++;}const rejected=rejectHeader?(Array.isArray(body)?body:[body]).find((rpc:any)=>rpc.method==='eth_getBlockByNumber'):undefined;if(rejected)rejectHeader=false;const upstream=await fetch(node.client.transport.url!,{method:'POST',headers:{'content-type':'application/json'},body:text});res.setHeader('content-type','application/json');const payload=await upstream.json();if(rejected){const replies=Array.isArray(payload)?payload:[payload];const i=replies.findIndex((reply:any)=>reply.id===rejected.id);replies[i]={jsonrpc:'2.0',id:rejected.id,error:{code:-32602,message:'controlled snapshot read failure'}};}res.end(JSON.stringify(payload));});
  await new Promise<void>(r=>proxy!.listen(0,'127.0.0.1',r));const proxyPort=(proxy.address() as any).port;
  const reservation=createServer();await new Promise<void>(r=>reservation.listen(0,'127.0.0.1',r));const port=(reservation.address() as any).port;await new Promise<void>(r=>reservation.close(()=>r()));
  const cwd=mkdtempSync(join(tmpdir(),'bell-cli-serve-')),manifest=join(cwd,'deployment.json');writeFileSync(manifest,json(d));let errors='';
  child=spawn(process.execPath,['--import',fileURLToPath(import.meta.resolve('tsx')),fileURLToPath(new URL('../cli.ts',import.meta.url)),'serve',manifest],{cwd,env:{PATH:process.env.PATH,RPC_URL:`http://127.0.0.1:${proxyPort}`,PORT:String(port)},stdio:['ignore','ignore','pipe']});child.stderr!.on('data',data=>{errors+=String(data);});
  const base=`http://127.0.0.1:${port}`;let ready=false;for(let i=0;i<400;i++){if(child.exitCode!==null)throw Error(`CLI exited before serving: ${errors}`);try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,25));}assert.ok(ready,'CLI starts');
  const ownerUpper=`0x${owner.slice(2).toUpperCase()}`;rejectHeader=true;const failed=await Promise.all([fetch(`${base}/state?watch=${owner}&watch=${lender}`),fetch(`${base}/state?watch=${lender}&watch=${ownerUpper}&watch=${lender}`)]);assert.ok(failed.every(response=>response.status===400),'shared failure is propagated');assert.equal(rejectHeader,false);assert.equal(snapshotReads,0);
  const [response,duplicate]=await Promise.all([fetch(`${base}/state?watch=${owner}&watch=${lender}`),fetch(`${base}/state?watch=${lender}&watch=${ownerUpper}&watch=${lender}`)]);assert.equal(response.status,200);assert.equal(duplicate.status,200);const actual:any=await response.json();assert.deepEqual(await duplicate.json(),actual,'normalized identical watch sets share one pinned snapshot');assert.equal(snapshotReads,1,'concurrent equivalent snapshots perform financial reads only once');
  assert.equal(actual.block.number,head.number.toString());assert.equal(actual.block.hash,head.hash);assert.equal(actual.block.timestamp,head.timestamp.toString());assert.equal(actual.state.pool.totalAssets,'1000000');assert.equal(actual.state.balances[lender].poolShares,'1');
  assert.deepEqual([...new Set(financialBlocks)],[`0x${head.number.toString(16)}`],'financial reads run once at the final canonical boundary, never per historical block');
  assert.ok(batchSizes.some(size=>size>1),'CLI sends actual JSON-RPC array batches');assert.ok(batchSizes.every(size=>size<=8),'transport bounds every HTTP batch to eight requests');
  const stored=JSON.parse(readFileSync(join(cwd,'services/keeper/runs/index.json'),'utf8'));assert.ok(stored.blocks.length>=7);assert.ok(stored.blocks.every((b:any)=>b.projection.discoveryOnly===true&&!b.projection.state));
  const events:any=await (await fetch(`${base}/events?blockNumber=${actual.block.number}&blockHash=${actual.block.hash}`)).json();assert.equal(events.block.hash,head.hash);assert.ok(events.events.some((l:any)=>l.decoded?.eventName==='Transfer'));
 }finally{
  if(child&&child.exitCode===null&&child.signalCode===null)await new Promise<void>(r=>{child!.once('exit',()=>r());child!.kill('SIGTERM');});
  if(proxy){proxy.closeAllConnections();await new Promise<void>(r=>proxy!.close(()=>r()));}await node.stop();
 }
});
