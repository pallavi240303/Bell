import {spawn} from 'node:child_process';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createPublicClient,http,parseAbi,decodeFunctionData,decodeEventLog,decodeAbiParameters,encodeAbiParameters,parseAbiParameters,keccak256,zeroHash,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {readAbi} from '../../cre/bell-market-event/src/abi.ts';
import {readArcState,observeReplay} from '../../cre/bell-market-event/src/adapters.ts';
import {canonical,configurationHash,decide,encodeReport,reportAbi} from '../../cre/bell-market-event/src/core.ts';
import {bundleSchema} from '../../cre/bell-market-event/src/schema.ts';
import {quoteEndpoints} from '../../cre/bell-market-event/src/quotes.ts';
import type {Job,Frozen,WorkerPorts,Proof} from './worker.ts';

// Resolve only after close: AbortSignal's execFile callback can precede child
// exit, which would release the durable writer lock while a sender still runs.
async function runChild(binary:string,args:string[],cwd:string,env:NodeJS.ProcessEnv,signal?:AbortSignal):Promise<{stdout:string;stderr:string}>{
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(Error('CLI_EXECUTION_FAILED'));return;}
  const child=spawn(binary,args,{cwd,env,stdio:['ignore','pipe','pipe'],shell:false});let stdout='',stderr='',size=0,failed=false,killTimer:NodeJS.Timeout|undefined;
  const stop=()=>{failed=true;child.kill('SIGTERM');killTimer??=setTimeout(()=>child.kill('SIGKILL'),5000);killTimer.unref();};
  const timeout=setTimeout(stop,120000);timeout.unref();
  signal?.addEventListener('abort',stop,{once:true});
  child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>2*1024*1024){stop();return;}stdout+=chunk.toString('utf8');});
  child.stderr.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>2*1024*1024){stop();return;}stderr+=chunk.toString('utf8');});
  child.on('error',()=>{failed=true;});
  child.on('close',code=>{clearTimeout(timeout);if(killTimer)clearTimeout(killTimer);signal?.removeEventListener('abort',stop);if(code!==0||failed)reject(Object.assign(Error('CLI_EXECUTION_FAILED'),{stdout,stderr}));else resolve({stdout,stderr});});
 });
}
export const ARC_RPC='https://rpc.testnet.arc.io',ARC_SELECTOR='3034092155422581607',ARC_FORWARDER='0x6e9ee680ef59ef64aa8c7371279c27e496b5edc1';
// Official Arc simulation forwarder runtime, read-only public chain pin.
export const MOCK_CODE_HASH:Hex='0x49ea1cbbe8b5373ef58e65cfa39a1c0f9832088a2d17b4e6698c242b9e54680f';
export const eventAbi=parseAbi([
 'event ReceiverReportAccepted(bytes32 indexed reportHash, bytes32 workflowId, bytes10 workflowName, address workflowOwner, uint8 mode)',
 'event MarketEventAccepted(bytes32 indexed assetId, bytes32 indexed sessionId, uint8 indexed kind, uint64 nonce, bytes32 reportHash, bytes32 newStateHash)',
 'event ReportProcessed(address indexed receiver, bytes32 indexed workflowExecutionId, bytes2 indexed reportId, bool result)',
]);
export const forwarderAbi=parseAbi(['function report(address receiver, bytes rawReport, bytes signatures, bytes[] signers)','function route(bytes32 transmissionId,address transmitter,address receiver,bytes metadata,bytes validatedReport) returns (bool)']);
const pair=parseAbiParameters('bytes32,bytes32');
const lower=(v:unknown)=>typeof v==='string'?v.toLowerCase():'';
const hash=(v:unknown):v is Hex=>typeof v==='string'&&/^0x[0-9a-f]{64}$/.test(v)&&v!==zeroHash;

