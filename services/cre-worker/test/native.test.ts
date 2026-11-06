import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {encodeDeployData,encodeFunctionData,keccak256,type Hex,type Address} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {Worker,type Job} from '../worker.ts';
import {prepareReplay,nativeCLI,verifyCanonical} from '../verify.ts';

test('native CRE WASM dispatch is accepted canonically once and restart never redispatches', {skip:process.env.BELL_WORKER_NATIVE_TEST!=='1',timeout:180000},async()=>{
 const [{createLocalFixture,replayInput},{fixture,hash,address},{requireAnvil}]=await Promise.all([import('../../keeper/replay.ts'),import('../../../cre/bell-market-event/tests/fixtures.ts'),import('../../keeper/anvil.ts')]);
 const repo=fileURLToPath(new URL('../../../',import.meta.url)),dir=await mkdtemp(join(tmpdir(),'bell-worker-native-')),jobs=join(dir,'jobs'),data=join(dir,'data');await mkdir(jobs);
 const input=replayInput(),now=Math.floor(Date.now()/1000),close=now+600,open=now+60;
 input.effectiveAt=String(now-900);input.borrow.expiry=String(now+500);input.consent.expiry=String(close-61);input.consent.minSettlementDeadline=input.consent.maxSettlementDeadline=String(close+300);input.offerCommon.expiry=String(close+300);
 for(const report of input.reports){report.scheduledOpen=String(open);report.scheduledClose=String(close);report.validUntil=String(close+900);if(report.role==='schedule')report.observedAt=String(now-1);}
 const mock=JSON.parse(await readFile(join(repo,'cre/bell-market-event/fixtures/cli/MockKeystoneForwarder.json'),'utf8'));const official=JSON.parse(await readFile(new URL('./arc-forwarder.json',import.meta.url),'utf8'));
 let forwarder!:Address;const key=('0x'+'0'.repeat(63)+'2') as Hex,transmitter=privateKeyToAccount(key).address.toLowerCase() as Address;
 const f=await createLocalFixture(input,{setupReportTransport:async node=>{
  await requireAnvil({mode:'local',chainId:31337,rpcUrl:node.client.transport.url!},{request:({method,params})=>node.request(method,params)});
  const receipt=await node.send(node.actors[0]!,undefined,encodeDeployData({abi:mock.abi,bytecode:mock.bytecode.object,args:[]}));forwarder=receipt.contractAddress!.toLowerCase() as Address;
  for(const who of [node.actors[0]!,transmitter])await node.send(node.actors[0]!,forwarder,encodeFunctionData({abi:mock.abi,functionName:'addForwarder',args:[who]}));
  await node.request('anvil_setBalance',[transmitter,'0x3635c9adc5dea00000']);await node.request('anvil_setCode',[forwarder,official.code]);return {forwarder,encode:(receiver,payload)=>encodeFunctionData({abi:mock.abi,functionName:'route',args:[keccak256(payload),node.actors[0],receiver,'0x',payload]})};
 }});
 let w:Worker|undefined;
 try{
  await f.node.time(BigInt(Math.floor(Date.now()/1000)));await f.node.request('anvil_mine',['0x80','0x0']);
  const template=fixture().config,rpc=f.node.client.transport.url!;
  const bundle={kind:1,assetId:f.assetId,sessionId:f.sessionId,configHash:f.configHash,calendar:{providerId:'calendar',url:template.providers.calendar!.url,responseHash:hash('worker-native-calendar'),observedAt:String(now-1),status:'SCHEDULED',scheduledOpen:String(open),scheduledClose:String(close),scheduledReopen:String(close+1),validUntil:String(now+900)}};
  const config:any={...template,mode:'replay',chainName:'anvil-devnet',chainSelector:'7759470850252068959',chainId:'31337',oracle:f.deployment.addresses.oracle,registry:f.deployment.addresses.registry,assetId:f.assetId,sessionId:f.sessionId,referenceSessionId:hash('worker-native-prior'),workflowId:hash('worker-native-workflow'),workflowOwner:f.actors.owner,simulationReceiver:f.deployment.addresses.receiver,simulationForwarder:forwarder,liveReceiver:address(9991),liveForwarder:address(9992),replay:bundle};
  const job:Job={id:'native-schedule',notBefore:String(now-2),expiresAt:String(now+300),config};await writeFile(join(jobs,'one.json'),JSON.stringify(job));
  let binary='cre',wasm=process.env.BELL_TEST_CRE_WASM??resolve(repo,'cre/bell-market-event/dist/workflow.wasm');
  if(process.env.BELL_TEST_CRE_IMAGE){
   const image=process.env.BELL_TEST_CRE_IMAGE;if(!/^[a-zA-Z0-9._/:@-]+$/.test(image))throw Error('INVALID_TEST_IMAGE');
   binary=join(dir,'cre-docker');
   // Only tests can replace the native executable. Runtime main has no such option.
   await writeFile(binary,`#!/usr/bin/env node\nconst {spawn}=require('node:child_process');const child=spawn('docker',['run','--rm','--network','host','--workdir',process.cwd(),'--user',String(process.getuid())+':'+String(process.getgid()),'--mount','type=bind,src='+${JSON.stringify(dir)}+',dst='+${JSON.stringify(dir)},'--env','HOME='+${JSON.stringify(dir)},'--env','TMPDIR='+${JSON.stringify(dir)},'--env','CRE_API_KEY','--entrypoint','cre',${JSON.stringify(image)},...process.argv.slice(2)],{stdio:'inherit'});for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));child.on('exit',(code)=>process.exit(code??1));`);await chmod(binary,0o700);wasm='/app/workflow.wasm';
  }
  let invocations=0;let nativeResult:any;
  const ports={now:()=>BigInt(Math.floor(Date.now()/1000)),prepare:(j:Job)=>prepareReplay(j,f.node.client,rpc,f.deployment as any,transmitter),invoke:async(frozen:any,directory:string,broadcast:boolean)=>{invocations++;try{nativeResult=await nativeCLI(frozen,directory,{CRE_ETH_PRIVATE_KEY:key.slice(2),...(process.env.CRE_API_KEY?{CRE_API_KEY:process.env.CRE_API_KEY}:{})},{binary,wasm,broadcast,workflowPath:process.env.BELL_TEST_CRE_IMAGE?undefined:join(repo,'cre/bell-market-event/src/main.ts')});return nativeResult;}catch(e){nativeResult={error:(e as Error).message};throw e;}},verify:(frozen:any)=>verifyCanonical(frozen,f.node.client)};
  const options={dataDir:data,jobsDir:jobs,mode:'broadcast' as const,pollMs:5000};w=await Worker.open(options,ports);await w.tick();
  assert.equal(nativeResult?.submitted,true,typeof nativeResult?.error==='string'&&/^CLI_[A-Z_]+$/.test(nativeResult.error)?nativeResult.error:'native CLI structured result must match frozen report');
  // Canonical acceptance needs finality, never CLI exit zero.
  await f.node.request('anvil_mine',['0x80','0x0']);assert.equal(await w.reconcile(job.id),true);const state=await w.status();assert.equal(state.jobs[job.id]!.status,'accepted');assert.ok(state.jobs[job.id]!.proof?.transactionHash);assert.equal(invocations,1);
  const proof=state.jobs[job.id]!.proof;await w.close();w=await Worker.open(options,ports);await w.tick();assert.equal(invocations,1);assert.deepEqual((await w.status()).jobs[job.id]!.proof,proof);
  console.log(JSON.stringify({authority:'OWNED ANVIL ONLY; native CLI simulation, no DON',reportHash:state.jobs[job.id]!.frozen!.expected.reportHash,...proof}));
 }finally{await w?.close();await f.stop();await rm(dir,{recursive:true,force:true});}
});
