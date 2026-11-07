/** Operator-only Arc Testnet configuration and CRE reports. Actor funds stay wallet-signed. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {parseEnv,promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {createWalletClient,defineChain,http,encodeFunctionData,decodeFunctionData,decodeAbiParameters,decodeEventLog,keccak256,toHex,zeroHash,type Hex,type Address} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {ARC_TESTNET} from './arc-deploy.ts';
import {clientFor,verifyDeployment} from '../services/keeper/config.ts';
import {artifact,contracts,argsFor} from '../services/keeper/abi.ts';
import {raw,integers} from '../services/keeper/types.ts';
import {GOPRO_ASSET,gproInput,archivedGpro} from '../services/keeper/gpro.ts';
import {bindReport} from '../services/keeper/replay.ts';
import {fixture} from '../cre/bell-market-event/tests/fixtures.ts';
import {configurationHash,reportAbi} from '../cre/bell-market-event/src/core.ts';
import {ARC_SELECTOR,forwarderAbi} from '../services/cre-worker/verify.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),hash=(s:string)=>keccak256(toHex(s)),exec=promisify(execFile);
type Session={id:string;reference:string;open:number;close:number;reopen:number};
type Stage='schedule'|'origination'|'cover'|'close'|'reopen';
export function arcGproConfig(d:any,owner:string,configHash:string,s:Session,stage:Stage,at:number){
 if(d.chainId!=='5042002')throw Error('ARC_ONLY');
 const f=fixture(),kind=stage==='schedule'?1:stage==='close'?2:stage==='reopen'?3:6,stamp=String(at);
 const providers={...f.config.providers,primary:{id:'twelvedata',url:'https://api.twelvedata.com/time_series'},secondary:{id:'yahoo',url:'https://query2.finance.yahoo.com/v8/finance/chart/GPRO'}};
 const bundle={...f.bundle,kind,assetId:GOPRO_ASSET,sessionId:kind===6?zeroHash:s.id,configHash,
 calendar:{...f.bundle.calendar,assetId:GOPRO_ASSET,sessionId:s.id,configHash,observedAt:stamp,status:kind===1?'SCHEDULED':kind===2?'CLOSED':'OPEN',scheduledOpen:String(s.open),scheduledClose:String(s.close),scheduledReopen:String(s.reopen),validUntil:String(at+1800)},
 primary:{...f.bundle.primary,assetId:GOPRO_ASSET,sessionId:s.id,observedAt:stamp,...providers.primary,providerId:providers.primary.id},secondary:{...f.bundle.secondary,assetId:GOPRO_ASSET,sessionId:s.id,observedAt:stamp,...providers.secondary,providerId:providers.secondary.id},corporate:{...f.bundle.corporate,assetId:GOPRO_ASSET,observedAt:stamp}};
 return {...f.config,mode:'replay',chainId:d.chainId,chainName:'arc-testnet',chainSelector:ARC_SELECTOR,oracle:d.addresses.oracle,registry:d.addresses.registry,simulationReceiver:d.addresses.receiver,simulationForwarder:ARC_TESTNET.forwarder.toLowerCase(),liveReceiver:'0x0000000000000000000000000000000000000001',liveForwarder:'0x0000000000000000000000000000000000000002',assetId:GOPRO_ASSET,sessionId:s.id,referenceSessionId:s.reference,workflowOwner:owner,workflowId:hash('gpro-arc-local-cre'),providers,replay:bundle,...(['origination','cover','reopen'].includes(stage)?{dataSource:'gpro-history',historical:{stage}}:{})} as any;
}
export function assertGproReport(c:any,before:any,r:readonly any[]){
 assert.equal(r[0],1);assert.equal(r[1],c.replay.kind);assert.equal(r[2],5042002n);assert.equal(r[3].toLowerCase(),c.oracle.toLowerCase());assert.equal(r[4],GOPRO_ASSET);assert.equal(r[5],c.replay.sessionId);assert.equal(r[6],c.replay.configHash);assert.equal(r[7],BigInt(before.nextNonce));assert.equal(r[8],before.stateHash);
 assert.equal(r[9],BigInt(c.replay.calendar.observedAt));assert.equal(r[11],BigInt(c.replay.calendar.scheduledOpen));assert.equal(r[12],BigInt(c.replay.calendar.scheduledClose));
 if(c.historical)assert.equal(r[13],BigInt(archivedGpro(c.historical.stage).primary!.price!));
}
export async function runArcGpro(command:string,address?:string){
 const env=parseEnv(readFileSync(resolve(root,'.env'),'utf8')),key=env.DEPLOYER_PRIVATE_KEY as Hex;
 if(!key||!/^0x[0-9a-fA-F]{64}$/.test(key))throw Error('DEPLOYER_PRIVATE_KEY required in local .env');
 const account=privateKeyToAccount(key),d=JSON.parse(readFileSync(resolve(root,'deployments/arc-optional-cover.json'),'utf8'));
 const chain=defineChain({id:ARC_TESTNET.chainId,name:'Arc Testnet',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:{default:{http:[ARC_TESTNET.rpc]}}});
 const client=clientFor(ARC_TESTNET.rpc),wallet=createWalletClient({account,chain,transport:http(ARC_TESTNET.rpc,{retryCount:0})});
 await verifyDeployment(client,d);
 const read=async(c:string,method:string,args:any[]=[])=>integers(await client.readContract({address:d.addresses[c],abi:artifact(contracts[c]!).abi,functionName:method,args}));
 assert.equal((await read('registry','owner')).toLowerCase(),account.address.toLowerCase(),'Operator must be the deployed registry owner');
 assert.equal((await read('receiver','forwarder')).toLowerCase(),ARC_TESTNET.forwarder.toLowerCase());
 const directory=resolve(root,'deployments/runs/gpro-arc');mkdirSync(directory,{recursive:true});
 const statePath=join(directory,'state.json'),journalPath=join(directory,'operator-journal.json');
 const state:any=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{chainId:d.chainId,assetId:GOPRO_ASSET,stage:'uninitialized',reports:[]};
 assert.equal(state.chainId,d.chainId);assert.equal(state.assetId,GOPRO_ASSET);
 const journal:any=existsSync(journalPath)?JSON.parse(readFileSync(journalPath,'utf8')):{};
 function save(path:string,value:any){writeFileSync(path+'.pending',JSON.stringify(raw(value),null,2)+'\n',{mode:0o600});renameSync(path+'.pending',path);}
 function publicEvidence(){save(resolve(root,'deployments/gpro-arc-verification.json'),{authority:'ARC TESTNET · CRE LOCAL SIMULATION · MOCK STOCK',chainId:d.chainId,assetId:GOPRO_ASSET,addresses:d.addresses,configHash:state.configHash,stage:state.stage,session:state.session,reports:state.reports,setupTransactions:Object.entries(journal).map(([label,e]:any)=>({label,hash:e.hash,transactionSucceeded:e.confirmed===true})),actorTransactionsVerified:false});}
 async function send(label:string,to:Address,data:Hex){
  let entry=journal[label];if(entry){assert.equal(entry.to,to);assert.equal(entry.dataHash,keccak256(data));}
  else{const gas=await client.estimateGas({account,to,data}),fees=await client.estimateFeesPerGas(),nonce=await client.getTransactionCount({address:account.address,blockTag:'pending'});
   const signed=await wallet.signTransaction(await wallet.prepareTransactionRequest({to,data,nonce,gas:gas+gas/5n,maxFeePerGas:(fees.maxFeePerGas??0n)<20000000000n?20000000000n:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas}));
   entry=journal[label]={to,dataHash:keccak256(data),hash:keccak256(signed),serialized:signed};save(journalPath,journal);
  }
  let receipt;try{receipt=await client.getTransactionReceipt({hash:entry.hash});}catch(e:any){if(e.name!=='TransactionReceiptNotFoundError')throw e;assert.equal(await client.sendRawTransaction({serializedTransaction:entry.serialized}),entry.hash);receipt=await client.waitForTransactionReceipt({hash:entry.hash,timeout:120000,pollingInterval:1500});}
  assert.equal(receipt.status,'success',label);entry.confirmed=true;save(journalPath,journal);console.log(`${label}: ${ARC_TESTNET.explorer}/tx/${entry.hash}`);return receipt;
 }
 const direct=(label:string,c:string,method:string,args:any[])=>send(label,d.addresses[c],encodeFunctionData({abi:artifact(contracts[c]!).abi,functionName:method,args:argsFor(contracts[c]!,method,args)}));
 async function init(){
  const input=gproInput('healthy'),version=await read('registry','latestVersion',[GOPRO_ASSET]);
  const config={assetToken:d.addresses.stock,...input.config};
  if(version===0n){state.effectiveAt??=String(Number((await client.getBlock()).timestamp)+60);save(statePath,state);await direct('register-gpro','registry','scheduleAssetConfig',[GOPRO_ASSET,config,state.effectiveAt]);}
  assert.equal(await read('registry','latestVersion',[GOPRO_ASSET]),1n,'Unexpected GoPro registry version');
  const [actual,effective,identity]=await read('registry','getConfig',[GOPRO_ASSET,1n]);assert.deepEqual(actual,integers(argsFor('AssetRegistry','scheduleAssetConfig',[GOPRO_ASSET,config,String(effective)])[1]));state.configHash=identity;state.effectiveAt=String(effective);save(statePath,state);
  const prior=hash('GPRO-ARC-EXPLICIT-BOOTSTRAP');
  const phase=await read('oracle','sessionPhase',[prior]);
  if(phase!==3n){
   state.bootstrapNow=phase>0n?Number((await read('oracle','sessionFact',[prior])).scheduledClose)+50:(state.bootstrapNow??Number((await client.getBlock()).timestamp));save(statePath,state);
   const now=state.bootstrapNow,base={...input.reports[0],assetId:GOPRO_ASSET,sessionId:prior,scheduledOpen:String(now-100),scheduledClose:String(now-50),validUntil:String(now+1600)};
   for(const kind of [1,2,3]){
    if(Number(await read('oracle','sessionPhase',[prior]))>=kind)continue;
    const before=await read('oracle','assetState',[GOPRO_ASSET]);const fact={...base,kind:String(kind),observedAt:String(now-(kind===1?150:kind===2?50:49)),benchmarkPrice:kind===3?'1480000':'0',primarySourceHash:kind===3?keccak256(toHex(readFileSync(resolve(root,'cre/bell-market-event/fixtures/gpro/twelve-daily.json'),'utf8'))):base.primarySourceHash,secondarySourceHash:kind===3?keccak256(toHex(readFileSync(resolve(root,'cre/bell-market-event/fixtures/gpro/yahoo-daily.json'),'utf8'))):base.secondarySourceHash,multiplierNumerator:kind===3?'1':'0',multiplierDenominator:kind===3?'1':'0'};
    const bound=bindReport(fact,{chainId:d.chainId,oracle:d.addresses.oracle,configHash:identity,nonce:String(before.nextNonce),previousStateHash:before.stateHash});
    const receipt=await send(`bootstrap-${kind}${kind===3?'-dual-source':''}`,ARC_TESTNET.forwarder,encodeFunctionData({abi:forwarderAbi,functionName:'route',args:[keccak256(bound.payload),account.address,d.addresses.receiver,'0x',bound.payload]}));
    assert.ok(receipt.logs.some((l:any)=>{try{return l.address.toLowerCase()===d.addresses.oracle&&decodeEventLog({abi:artifact('SessionOracle').abi,data:l.data,topics:l.topics}).eventName==='MarketEventAccepted';}catch{return false;}}),'Bootstrap must emit canonical oracle acceptance');
   }
  }
  if(state.stage==='uninitialized')state.stage='ready';state.reference??=prior;save(statePath,state);publicEvidence();console.log(`GoPro registered. Existing USDC pool ready for lender wallet supply. Operator stage: ${state.stage}.`);
 }
 async function verifyNative(pending:any,output:string){
  const {config:c,before}=pending,results=output.split('\n').flatMap(line=>{try{return [JSON.parse(line.slice(line.indexOf('{'),line.lastIndexOf('}')+1))];}catch{return [];}}).filter(r=>r.status==='submitted'&&r.workflowConfigHash===configurationHash(c));
  assert.ok(results.length,'CRE submission unconfirmed; pending evidence retained, never automatically rebroadcast');const result=results.at(-1);
  const receipt=await client.getTransactionReceipt({hash:result.txHash}),tx=await client.getTransaction({hash:result.txHash});assert.equal(receipt.status,'success');assert.equal(tx.to?.toLowerCase(),ARC_TESTNET.forwarder.toLowerCase());assert.equal(tx.from.toLowerCase(),account.address.toLowerCase());
  const decoded=decodeFunctionData({abi:forwarderAbi,data:tx.input});assert.equal(decoded.functionName,'report');if(decoded.functionName!=='report')throw Error('FORWARDER_CALL');assert.equal(decoded.args[0].toLowerCase(),d.addresses.receiver);
  const payload=('0x'+decoded.args[1].slice(-21*64)) as Hex,r=decodeAbiParameters(reportAbi,payload);assert.equal(keccak256(payload),result.reportHash);assertGproReport(c,before,r);
  assert.ok(receipt.logs.some((l:any)=>{try{const e:any=decodeEventLog({abi:artifact('SessionOracle').abi,data:l.data,topics:l.topics});return l.address.toLowerCase()===d.addresses.oracle&&e.eventName==='MarketEventAccepted'&&e.args.reportHash===result.reportHash;}catch{return false;}}));
  assert.equal((await client.getBlock({blockNumber:receipt.blockNumber})).hash,receipt.blockHash);
  state.reports.push({stage:pending.stage,authority:c.historical?'Native CRE historical HTTP replay':'Native CRE supplied replay calendar',transactionHash:result.txHash,reportHash:result.reportHash,price:String(r[13]),sessionId:state.session.id});
  state.stage=pending.stage;delete state.pending;save(statePath,state);publicEvidence();console.log(`CRE ${state.stage}: ${ARC_TESTNET.explorer}/tx/${result.txHash}`);
 }
 async function invoke(stage:Stage){
  if(state.pending)throw Error('Pending CRE invocation exists. Use recover to check its saved result; never rebroadcast blindly.');
  const now=Number((await client.getBlock()).timestamp),s=state.session as Session;
  const at=stage==='schedule'?s.open-1:stage==='close'?s.close:stage==='reopen'?s.reopen:now-1;
  const config=arcGproConfig(d,account.address,state.configHash,s,stage,at),before=raw(await read('oracle','assetState',[GOPRO_ASSET]));
  assert.ok(env.TWELVEDATA_API_KEY,'TWELVEDATA_API_KEY required in local .env');
  const envPath=join(directory,'.env');writeFileSync(envPath,`CRE_ETH_PRIVATE_KEY=${key.slice(2)}\nTWELVEDATA_API_KEY=${env.TWELVEDATA_API_KEY}\n`,{mode:0o600});
  writeFileSync(join(directory,'project.yaml'),`replay-settings:\n  rpcs:\n    - chain-name: arc-testnet\n      url: ${ARC_TESTNET.rpc}\n`);
  writeFileSync(join(directory,'workflow.yaml'),`replay-settings:\n  user-workflow:\n    workflow-name: bell-gpro-arc-replay\n  workflow-artifacts:\n    workflow-path: ${resolve(root,'cre/bell-market-event/src/main.ts')}\n    config-path: ./config.json\n    secrets-path: ./secrets.yaml\n`);
  writeFileSync(join(directory,'secrets.yaml'),'secretsNames:\n  TWELVEDATA_API_KEY:\n    - TWELVEDATA_API_KEY\n');save(join(directory,'config.json'),config);
  const log=join(directory,`cre-${state.reports.length}.log`);state.pending={stage,config,before,log};save(statePath,state);
  let output='';try{try{const r=await exec('cre',['workflow','simulate',directory,'--project-root',directory,'--target','replay-settings','--config',join(directory,'config.json'),'--wasm',resolve(root,'cre/bell-market-event/dist/workflow.wasm'),'--limits','default','--non-interactive','--trigger-index','0','--env',envPath,'--public-env','/dev/null','--broadcast'],{cwd:directory,env:{PATH:process.env.PATH??'',HOME:homedir()},timeout:150000,maxBuffer:2*1024*1024});output=r.stdout+'\n'+r.stderr;}catch(e:any){output=String(e.stdout??'')+'\n'+String(e.stderr??'');}
   output=output.split(key.slice(2)).join('[REDACTED]').split(env.TWELVEDATA_API_KEY).join('[REDACTED]').split(encodeURIComponent(env.TWELVEDATA_API_KEY)).join('[REDACTED]');writeFileSync(log,output,{mode:0o600});await verifyNative(state.pending,output);
  }finally{try{unlinkSync(envPath);}catch{}}
 }
 if(command==='init'){await init();return;}
 if(command==='status'){console.log(JSON.stringify(raw({stage:state.stage,session:state.session,pending:!!state.pending,asset:await read('oracle','assetState',[GOPRO_ASSET]),pool:d.addresses.pool}),null,2));return;}
 if(command==='recover'){if(!state.pending)throw Error('No pending CRE report');await verifyNative(state.pending,readFileSync(state.pending.log,'utf8'));return;}
 if(!state.configHash)throw Error('Run init first');
 if(command==='mint'||command==='eligible'){
  if(!address||!/^0x[0-9a-fA-F]{40}$/.test(address)||/^0x0{40}$/i.test(address))throw Error('Supply a public wallet address');const who=address.toLowerCase();
  if(command==='mint'){await direct(`mint-${who}`,'stock','mint',[who,(20n*10n**18n).toString()]);console.log('20 mock shares issued once. Fund testnet USDC separately via faucet.');}
  else{if(!state.session)throw Error('Run originate first');const policy=await read('manager','policyHash',[GOPRO_ASSET,state.session.id,state.configHash,1n,1n]);await direct(`eligible-${state.session.id}-${who}`,'eligibility','setEligible',[GOPRO_ASSET,who,policy,true]);}
  publicEvidence();return;
 }
 if(command==='originate'||command==='verify-reports'){
  if(state.pending)throw Error('Pending CRE report must be recovered before starting a session');
  const now=Number((await client.getBlock()).timestamp);
  if(state.stage==='ready'||state.stage==='reopen'){
   const current=await read('oracle','assetState',[GOPRO_ASSET]);assert.equal(await read('oracle','sessionPhase',[current.activeSessionId]),3n,'Previous GoPro session must be finalized');
   if(BigInt(state.effectiveAt)>BigInt(now))throw Error('Registry configuration not effective yet; wait one minute');
   state.session={id:hash(`GPRO-ARC-SESSION-${current.nextNonce}`),reference:current.activeSessionId,open:now-10,close:now+(command==='verify-reports'?100:590),reopen:now+(command==='verify-reports'?102:592)};save(statePath,state);
   await invoke('schedule');
  }
  if(state.stage==='schedule')await invoke('origination');else if(state.stage!=='origination')throw Error('Session already advanced; use status');
  console.log(`Cover cutoff: ${new Date((state.session.close-60)*1000).toISOString()}; close: ${new Date(state.session.close*1000).toISOString()}; reopen: ${new Date(state.session.reopen*1000).toISOString()}; maximum offer expiry: ${new Date((state.session.close+900)*1000).toISOString()}`);
  if(command==='verify-reports'){
   await invoke('cover');while(Date.now()/1000<state.session.reopen+2){console.log('Waiting for the real Arc session clock…');await new Promise(r=>setTimeout(r,Math.min(30000,(state.session.reopen+2)*1000-Date.now())));}await invoke('close');await invoke('reopen');
  }return;
 }
 if(command==='cover'){if(state.stage!=='origination')throw Error('Origination report required');if(Number((await client.getBlock()).timestamp)>=state.session.close-60)throw Error('Cover cutoff passed');await invoke('cover');return;}
 if(command==='close'){if(!['schedule','origination','cover'].includes(state.stage))throw Error('An open replay session is required');if(Number((await client.getBlock()).timestamp)<state.session.close)throw Error('Wait until the printed close');await invoke('close');return;}
 if(command==='reopen'){if(state.stage!=='close')throw Error('Close report required');if(Number((await client.getBlock()).timestamp)<state.session.reopen)throw Error('Wait until the printed reopen');await invoke('reopen');return;}
 throw Error('Commands: init, status, mint ADDRESS, originate, eligible ADDRESS, cover, close, reopen, recover, verify-reports');
}
if(process.argv[1]===fileURLToPath(import.meta.url))runArcGpro(process.argv[2]??'status',process.argv[3]).catch(e=>{console.error(e instanceof assert.AssertionError?'Arc verification failed; inspect the local public evidence.':String(e.shortMessage??e.message).slice(0,300));process.exitCode=1;});