export function learnQuoteResult(f:Frozen,result:any,now:bigint):Pick<Frozen,'expected'|'quote'>|undefined{
 if(!f.quote||result.status!=='submitted'||result.workflowConfigHash!==configurationHash(f.config)||result.nonce!==f.expected.nonce||result.previousStateHash!==f.expected.previousStateHash||!hash(result.reportHash)||!hash(result.primarySourceHash)||!hash(result.secondarySourceHash)||result.primarySourceHash===result.secondarySourceHash)return;
 if(result.txHash!==undefined&&!hash(result.txHash))return;
 return {expected:{...f.expected,reportHash:result.reportHash,primarySourceHash:result.primarySourceHash,secondarySourceHash:result.secondarySourceHash},quote:{...f.quote,resultAt:String(now),...(result.txHash?{transactionHash:result.txHash}:{})}};
}
export function parseNativeResult(f:Frozen,text:string,now:bigint):{submitted:boolean;expected?:Frozen['expected'];quote?:Frozen['quote'];transactionHash?:Hex}{
 let submitted=false,learned:ReturnType<typeof learnQuoteResult>,transactionHash:Hex|undefined;
 for(const line of text.split('\n')){
  const start=line.indexOf('{'),end=line.lastIndexOf('}');if(start<0||end<start)continue;
  let result:any;try{result=JSON.parse(line.slice(start,end+1));}catch{continue;}
  if(!result||typeof result!=='object'||Array.isArray(result))continue;
  if(f.quote){const value=learnQuoteResult(f,result,now);if(value){if(learned&&(canonical(learned.expected)!==canonical(value.expected)||learned.quote?.transactionHash!==value.quote?.transactionHash))throw Error('CONFLICTING_RESULTS');learned=value;submitted=true;}}
  else if(result.status==='submitted'&&result.reportHash===f.expected.reportHash&&result.workflowConfigHash===configurationHash(f.config)){
   submitted=true;if(hash(result.txHash)){if(transactionHash&&transactionHash!==result.txHash)throw Error('CONFLICTING_RESULTS');transactionHash=result.txHash;}
  }
 }
 return {submitted,...(learned??{}),...(transactionHash?{transactionHash}:{})};
}
export function validateQuotePayload(f:Frozen,payload:Hex):boolean{
 try{
  if(!f.quote?.resultAt||payload.length!==2+21*64||keccak256(payload)!==f.expected.reportHash)return false;
  const r=decodeAbiParameters(reportAbi,payload),c=f.config,s=f.quote.state,b=bundleSchema.parse(c.replay),e=f.expected,now=BigInt(f.quote.resultAt);
  const corporate=s.corporate,hasAction=s.latestCorporateActionHash!==zeroHash;
  return r[0]===1&&r[1]===e.kind&&r[2]===BigInt(c.chainId)&&r[3].toLowerCase()===c.oracle&&r[4]===c.assetId&&r[5]===e.sessionId&&r[6]===s.registryConfigHash&&r[7]===BigInt(e.nonce)&&r[8]===e.previousStateHash
   &&r[9]<=now&&r[9]>=BigInt(f.quote.preparedAt)-BigInt(c.maxAgeSeconds)&&now-r[9]<=BigInt(c.maxAgeSeconds)&&r[10]===BigInt(b.calendar.validUntil)&&r[10]>=now&&r[10]-r[9]<=BigInt(c.maxValiditySeconds)
   &&r[11]===BigInt(b.calendar.scheduledOpen)&&r[12]===BigInt(b.calendar.scheduledClose)&&r[13]>0n&&r[13]<2n**96n&&r[14]===0&&r[15]===zeroHash
   &&r[16]===(hasAction?BigInt(corporate.multiplierNumerator):1n)&&r[17]===(hasAction?BigInt(corporate.multiplierDenominator):1n)&&r[18]===false&&r[19]===e.primarySourceHash&&r[20]===e.secondarySourceHash
   &&(e.kind===3?r[9]>=BigInt(b.calendar.scheduledReopen)&&r[9]>=BigInt(s.session.closeObservedAt):e.kind===6&&r[9]>=BigInt(s.activeSession!.scheduledOpen)&&r[9]<BigInt(s.activeSession!.scheduledClose)&&r[9]>BigInt(s.latestReference!.observedAt)&&now-r[9]<=1800n);
 }catch{return false;}
}

