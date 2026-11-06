// Owned-Anvil integration only. Uses explicit replay observations, never live prices.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,unlinkSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {encodeDeployData,encodeFunctionData,decodeEventLog,keccak256,toHex,zeroHash,type Address,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {createLocalFixture,replayInput} from '../../../services/keeper/replay.ts';
import {requireAnvil} from '../../../services/keeper/anvil.ts';
import {raw,rawUint} from '../../../services/keeper/types.ts';
import {fixture,hash,address} from '../tests/fixtures.ts';
import {readArcState} from '../src/adapters.ts';
import {readAbi} from '../src/abi.ts';
import {decide,encodeReport} from '../src/core.ts';
import {artifact} from '../../../services/keeper/abi.ts';
const run=promisify(execFile),repo=fileURLToPath(new URL('../../../',import.meta.url));
const sdkName='anvil-devnet',selector='7759470850252068959';
export async function localCLIProof(){
 const directory=mkdtempSync(join(tmpdir(),'bell-cre-local-')),input=replayInput(),base=Math.floor(Date.now()/1000),close=base+600,open=base-950;
 input.effectiveAt=String(base-900);input.borrow.expiry=String(base+500);input.consent.expiry=String(close-61);input.consent.minSettlementDeadline=input.consent.maxSettlementDeadline=String(close+300);input.offerCommon.expiry=String(close+300);
 for(const f of input.reports){f.scheduledOpen=String(open);f.scheduledClose=String(close);f.validUntil=String(close+900);if(f.role==='schedule')f.observedAt=String(base-1000);else if(f.role==='close')f.observedAt=String(close);else if(f.role==='reopen')f.observedAt=String(close+1);}
 input.actions.settleAt=String(close+1);input.actions.terminalAt=String(close+300);
 const mock=JSON.parse(readFileSync(new URL('../fixtures/cli/MockKeystoneForwarder.json',import.meta.url),'utf8'));
 let forwarder:Address,transmitter:Address,key:Hex;
 const f=await createLocalFixture(input,{setupReportTransport:async node=>{
  await requireAnvil({mode:'local',chainId:31337,rpcUrl:node.client.transport.url!},{request:({method,params})=>node.request(method,params)});
  // Public inert test scalar, generated only after owned-local gates. No user key is read.
  key=('0x'+'0'.repeat(63)+'2') as Hex;transmitter=privateKeyToAccount(key).address.toLowerCase() as Address;
  const receipt=await node.send(node.actors[0]!,undefined,encodeDeployData({abi:mock.abi,bytecode:mock.bytecode.object,args:[]}));forwarder=receipt.contractAddress!.toLowerCase() as Address;
  for(const who of [node.actors[0]!,transmitter])await node.send(node.actors[0]!,forwarder,encodeFunctionData({abi:mock.abi,functionName:'addForwarder',args:[who]}));
  await node.request('anvil_setBalance',[transmitter,'0x3635c9adc5dea00000']);
  return {forwarder,encode:(receiver,payload)=>encodeFunctionData({abi:mock.abi,functionName:'route',args:[keccak256(payload),node.actors[0],receiver,'0x',payload]})};
 }});
 const envPath=join(directory,'.env');
 try{
  const rpc=f.node.client.transport.url!;await requireAnvil({mode:'local',chainId:31337,rpcUrl:rpc},{request:({method,params})=>f.node.request(method,params)});
  writeFileSync(envPath,'CRE_ETH_PRIVATE_KEY='+key!.slice(2)+'\n',{mode:0o600});
  writeFileSync(join(directory,'project.yaml'),`local-settings:\n  rpcs:\n    - chain-name: ${sdkName}\n      url: ${rpc}\n  experimental-chains:\n    - chain-selector: ${selector}\n      rpc-url: ${rpc}\n      forwarder: ${forwarder!}\n`);
  writeFileSync(join(directory,'workflow.yaml'),'local-settings:\n  user-workflow:\n    workflow-name: bell-explicit-local-replay\n  workflow-artifacts:\n    workflow-path: '+resolve(repo,'cre/bell-market-event/src/main.ts')+'\n    config-path: ./config.json\n    secrets-path: ""\n');
  const template=fixture().config,config:any={...template,mode:'replay',chainName:sdkName,chainSelector:selector,chainId:'31337',oracle:f.deployment.addresses.oracle,registry:f.deployment.addresses.registry,assetId:f.assetId,sessionId:f.sessionId,referenceSessionId:hash('local-prior-reference'),workflowId:hash('local-cli-workflow'),workflowOwner:f.actors.owner,simulationReceiver:f.deployment.addresses.receiver,simulationForwarder:forwarder!,liveReceiver:address(9991),liveForwarder:address(9992)};
  const cli:any[]=[];
  const observation=(kind:number,observedAt:number)=>{const t=String(observedAt),sessionId=kind===6?zeroHash:f.sessionId;return {kind,assetId:f.assetId,sessionId,configHash:f.configHash,calendar:{providerId:'calendar',url:template.providers.calendar.url,responseHash:hash(`explicit-calendar-${kind}-${t}`),observedAt:t,status:kind===1?'SCHEDULED':'OPEN',scheduledOpen:String(open),scheduledClose:String(close),scheduledReopen:String(close+1),validUntil:String(observedAt+1500),assetId:f.assetId,sessionId:f.sessionId,configHash:f.configHash},primary:{assetId:f.assetId,sessionId:f.sessionId,providerId:'primary',url:template.providers.primary.url,responseHash:hash(`explicit-primary-${kind}-${t}`),observedAt:t,price:'100000000',corroborated:true},secondary:{assetId:f.assetId,sessionId:f.sessionId,providerId:'secondary',url:template.providers.secondary.url,responseHash:hash(`explicit-secondary-${kind}-${t}`),observedAt:t,price:'100000000',corroborated:true},corporate:{assetId:f.assetId,providerId:'corporate',url:template.providers.corporate.url,responseHash:hash(`explicit-corporate-${kind}-${t}`),observedAt:kind===1?String(base):t,action:0,actionId:zeroHash,multiplierNumerator:'1',multiplierDenominator:'1'}};};
  const invoke=async(bundle:any,broadcast:boolean)=>{
   const head=await f.node.client.getBlock();await f.node.time(head.timestamp>BigInt(Math.floor(Date.now()/1000))?head.timestamp:BigInt(Math.floor(Date.now()/1000)));
   const source=await f.node.client.getBlock();
   await f.node.request('anvil_mine',['0x80','0x0']);
   const finalized=await f.node.client.getBlock({blockTag:'finalized'});assert.ok(finalized.number>=source.number,'local finalized head must include setup and previous reports');
   const block=await f.node.client.getBlock(),specs:any[]=[[config.simulationReceiver,'oracle',[]],[config.oracle,'assetState',[f.assetId]],[config.oracle,'marketSnapshot',[f.assetId,config.sessionId,config.referenceSessionId]],[config.registry,'getConfig',[f.assetId,1n]],[config.oracle,'receiver',[]],[config.simulationReceiver,'forwarder',[]]];
   const values=await Promise.all(specs.map(([target,method,args])=>f.node.client.readContract({address:target,abi:readAbi,functionName:method,args,blockNumber:block.number})));
   const state=readArcState(config,'31337',(target,method)=>{const i=specs.findIndex(([t,m])=>t===target&&m===method);assert.ok(i>=0);return values[i];});
   const expected=decide(config,bundle,state,BigInt(Math.floor(Date.now()/1000)));assert.equal(expected.status,'submit');if(expected.status!=='submit')throw Error(expected.reason);
   const before=await f.read('oracle','assetState',[f.assetId]);writeFileSync(join(directory,'config.json'),JSON.stringify({...config,replay:bundle},null,2));
   const args=['workflow','simulate',directory,'--project-root',directory,'--target','local-settings','--config',join(directory,'config.json'),'--wasm',resolve(process.argv[2]??resolve(repo,'cre/bell-market-event/dist/workflow.wasm')),'--limits','default','--non-interactive','--trigger-index','0','--env',envPath,'--public-env','/dev/null',...(broadcast?['--broadcast']:[])];
   let stdout:string,stderr:string;try{({stdout,stderr}=await run('cre',args,{cwd:directory,env:{PATH:process.env.PATH??'',HOME:homedir()},timeout:120000,maxBuffer:2*1024*1024}));}catch(error:any){const safe=String(error.stdout??'')+'\n'+String(error.stderr??'');writeFileSync(join(directory,`cli-${cli.length}-failure.log`),safe.split(key!.slice(2)).join('[REDACTED_TEST_SECRET]'));throw Error('LOCAL_CLI_EXECUTION_FAILED; log directory '+directory);}
   const text=(stdout+'\n'+stderr).split(key!.slice(2)).join('[REDACTED_TEST_SECRET]');const log=join(directory,`cli-${cli.length}-${broadcast?'mined':'dry-run'}.log`);writeFileSync(log,text);assert.ok(text.includes(expected.reportHash),'CLI_REPORT_HASH_MISMATCH; '+log);assert.ok(/"status"\s*:\s*"submitted"/.test(text),'CLI_NOT_SUBMITTED; '+log);
   const after=await f.read('oracle','assetState',[f.assetId]);
   if(!broadcast){assert.deepEqual(after,before);cli.push({kind:bundle.kind,mode:'CLI DRY RUN ONLY',reportHash:expected.reportHash,log,acceptedOnchain:false});return expected;}
   assert.equal(after.nextNonce,before.nextNonce+1n);assert.equal(after.stateHash,keccak256(encodeAbiPair(before.stateHash,expected.reportHash)));
   const latest=await f.node.client.getBlock();const logs=await f.node.client.getLogs({address:config.oracle,fromBlock:block.number+1n,toBlock:latest.number});let accepted:any;
   for(const l of logs)try{const e:any=decodeEventLog({abi:artifact('SessionOracle').abi,data:l.data,topics:l.topics});if(e.eventName==='MarketEventAccepted'&&e.args.reportHash===expected.reportHash)accepted={...e,transactionHash:l.transactionHash};}catch{}
   assert.ok(accepted);assert.equal(accepted.args.assetId,f.assetId);assert.equal(accepted.args.sessionId,bundle.sessionId);assert.equal(BigInt(accepted.args.kind),BigInt(bundle.kind));assert.equal(accepted.args.nonce,before.nextNonce);assert.equal(accepted.args.newStateHash,after.stateHash);
   const receipt=await f.node.client.getTransactionReceipt({hash:accepted.transactionHash}),tx=await f.node.client.getTransaction({hash:accepted.transactionHash});assert.equal(receipt.status,'success');assert.equal(tx.to?.toLowerCase(),forwarder!);assert.equal(tx.from.toLowerCase(),transmitter!);
   let forwarded=false,received=false;for(const l of receipt.logs){try{const e:any=decodeEventLog({abi:mock.abi,data:l.data,topics:l.topics});if(l.address.toLowerCase()===forwarder&&e.eventName==='ReportProcessed'&&e.args.receiver.toLowerCase()===config.simulationReceiver&&e.args.result===true)forwarded=true;}catch{}try{const e:any=decodeEventLog({abi:artifact('SimulationMarketEventReceiver').abi,data:l.data,topics:l.topics});if(l.address.toLowerCase()===config.simulationReceiver&&e.eventName==='ReceiverReportAccepted'&&e.args.reportHash===expected.reportHash)received=true;}catch{}}
   assert.ok(forwarded&&received,'actual forwarder and receiver acceptance events required');
   if(bundle.kind===6){const ref=await f.read('oracle','latestReference',[f.assetId]);assert.equal(ref.reportHash,expected.reportHash);assert.equal(ref.sessionId,f.sessionId);assert.equal(ref.primarySourceHash,bundle.primary.responseHash);assert.equal(ref.secondarySourceHash,bundle.secondary.responseHash);assert.equal(ref.observedAt,BigInt(bundle.primary.observedAt));assert.equal((await f.read('oracle','sessionFact',[f.sessionId])).phase,1n);assert.equal((await f.read('oracle','benchmarkOf',[f.sessionId])).finalized,false);}
   await f.node.time(latest.timestamp);cli.push({kind:bundle.kind,mode:'LOCAL CLI BROADCAST TO OWNED ANVIL ONLY',reportHash:expected.reportHash,transactionHash:accepted.transactionHash,log,acceptedOnchain:true,events:{forwarded,received,oracle:true},payload:encodeReport(expected.report)});return expected;
  };
  await invoke(observation(1,base-1000),true);
  let now=Math.floor(Date.now()/1000);const first=observation(6,now-1);await invoke(first,false);const initial=await invoke(first,true);
  await f.approve(f.actors.lender!,'deposit');await f.action(f.actors.lender!,'pool','deposit',[input.lenderSupply]);await f.approve(f.actors.borrower!,'collateral');await f.approve(f.actors.borrower!,'repay');
  const loanId=await f.borrow();assert.equal((await f.observe()).state.nextReceiptId,1n);assert.equal((await f.observe()).state.loans[loanId.toString()].loan.activeCoverId,0n);
  const beforeRepay=await f.observe();await f.action(f.actors.borrower!,'loanManager','repay',[loanId,input.partialRepay],{kind:'repay',caller:f.actors.borrower!,now:0n,loanId,amount:rawUint(input.partialRepay),market:await f.market()});
  while((now=Math.floor(Date.now()/1000))-1<=Number(first.primary.observedAt))await new Promise(r=>setTimeout(r,200));
  const refreshed=await invoke(observation(6,now-1),true);assert.notEqual(refreshed.reportHash,initial.reportHash);
  const receiptId=await f.attach(loanId,input.scenarios[0].buyers,input.consent.minSettlementDeadline);const covered=await f.observe();assert.equal(covered.state.receipts[receiptId.toString()].receipt.consent.referenceReportHash,refreshed.reportHash);assert.equal(covered.state.loans[loanId.toString()].debtRecord.terms.startTime,beforeRepay.state.loans[loanId.toString()].debtRecord.terms.startTime);
  await f.report(f.role('close'));await f.report(f.role('reopen'));const benchmarked=await f.observe();assert.equal(benchmarked.state.assets[f.assetId].latestReference.reportHash,refreshed.reportHash);assert.notEqual(benchmarked.state.sessions[f.sessionId].benchmark.reportHash,refreshed.reportHash);
  await f.action(f.actors.keeper!,'manager','settle',[receiptId],{kind:'settle',caller:f.actors.keeper!,now:0n,receiptId,market:await f.market(),benchmark:benchmarked.state.receipts[receiptId.toString()].benchmark});
  const proof={authority:'EXPLICIT FIXTURE REPLAY; LOCAL OWNED ANVIL ONLY; NO DON OR LIVE PRICE CLAIM',interactiveConsentVerified:false,chainId:'31337',chainName:sdkName,selector,rpc,forwarder:forwarder!,forwarderCodeHash:keccak256((await f.node.client.getCode({address:forwarder!}))!),deployment:f.deployment,loanId,receiptId,cli,operatorReports:f.reports,transactions:f.transactions,final:await f.observe()};
  writeFileSync(join(directory,'proof.json'),JSON.stringify(raw(proof),null,2)+'\n');return {directory,proof:join(directory,'proof.json'),cli:cli.map(x=>({kind:x.kind,mode:x.mode,reportHash:x.reportHash,transactionHash:x.transactionHash})),parity:true};
 }finally{try{unlinkSync(envPath);}catch{}await f.stop();}
}
import {encodeAbiParameters,parseAbiParameters} from 'viem';
const encodeAbiPair=(a:Hex,b:Hex)=>encodeAbiParameters(parseAbiParameters('bytes32,bytes32'),[a,b]);
if(process.argv[1]===fileURLToPath(import.meta.url))localCLIProof().then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
