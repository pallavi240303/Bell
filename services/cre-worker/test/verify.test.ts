import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {keccak256,toHex,encodeFunctionData,encodeEventTopics,encodeAbiParameters,parseAbiParameters} from 'viem';
import {fixture} from '../../../cre/bell-market-event/tests/fixtures.ts';
import {nativeCLI,checkReceipt,eventAbi,forwarderAbi,learnQuoteResult,validateQuotePayload,parseNativeResult} from '../verify.ts';
import {decide,encodeReport,configurationHash} from '../../../cre/bell-market-event/src/core.ts';

test('native child uses frozen config and private runtime file and removes secrets even on exit failure',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bell-worker-child-'));try{
 const binary=join(dir,'cre'),marker=join(dir,'args.json'),secret='runtime-secret-do-not-log',hash='0x'+'1'.repeat(64);
 await writeFile(binary,`#!/usr/bin/env node\nconst fs=require('fs'),a=process.argv.slice(2);fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify(a));const e=a[a.indexOf('--env')+1];if(process.env.CRE_API_KEY!==${JSON.stringify(secret)})process.exit(3);if((fs.statSync(e).mode&0o777)!==0o600)process.exit(2);console.log('untrusted '+${JSON.stringify(secret)});console.log(JSON.stringify({status:'submitted',reportHash:${JSON.stringify(hash)},workflowConfigHash:${JSON.stringify(configurationHash(fixture().config))}}));`);await chmod(binary,0o700);
 const f:any={config:fixture().config,expected:{reportHash:hash},identity:{rpc:"http://127.0.0.1:1"}};
 assert.deepEqual(await nativeCLI(f,dir,{CRE_API_KEY:secret},{binary,wasm:'/app/workflow.wasm'}),{submitted:true});
 const args=JSON.parse(await readFile(marker,'utf8'));assert.ok(args.includes('--non-interactive'));assert.ok(args.includes('--limits'));assert.ok(!args.includes('--broadcast'));assert.equal(args[args.indexOf('--public-env')+1],'/dev/null');
 assert.ok(!(await readdir(dir)).some(n=>n.startsWith('runtime-')));
 await writeFile(binary,'#!/usr/bin/env node\nprocess.stderr.write("'+secret+'");process.exit(9);');await chmod(binary,0o700);
 await rm(join(dir,'config.json'));await assert.rejects(nativeCLI(f,dir,{CRE_API_KEY:secret},{binary}),/^Error: CLI_EXECUTION_FAILED$/);assert.ok(!(await readdir(dir)).some(n=>n.startsWith('runtime-')));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('CLI zero exit without exact structured expected report is never successful',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bell-worker-child-'));try{const binary=join(dir,'cre');await writeFile(binary,'#!/usr/bin/env node\nconsole.log("success");');await chmod(binary,0o700);assert.deepEqual(await nativeCLI({config:fixture().config,expected:{reportHash:'0x'+'1'.repeat(64)},identity:{rpc:'http://127.0.0.1:1'}} as any,dir,{}, {binary}),{submitted:false});}finally{await rm(dir,{recursive:true,force:true});}
});
test('canonical proof rejects a successful receipt without all exact forwarder, receiver and oracle events',()=>{
 const f=fixture(),frozen:any={config:f.config,expected:{reportHash:keccak256('0x1234'),payload:'0x1234',nonce:'3',previousStateHash:f.state.stateHash,assetId:f.config.assetId,sessionId:f.config.sessionId,kind:3},identity:{oracle:f.config.oracle,receiver:f.config.simulationReceiver,forwarder:f.config.simulationForwarder,transmitter:f.config.workflowOwner}};
 const tx:any={to:f.config.simulationForwarder,from:f.config.workflowOwner,input:encodeFunctionData({abi:forwarderAbi,functionName:'report',args:[f.config.simulationReceiver,'0x1234','0x',[]]})};
 assert.equal(checkReceipt(frozen,{status:'success',logs:[]} as any,tx),false);
 assert.equal(checkReceipt(frozen,{status:'reverted',logs:[]} as any,tx),false);
});
test('canonical proof binds payload, caller, operator nonce and every acceptance event emitter',()=>{
 const f=fixture(),d=decide(f.config,f.bundle,f.state,f.now);assert.equal(d.status,'submit');if(d.status!=='submit')return;
 const payload=encodeReport(d.report),stateHash=keccak256(encodeAbiParameters(parseAbiParameters('bytes32,bytes32'),[d.report.previousStateHash,d.reportHash]));
 const frozen:any={config:f.config,expected:{reportHash:d.reportHash,payload,nonce:'3',previousStateHash:f.state.stateHash,assetId:f.config.assetId,sessionId:f.config.sessionId,kind:3},identity:{oracle:f.config.oracle,receiver:f.config.simulationReceiver,forwarder:f.config.simulationForwarder,transmitter:f.config.workflowOwner,operatorNonce:0}};
 const logs=[
  {address:f.config.oracle,topics:encodeEventTopics({abi:eventAbi,eventName:'MarketEventAccepted',args:{assetId:f.config.assetId,sessionId:f.config.sessionId,kind:3}}),data:encodeAbiParameters(parseAbiParameters('uint64,bytes32,bytes32'),[3n,d.reportHash,stateHash])},
  {address:f.config.simulationReceiver,topics:encodeEventTopics({abi:eventAbi,eventName:'ReceiverReportAccepted',args:{reportHash:d.reportHash}}),data:encodeAbiParameters(parseAbiParameters('bytes32,bytes10,address,uint8'),[f.config.workflowId,'0x00000000000000000000',f.config.workflowOwner,1])},
  {address:f.config.simulationForwarder,topics:encodeEventTopics({abi:eventAbi,eventName:'ReportProcessed',args:{receiver:f.config.simulationReceiver,workflowExecutionId:f.config.workflowId,reportId:'0x0000'}}),data:encodeAbiParameters(parseAbiParameters('bool'),[true])},
 ];
 const tx:any={to:f.config.simulationForwarder,from:f.config.workflowOwner,nonce:0,value:0n,input:encodeFunctionData({abi:forwarderAbi,functionName:'report',args:[f.config.simulationReceiver,('0x'+'00'.repeat(109)+payload.slice(2)) as any,'0x',[]]})};
 assert.equal(checkReceipt(frozen,{status:'success',logs},tx),true);
 for(let i=0;i<3;i++)assert.equal(checkReceipt(frozen,{status:'success',logs:logs.filter((_,j)=>j!==i)},tx),false);
 for(const change of [{nonce:1},{from:f.config.oracle},{to:f.config.oracle},{value:1n}])assert.equal(checkReceipt(frozen,{status:'success',logs},{...tx,...change}),false);
 for(let i=0;i<3;i++)assert.equal(checkReceipt(frozen,{status:'success',logs:logs.map((l,j)=>j===i?{...l,address:f.config.registry}:l)},tx),false);
});
test('quote result learning binds native config hash, nonce and both source identities before canonical proof',()=>{
 const f=fixture(),decision=decide(f.config,f.bundle,f.state,f.now);assert.equal(decision.status,'submit');if(decision.status!=='submit')return;
 const config:any={...f.config,replay:f.bundle,dataSource:'quote-snapshot',quote:{symbol:'NVDA',assetId:f.config.assetId,sessionId:f.config.sessionId,secretIds:{finnhub:'FINNHUB_API_KEY',twelvedata:'TWELVEDATA_API_KEY'}}};
 const frozen:any={config,expected:{reportHash:'0x'+'0'.repeat(64),payload:'0x',nonce:'3',previousStateHash:f.state.stateHash,assetId:f.config.assetId,sessionId:f.config.sessionId,kind:3},identity:{},quote:{state:f.state,preparedAt:'1000'}};
 const result={status:'submitted',workflowConfigHash:configurationHash(config),reportHash:decision.reportHash,nonce:'3',previousStateHash:f.state.stateHash,primarySourceHash:decision.report.primarySourceHash,secondarySourceHash:decision.report.secondarySourceHash};
 const learned=learnQuoteResult(frozen,result,1000n);assert.ok(learned);const full={...frozen,...learned};assert.equal(validateQuotePayload(full,encodeReport(decision.report)),true);
 for(const field of ['workflowConfigHash','previousStateHash','primarySourceHash'])assert.equal(learnQuoteResult(frozen,{...result,[field]:'0x'+'0'.repeat(64)},1000n),undefined);
 for(const change of [{nonce:4n},{scheduledClose:901n},{multiplierNumerator:2n},{benchmarkPrice:0n},{chainId:1n},{observedAt:1001n}]){const payload=encodeReport({...decision.report,...change});assert.equal(validateQuotePayload({...full,expected:{...full.expected,reportHash:keccak256(payload)}},payload),false);}
 const first={...result,txHash:'0x'+'a'.repeat(64)},second={...result,txHash:'0x'+'b'.repeat(64)};assert.throws(()=>parseNativeResult(frozen,JSON.stringify(first)+'\n'+JSON.stringify(second),1000n),/CONFLICTING_RESULTS/);assert.throws(()=>parseNativeResult(frozen,JSON.stringify(first)+'\n'+JSON.stringify({...first,reportHash:'0x'+'c'.repeat(64)}),1000n),/CONFLICTING_RESULTS/);
});
test('signal cancellation waits for the native child to exit before returning control',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bell-worker-signal-'));try{const binary=join(dir,'cre'),ready=join(dir,'ready'),exited=join(dir,'exited');await writeFile(binary,`#!/usr/bin/env node\nconst fs=require('fs');process.on('SIGTERM',()=>setTimeout(()=>{fs.writeFileSync(${JSON.stringify(exited)},'yes');process.exit(0)},80));fs.writeFileSync(${JSON.stringify(ready)},'yes');setInterval(()=>{},1000);`);await chmod(binary,0o700);const controller=new AbortController(),promise=nativeCLI({config:fixture().config,expected:{},identity:{rpc:'http://127.0.0.1:1'}} as any,dir,{}, {binary,signal:controller.signal});const rejection=assert.rejects(promise,/CLI_EXECUTION_FAILED/);for(let i=0;i<100;i++){try{await readFile(ready);break;}catch{await delay(10);}}controller.abort();await rejection;assert.equal(await readFile(exited,'utf8'),'yes');}finally{await rm(dir,{recursive:true,force:true});}
});