export function checkReceipt(f:Frozen,receipt:any,tx:any):boolean {
 const {identity:i,expected:e}=f;
 if(receipt.status!=='success'||lower(tx.to)!==i.forwarder||lower(tx.from)!==i.transmitter||(i.operatorNonce!==undefined&&tx.nonce!==i.operatorNonce)||(tx.value!==undefined&&tx.value!==0n))return false;
 try{
  const call=decodeFunctionData({abi:forwarderAbi,data:tx.input});
  if(call.functionName==='report'){
   if(lower(call.args[0])!==i.receiver)return false;
   // Native CRE's fixed report header is 109 bytes; its final 64 bytes are
   // workflow metadata. The exact 21-word payload follows that header.
   const raw=call.args[1];
   const payload=('0x'+raw.slice(-21*64)) as Hex;
   if(raw.length!==2+(109+21*32)*2)return false;
   if(f.quote?!validateQuotePayload(f,payload):payload!==e.payload)return false;
  }else{
   if(lower(call.args[2])!==i.receiver||(f.quote?!validateQuotePayload(f,call.args[4]):call.args[4]!==e.payload))return false;
  }
 }catch{return false;}
 let oracle=false,receiver=false,forwarder=false;
 const stateHash=keccak256(encodeAbiParameters(pair,[e.previousStateHash,e.reportHash]));
 for(const log of receipt.logs){try{
  const event:any=decodeEventLog({abi:eventAbi,data:log.data,topics:log.topics});const a=event.args;
  if(lower(log.address)===i.oracle&&event.eventName==='MarketEventAccepted'&&a.reportHash===e.reportHash&&a.assetId===e.assetId&&a.sessionId===e.sessionId&&Number(a.kind)===e.kind&&String(a.nonce)===e.nonce&&a.newStateHash===stateHash)oracle=true;
  if(lower(log.address)===i.receiver&&event.eventName==='ReceiverReportAccepted'&&a.reportHash===e.reportHash&&Number(a.mode)===1)receiver=true;
  if(lower(log.address)===i.forwarder&&event.eventName==='ReportProcessed'&&lower(a.receiver)===i.receiver&&a.result===true)forwarder=true;
 }catch{/* Ignore unrelated events. */}}
 return oracle&&receiver&&forwarder;
}

export async function verifyCanonical(f:Frozen,client:any):Promise<Proof|undefined>{
 const i=f.identity;
 if(f.quote&&!f.quote.resultAt)return undefined;
 if(String(await client.getChainId())!==i.chainId)throw Error('CHAIN_IDENTITY');
 const source=await client.getBlock({blockNumber:BigInt(i.sourceBlock)});if(source.hash!==i.sourceBlockHash)throw Error('SOURCE_REORG');
 const latest=await client.getBlock({blockTag:'finalized'});
 // Scan bounded windows so public RPC range limits never require trusting CLI output.
 for(let from=BigInt(i.sourceBlock);from<=latest.number;from+=1000n){
  const to=from+999n<latest.number?from+999n:latest.number;
  const logs=await client.getLogs({address:i.oracle,event:eventAbi[1],args:{assetId:f.expected.assetId},fromBlock:from,toBlock:to});
  for(const log of logs){if(log.args?.reportHash!==f.expected.reportHash)continue;
   if(f.quote?.transactionHash&&log.transactionHash!==f.quote.transactionHash)continue;
   const receipt=await client.getTransactionReceipt({hash:log.transactionHash});
   const canonicalBlock=await client.getBlock({blockNumber:receipt.blockNumber});if(receipt.blockHash!==canonicalBlock.hash||receipt.blockNumber>latest.number)continue;
   const tx=await client.getTransaction({hash:log.transactionHash});if(!checkReceipt(f,receipt,tx))continue;
   for(const [address,hash] of Object.entries(i.codeHashes)){const code=await client.getCode({address,blockNumber:receipt.blockNumber});if(!code||keccak256(code)!==hash)throw Error('DEPLOYMENT_CHANGED');}
   // Re-read exact receiver/oracle/forwarder pins at the accepted block.
   const read=async(address:Hex,name:string)=>lower(await client.readContract({address,abi:readAbi,functionName:name,blockNumber:receipt.blockNumber}));
   if(await read(i.oracle,'receiver')!==i.receiver||await read(i.receiver,'oracle')!==i.oracle||await read(i.receiver,'forwarder')!==i.forwarder)throw Error('DEPLOYMENT_CHANGED');
   return {transactionHash:log.transactionHash,blockNumber:String(receipt.blockNumber),blockHash:receipt.blockHash};
  }
 }
 return undefined;
}

