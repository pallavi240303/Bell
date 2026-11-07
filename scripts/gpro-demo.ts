// Local historical demo operator. Never signs public or connected-wallet actions.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,unlinkSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {encodeDeployData,encodeFunctionData,decodeFunctionData,decodeAbiParameters,decodeEventLog,keccak256,toHex,zeroHash,type Address,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {createLocalFixture} from '../services/keeper/replay.ts';
import {gproInput,archivedGpro} from '../services/keeper/gpro.ts';
import {fixture} from '../cre/bell-market-event/tests/fixtures.ts';
import {configurationHash,reportAbi} from '../cre/bell-market-event/src/core.ts';
import {artifact} from '../services/keeper/abi.ts';
import {raw} from '../services/keeper/types.ts';
import {forwarderAbi} from '../services/cre-worker/verify.ts';
const exec=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url)),hash=(s:string)=>keccak256(toHex(s));
const zeroAddress='0x0000000000000000000000000000000000000001';
function localSecret(){const line=readFileSync(resolve(root,'.env'),'utf8').split(/\r?\n/).find(l=>l.startsWith('TWELVEDATA_API_KEY='));const v=line?.slice('TWELVEDATA_API_KEY='.length).trim().replace(/^(['"])(.*)\1$/,'$2');if(!v||/[\r\n]/.test(v))throw Error('TWELVEDATA_API_KEY required in local .env');return v;}
export function canRetryAuthentication(output:string,before:{nextNonce:bigint;stateHash:string},after:{nextNonce:bigint;stateHash:string}){
 return /Credential validation failed/.test(output)&&/context deadline exceeded|no such host|i\/o timeout/.test(output)
  && !/Workflow Simulation Result|Workflow execution|"status"/.test(output)
  && before.nextNonce===after.nextNonce&&before.stateHash===after.stateHash;
}
export async function startGproDemo(verify=false){
 const directory=mkdtempSync(join(tmpdir(),'bell-gpro-demo-')),input=gproInput('unhealthy');
 const initial=Math.floor(Date.now()/1000);input.effectiveAt=String(initial-5000);
 const mock=JSON.parse(readFileSync(resolve(root,'cre/bell-market-event/fixtures/cli/MockKeystoneForwarder.json'),'utf8'));
 let forwarder!:Address;const key=('0x'+'0'.repeat(63)+'2') as Hex,transmitter=privateKeyToAccount(key).address.toLowerCase() as Address;
 const secret=localSecret();
 const f=await createLocalFixture(input,{setupReportTransport:async node=>{
  const r=await node.send(node.actors[0]!,undefined,encodeDeployData({abi:mock.abi,bytecode:mock.bytecode.object,args:[]}));forwarder=r.contractAddress!.toLowerCase() as Address;
  for(const a of [node.actors[0]!,transmitter])await node.send(node.actors[0]!,forwarder,encodeFunctionData({abi:mock.abi,functionName:'addForwarder',args:[a]}));
  await node.request('anvil_setBalance',[transmitter,'0x3635c9adc5dea00000']);
  return {forwarder,encode:(receiver,payload)=>encodeFunctionData({abi:mock.abi,functionName:'route',args:[keccak256(payload),node.actors[0],receiver,'0x',payload]})};
 }});
 const envPath=join(directory,'.env'),proof:any[]=[];let web:any;
 const signalStop=()=>{void stop().finally(()=>process.exit(130));};
 const stop=async()=>{process.removeListener('SIGINT',signalStop);process.removeListener('SIGTERM',signalStop);if(web?.server.listening)await new Promise<void>(r=>web.server.close(()=>r()));try{unlinkSync(envPath);}catch{}await f.stop();};
 process.once('SIGINT',signalStop);process.once('SIGTERM',signalStop);
 try{
  const rpc=f.node.client.transport.url!;
  writeFileSync(envPath,`CRE_ETH_PRIVATE_KEY=${key.slice(2)}\nTWELVEDATA_API_KEY=${secret}\n`,{mode:0o600});
  writeFileSync(join(directory,'project.yaml'),`local-settings:\n  rpcs:\n    - chain-name: anvil-devnet\n      url: ${rpc}\n  experimental-chains:\n    - chain-selector: '7759470850252068959'\n      rpc-url: ${rpc}\n      forwarder: ${forwarder}\n`);
  writeFileSync(join(directory,'secrets.yaml'),'secretsNames:\n  TWELVEDATA_API_KEY:\n    - TWELVEDATA_API_KEY\n');
  writeFileSync(join(directory,'workflow.yaml'),`local-settings:\n  user-workflow:\n    workflow-name: bell-gpro-historical-replay\n  workflow-artifacts:\n    workflow-path: ${resolve(root,'cre/bell-market-event/src/main.ts')}\n    config-path: ./config.json\n    secrets-path: ./secrets.yaml\n`);
  writeFileSync(join(directory,'manifest.json'),JSON.stringify(f.deployment,null,2));
  const t=fixture().config,config:any={...t,chainName:'anvil-devnet',chainSelector:'7759470850252068959',chainId:'31337',oracle:f.deployment.addresses.oracle,registry:f.deployment.addresses.registry,assetId:f.assetId,sessionId:f.sessionId,referenceSessionId:hash('GPRO-PRIOR-CONTEXT'),simulationReceiver:f.deployment.addresses.receiver,simulationForwarder:forwarder,liveReceiver:zeroAddress,liveForwarder:'0x0000000000000000000000000000000000000002',workflowOwner:f.actors.owner,workflowId:hash('gpro-local-workflow'),providers:{...t.providers,primary:{id:'twelvedata',url:'https://api.twelvedata.com/time_series'},secondary:{id:'yahoo',url:'https://query2.finance.yahoo.com/v8/finance/chart/GPRO'}}};
  // Prior finalized context is explicit setup, not a native CRE execution claim.
  // Friday's 09:30 opening price (1.48) exists in BOTH archived daily responses.
  const prior={...f.role('schedule'),sessionId:config.referenceSessionId,scheduledOpen:String(initial-3900),scheduledClose:String(initial-3000),observedAt:String(initial-4000),validUntil:String(initial+1800)};
  await f.report(prior);await f.report({...prior,kind:'2',observedAt:String(initial-3000)});
  await f.report({...f.role('reopen'),sessionId:config.referenceSessionId,scheduledOpen:prior.scheduledOpen,scheduledClose:prior.scheduledClose,observedAt:String(initial-2999),validUntil:String(initial+1800),benchmarkPrice:'1480000'});
  let open=0,close=0,reopen=0,stage='lender';
  function observation(kind:number,at:number){const base=fixture().bundle,stamp=String(at);return {...base,kind,assetId:f.assetId,sessionId:kind===6?zeroHash:f.sessionId,configHash:f.configHash,calendar:{...base.calendar,assetId:f.assetId,sessionId:f.sessionId,configHash:f.configHash,observedAt:stamp,status:kind===1?'SCHEDULED':kind===2?'CLOSED':'OPEN',scheduledOpen:String(open),scheduledClose:String(close),scheduledReopen:String(reopen),validUntil:String(at+1500)},primary:{...base.primary,assetId:f.assetId,sessionId:f.sessionId,observedAt:stamp,providerId:'twelvedata',url:config.providers.primary.url},secondary:{...base.secondary,assetId:f.assetId,sessionId:f.sessionId,observedAt:stamp,providerId:'yahoo',url:config.providers.secondary.url},corporate:{...base.corporate,assetId:f.assetId,observedAt:stamp}};}
  async function invoke(kind:number,history?:'origination'|'cover'|'reopen',at=Math.floor(Date.now()/1000)-1){
   const latest=await f.node.client.getBlock();await f.node.time(BigInt(Math.max(Number(latest.timestamp),Math.floor(Date.now()/1000))));await f.node.request('anvil_mine',['0x80','0x0']);
   const before=await f.read('oracle','assetState',[f.assetId]),bundle=observation(kind,at),c={...config,replay:bundle,...(history?{dataSource:'gpro-history',historical:{stage:history}}:{})};
   writeFileSync(join(directory,'config.json'),JSON.stringify(c,null,2));
   const args=['workflow','simulate',directory,'--project-root',directory,'--target','local-settings','--config',join(directory,'config.json'),'--wasm',resolve(root,'cre/bell-market-event/dist/workflow.wasm'),'--limits','default','--non-interactive','--trigger-index','0','--env',envPath,'--public-env','/dev/null','--broadcast'];
   let output='';
   for(let attempt=0;attempt<3;attempt++){
    let text:string;try{const r=await exec('cre',args,{cwd:directory,env:{PATH:process.env.PATH??'',HOME:homedir()},timeout:120000,maxBuffer:2*1024*1024});text=r.stdout+'\n'+r.stderr;}catch(e:any){text=String(e.stdout??'')+'\n'+String(e.stderr??'');}
    output+=text+'\n';
    if(attempt===2||!canRetryAuthentication(text,before,await f.read('oracle','assetState',[f.assetId])))break;
    console.log('CRE authentication service unavailable before execution; retrying with unchanged oracle state.');
   }
   output=output.split(secret).join('[REDACTED]').split(encodeURIComponent(secret)).join('[REDACTED]').split(key.slice(2)).join('[REDACTED]');const log=join(directory,`cre-${proof.length}.log`);writeFileSync(log,output);
   const results=output.split('\n').flatMap(line=>{try{return [JSON.parse(line.slice(line.indexOf('{'),line.lastIndexOf('}')+1))];}catch{return [];}}).filter(r=>r.status==='submitted'&&r.workflowConfigHash===configurationHash(c));
   assert.ok(results.length>0,`CRE did not confirm submission; inspect ${log}`);const result=results.at(-1);assert.equal(result.nonce,before.nextNonce.toString());assert.equal(result.previousStateHash,before.stateHash);assert.ok(/^0x[0-9a-f]{64}$/i.test(result.txHash));
   const receipt=await f.node.client.getTransactionReceipt({hash:result.txHash}),tx=await f.node.client.getTransaction({hash:result.txHash});assert.equal(receipt.status,'success');assert.equal(tx.to?.toLowerCase(),forwarder);assert.equal(tx.from.toLowerCase(),transmitter);
   const decoded=decodeFunctionData({abi:forwarderAbi,data:tx.input});assert.equal(decoded.functionName,'report');if(decoded.functionName!=='report')throw Error('FORWARDER_CALL');assert.equal(decoded.args[0].toLowerCase(),config.simulationReceiver);
   const payload=('0x'+decoded.args[1].slice(-21*64)) as Hex,r=decodeAbiParameters(reportAbi,payload);assert.equal(keccak256(payload),result.reportHash);assert.equal(r[1],kind);assert.equal(r[4],f.assetId);assert.equal(r[6],f.configHash);assert.equal(r[7],before.nextNonce);assert.equal(r[8],before.stateHash);assert.equal(r[2],31337n);assert.equal(r[3].toLowerCase(),config.oracle);assert.equal(r[5],kind===6?zeroHash:f.sessionId);if(history)assert.equal(r[13],BigInt(archivedGpro(history).primary!.price!));
   let accepted=false;for(const l of receipt.logs)try{const e:any=decodeEventLog({abi:artifact('SessionOracle').abi,data:l.data,topics:l.topics});if(l.address.toLowerCase()===config.oracle&&e.eventName==='MarketEventAccepted'&&e.args.reportHash===result.reportHash)accepted=true;}catch{}assert.ok(accepted,'canonical oracle acceptance required');
   const after=await f.read('oracle','assetState',[f.assetId]);assert.equal(after.nextNonce,before.nextNonce+1n);
   await f.node.time((await f.node.client.getBlock()).timestamp);
   proof.push({kind,history,authority:history?'Historical HTTP data through native CRE CLI':'Explicit replay schedule through native CRE CLI',reportHash:result.reportHash,transactionHash:result.txHash,price:r[13].toString(),log});
   writeFileSync(join(directory,'cre-proof.json'),JSON.stringify(proof,null,2));console.log(`CRE ${history??kind}: accepted ${result.txHash}`);
  }
  async function step(next:string){
   if(next==='originate'){
    if(stage!=='lender')throw Error('Origination already started');const now=Math.floor(Date.now()/1000);open=now-1100;close=now+(verify?120:590);reopen=close+2;
    input.borrow.expiry=String(close-61);input.consent.expiry=String(close-61);input.consent.minSettlementDeadline=input.consent.maxSettlementDeadline=String(close+900);input.offerCommon.expiry=String(close+900);
    console.log(`Demo close ${new Date(close*1000).toISOString()}; cutoff ${new Date((close-60)*1000).toISOString()}; reopen ${new Date(reopen*1000).toISOString()}; offer expiry no later than ${new Date((close+900)*1000).toISOString()}`);
    await invoke(1,undefined,now-1200);await invoke(6,'origination');stage='origination';
   }else if(next==='cover'){
    if(stage!=='origination')throw Error('Open both ordinary loans first; then enter cover');await invoke(6,'cover');stage='cover';
   }else if(next==='close'){
    if(stage!=='cover')throw Error('Attach cover first');if(Date.now()/1000<close+1)throw Error(`Wait ${Math.ceil(close+1-Date.now()/1000)} seconds for the real demo close`);await invoke(2,undefined,close);stage='closed';
   }else if(next==='reopen'){
    if(stage!=='closed')throw Error('Close report required');if(Date.now()/1000<reopen+1)throw Error('Wait for the scheduled demo reopen');await invoke(3,'reopen',reopen);stage='reopened';
   }else throw Error('Use originate, cover, close or reopen');
  }
  if(verify){
   const a=f.actors;await f.node.time(BigInt(Math.floor(Date.now()/1000)));await f.approve(a.lender!,'deposit','100000000');await f.action(a.lender!,'pool','deposit',['100000000']);
   const shares=(await f.observe()).state.balances[a.lender!].poolShares;await f.action(a.lender!,'pool','redeem',[shares/10n,a.lender!]);
   await step('originate');await f.approve(a.borrower!,'collateral');const loans=[await f.borrow(a.borrower!,'10000000'),await f.borrow(a.borrower!,'11800000')];await step('cover');
   const receipts=[];for(const [i,loan]of loans.entries())receipts.push(await f.attach(loan,input.scenarios[0].buyers,String(close+900),BigInt(i*10)));
   while(Date.now()/1000<reopen+1){console.log(`Covered loans ready; reopening in ${Math.ceil(reopen+1-Date.now()/1000)}s`);await new Promise(r=>setTimeout(r,Math.min(30000,Math.max(1000,(reopen+1)*1000-Date.now()))));}
   await step('close');await step('reopen');const outcomes=[];
   for(const [i,id]of receipts.entries()){const before=await f.observe();await f.action(a.keeper!,'manager','settle',[id],{kind:'settle',caller:a.keeper!,now:0n,receiptId:id,market:await f.market(),benchmark:before.state.receipts[id.toString()].benchmark});const after=await f.observe(),paid=after.state.balances[f.deployment.addresses.pool!].cash-before.state.balances[f.deployment.addresses.pool!].cash;assert.equal(paid>0n,i===1);outcomes.push({loanId:loans[i],receiptId:id,buyerCash:paid,debt:after.state.loans[loans[i]!.toString()].debt});}
   writeFileSync(join(directory,'proof.json'),JSON.stringify(raw({authority:'Native local CRE simulation + historical external HTTP + real owned Anvil transactions',interactiveConsentVerified:false,cre:proof,outcomes,transactions:f.transactions.map(t=>({label:t.label,hash:t.transactionHash,parity:t.parity})),manifest:f.deployment}),null,2));await stop();return {directory,proof:join(directory,'proof.json')};
  }
  // Existing read/prepare service; signer requests continue to the selected wallet.
  const serverModule='./serve-deployment.mjs';
  const {createDeploymentServer}=await import(serverModule);
  web=createDeploymentServer({deployment:f.deployment,client:f.node.client,indexPath:join(directory,'index.json'),distDir:resolve(root,'dist')});await web.ready;
  await new Promise<void>(r=>web.server.listen(8789,'127.0.0.1',r));
  console.log(`Local BELL: http://127.0.0.1:8789\nWallet RPC: ${rpc} (chain 31337)\nEvidence: ${directory}\nLender first. fund ADDRESS supplies local test assets, never approvals. originate starts the timed market; cover updates the reference after borrowing; close and reopen run CRE. eligible ADDRESS enables a buyer for this session. quit stops this owned node.`);
  const rl=createInterface({input:process.stdin,output:process.stdout});
  for await(const line of rl){const [command,address]=line.trim().split(/\s+/);try{
   if(command==='quit'){rl.close();break;}
   if(command==='fund'||command==='eligible'){
    if(!address||!/^0x[0-9a-fA-F]{40}$/.test(address)||/^0x0{40}$/i.test(address))throw Error('Public address required');const who=address.toLowerCase() as Address;
    await f.node.time(BigInt(Math.max(Number((await f.node.client.getBlock()).timestamp),Math.floor(Date.now()/1000))));
    if(command==='fund'){await f.node.request('anvil_setBalance',[who,'0x3635c9adc5dea00000']);await f.send(f.actors.owner!,'cash','mint',[who,100000000n]);await f.send(f.actors.owner!,'stock','mint',[who,100n*10n**18n]);}
    else{if(stage==='lender')throw Error('Start origination first');const policy=await f.read('manager','policyHash',[f.assetId,f.sessionId,f.configHash,1n,1n]);await f.send(f.actors.owner!,'eligibility','setEligible',[f.assetId,who,policy,true]);}
    console.log(`${command} confirmed for ${who}`);
   }else if(command)await step(command);
  }catch(e:any){console.error(String(e.message).split(secret).join('[REDACTED]'));}}
  await stop();return {directory};
 }catch(e){await stop();throw e;}
}
if(process.argv[1]===fileURLToPath(import.meta.url))startGproDemo(process.argv.includes('--verify')).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