export interface Deployment {chainId:string;addresses:{oracle:string;registry:string;receiver:string};codeHashes:Record<string,string>}
export async function prepareReplay(job:Job,client:any,rpc:string,deployment:Deployment,transmitter?:Hex):Promise<Frozen>{
 const c=job.config;
 if(c.mode!=='replay'||c.chainId!==deployment.chainId||c.oracle!==lower(deployment.addresses.oracle)||c.registry!==lower(deployment.addresses.registry)||c.simulationReceiver!==lower(deployment.addresses.receiver))throw Error('DEPLOYMENT_IDENTITY');
 if(String(await client.getChainId())!==c.chainId)throw Error('CHAIN_IDENTITY');
 const block=await client.getBlock({blockTag:'finalized'});if(block.number===null||!block.hash)throw Error('SOURCE_BLOCK');
 const codeHashes:Record<string,Hex>={};
 for(const [key,address] of [['oracle',c.oracle],['registry',c.registry],['receiver',c.simulationReceiver],['forwarder',c.simulationForwarder]] as const){
  const code=await client.getCode({address,blockNumber:block.number});if(!code||code==='0x')throw Error('DEPLOYMENT_CODE');const hash=keccak256(code);
  const expected=key==='forwarder'?MOCK_CODE_HASH:deployment.codeHashes[key];if(hash!==expected)throw Error('DEPLOYMENT_CODE');codeHashes[address]=hash;
 }
 const specs:[Hex,string,readonly unknown[]][]=[[c.simulationReceiver,'oracle',[]],[c.oracle,'assetState',[c.assetId]],[c.oracle,'marketSnapshot',[c.assetId,c.sessionId,c.referenceSessionId]],[c.registry,'getConfig',[c.assetId,BigInt(c.configVersion)]],[c.oracle,'receiver',[]],[c.simulationReceiver,'forwarder',[]]];
 const values=await Promise.all(specs.map(([address,functionName,args])=>client.readContract({address,abi:readAbi,functionName,args,blockNumber:block.number})));
 const state=readArcState(c,c.chainId,(address,name)=>{const index=specs.findIndex(([a,n])=>a===address&&n===name);if(index<0)throw Error('READ_IDENTITY');return values[index];});
 const now=BigInt(Math.floor(Date.now()/1000)),bundle=observeReplay(c.replay);
 const identity={chainId:c.chainId,rpc,sourceBlock:String(block.number),sourceBlockHash:block.hash,oracle:c.oracle,registry:c.registry,receiver:c.simulationReceiver,forwarder:c.simulationForwarder,codeHashes,...(transmitter?{transmitter,operatorNonce:await client.getTransactionCount({address:transmitter,blockTag:'pending'})}:{})};
 if(c.dataSource==='quote-snapshot'){
  if(!c.quote||c.quote.assetId!==c.assetId||c.quote.sessionId!==(bundle.kind===6?bundle.calendar.sessionId:bundle.sessionId)||![3,6].includes(bundle.kind)||bundle.assetId!==c.assetId||bundle.configHash!==state.registryConfigHash)throw Error('QUOTE_BINDING');
  if(c.providers.primary.id!=='finnhub'||c.providers.primary.url!==quoteEndpoints.finnhub||c.providers.secondary.id!=='twelvedata'||c.providers.secondary.url!==quoteEndpoints.twelvedata)throw Error('QUOTE_BINDING');
  // The native frozen workflow validates provider responses. Their hashes are
  // learned only from its bounded structured result, never worker-side fetching.
  return {config:c,identity,expected:{reportHash:zeroHash,payload:'0x',nonce:state.nextNonce,previousStateHash:state.stateHash,assetId:c.assetId,sessionId:bundle.sessionId,kind:bundle.kind,primarySourceHash:zeroHash,secondarySourceHash:zeroHash},quote:{state,preparedAt:String(now)}};
 }
 const d=decide(c,bundle,state,now);if(d.status!=='submit')throw Error('POLICY_REJECTED');const r=d.report;
 return {config:c,expected:{reportHash:d.reportHash,payload:encodeReport(r),nonce:String(r.nonce),previousStateHash:r.previousStateHash,assetId:r.assetId,sessionId:r.sessionId,kind:r.kind,primarySourceHash:r.primarySourceHash,secondarySourceHash:r.secondarySourceHash},identity};
}

export async function nativeCLI(f:Frozen,directory:string,secrets:Record<string,string>,options:{binary?:string;wasm?:string;broadcast?:boolean;signal?:AbortSignal;workflowPath?:string}={}):Promise<{submitted:boolean;expected?:Frozen['expected'];quote?:Frozen['quote'];transactionHash?:Hex}>{
 const envPath=join(directory,'runtime-'+randomUUID()+'.env'),configPath=join(directory,'config.json');
 const config=f.config,wasm=options.wasm??'/app/workflow.wasm';
 if(f.identity.wasmHash&&keccak256('0x'+(await readFile(wasm)).toString('hex') as Hex)!==f.identity.wasmHash)throw Error('WASM_IDENTITY');
 await writeFile(configPath,canonical(config),{mode:0o600,flag:'wx'});
 await writeFile(join(directory,'project.yaml'),`local-settings:\n  rpcs:\n    - chain-name: ${config.chainName}\n      url: ${f.identity.rpc}\n  experimental-chains:\n    - chain-selector: ${config.chainSelector}\n      rpc-url: ${f.identity.rpc}\n      forwarder: ${config.simulationForwarder}\n`,{mode:0o600});
 await writeFile(join(directory,'workflow.yaml'),`local-settings:\n  user-workflow:\n    workflow-name: bell-explicit-worker\n  workflow-artifacts:\n    workflow-path: ${options.workflowPath??'/app/cre/bell-market-event/src/main.ts'}\n    config-path: ./config.json\n    secrets-path: ${config.dataSource==='quote-snapshot'?'./secrets.yaml':'""'}\n`,{mode:0o600});
 if(config.dataSource==='quote-snapshot')await writeFile(join(directory,'secrets.yaml'),'secretsNames:\n  FINNHUB_API_KEY:\n    - FINNHUB_API_KEY\n  TWELVEDATA_API_KEY:\n    - TWELVEDATA_API_KEY\n',{mode:0o600});
 try{
  await writeFile(envPath,Object.entries(secrets).map(([k,v])=>{if(!/^[A-Z_]+$/.test(k)||/[\r\n]/.test(v))throw Error('RUNTIME_SECRET_INVALID');return `${k}=${v}`;}).join('\n')+'\n',{mode:0o600,flag:'wx'});
  const args=['workflow','simulate',directory,'--project-root',directory,'--target','local-settings','--config','config.json','--wasm',wasm,'--limits','default','--non-interactive','--trigger-index','0','--env',envPath,'--public-env','/dev/null',...(options.broadcast?['--broadcast']:[])];
  let stdout:string,stderr:string;
  try{({stdout,stderr}=await runChild(options.binary??'cre',args,directory,{PATH:process.env.PATH??'/usr/local/bin:/usr/bin:/bin',HOME:process.env.HOME??directory,TMPDIR:process.env.TMPDIR??directory,...(secrets.CRE_API_KEY?{CRE_API_KEY:secrets.CRE_API_KEY}:{})},options.signal));}catch{throw Error('CLI_EXECUTION_FAILED');}
  // No raw process/provider output is written to disk or sent to logs.
  return parseNativeResult(f,stdout+'\n'+stderr,BigInt(Math.floor(Date.now()/1000)));
 }finally{await unlink(envPath).catch(()=>{});}
}

export async function runtimePorts(mode:'dry-run'|'broadcast',signal?:AbortSignal):Promise<WorkerPorts>{
 const deployment:Deployment=JSON.parse(await readFile(new URL('../../deployments/arc-optional-cover.json',import.meta.url),'utf8'));
 const client=createPublicClient({transport:http(ARC_RPC,{timeout:15000,retryCount:1})});
 let secrets:Record<string,string>|undefined;
 const loadSecrets=async()=>{
  const values:Record<string,string>={};
  if(process.env.BELL_WORKER_ENV_FILE){const text=await readFile(process.env.BELL_WORKER_ENV_FILE,'utf8');for(const line of text.split(/\r?\n/)){if(!line||line.startsWith('#'))continue;const m=/^(CRE_API_KEY|CRE_ETH_PRIVATE_KEY|FINNHUB_API_KEY|TWELVEDATA_API_KEY)=(.*)$/.exec(line);if(!m)throw Error('RUNTIME_ENV_INVALID');values[m[1]!]=m[2]!;}}
  for(const name of ['CRE_API_KEY','CRE_ETH_PRIVATE_KEY','FINNHUB_API_KEY','TWELVEDATA_API_KEY'])if(process.env[name])values[name]=process.env[name]!;
  return values;
 };
 // Authentication and signing are consumed only at invocation time.
 return {now:()=>BigInt(Math.floor(Date.now()/1000)),prepare:async job=>{
  const c=job.config;if(c.chainName!=='arc-testnet'||c.chainSelector!==ARC_SELECTOR||c.simulationForwarder!==ARC_FORWARDER)throw Error('NETWORK_IDENTITY');
  secrets=await loadSecrets();if(c.dataSource==='quote-snapshot'&&(!secrets.FINNHUB_API_KEY||!secrets.TWELVEDATA_API_KEY))throw Error('QUOTE_CREDENTIALS_REQUIRED');
  let transmitter:Hex|undefined;if(mode==='broadcast'){if(!secrets.CRE_API_KEY||!secrets.CRE_ETH_PRIVATE_KEY)throw Error('BROADCAST_CREDENTIALS_REQUIRED');const key=('0x'+secrets.CRE_ETH_PRIVATE_KEY.replace(/^0x/,'')) as Hex;transmitter=privateKeyToAccount(key).address.toLowerCase() as Hex;}
  const frozen=await prepareReplay(job,client,ARC_RPC,deployment,transmitter);frozen.identity.wasmHash=keccak256(('0x'+(await readFile('/app/workflow.wasm')).toString('hex')) as Hex);return frozen;
 },invoke:(f,dir,broadcast)=>nativeCLI(f,dir,secrets??{},{broadcast,signal}),verify:f=>verifyCanonical(f,client)};
}
