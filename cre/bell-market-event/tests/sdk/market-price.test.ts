import assert from 'node:assert/strict';
import { test, newTestRuntime, EvmMock, HttpActionsMock, addContractMock } from '@chainlink/cre-sdk/test';
import { getNetwork, bytesToHex } from '@chainlink/cre-sdk';
import { SDK_PB } from '@chainlink/cre-sdk/pb';
import { toBinary } from '@bufbuild/protobuf';
import { decodeAbiParameters, zeroHash } from 'viem';
import { marketFixture } from '../market-fixtures.ts';
import { hash } from '../fixtures.ts';
import { readAbi } from '../../src/abi.ts';
import { reportAbi } from '../../src/core.ts';
import { runWorkflow } from '../../src/workflow.ts';

for (const variant of ['live','replay','live-quote','replay-quote','source-retry','late-read-failure','oversize','stale','advanced','inconsistent','provider-throws','unknown-write'] as const) test(`MARKET_PRICE real SDK default resources: ${variant}`,()=>{
 const f:any=marketFixture(), live=!['replay','replay-quote'].includes(variant), quote=variant.includes('quote')||['source-retry','oversize','stale','provider-throws'].includes(variant);
 const action=hash('current-action');f.state.latestCorporateActionHash=action;f.state.corporate={action:1,actionId:hash('current-action-id'),multiplierNumerator:'2',multiplierDenominator:'1',observedAt:'950',reportHash:action};
 f.state.latestReference.corporateActionHash=action;f.state.latestReference.multiplierNumerator='2';f.state.latestReference.observedAt='960';
 f.bundle.corporate={...f.bundle.corporate,action:1,actionId:f.state.corporate.actionId,multiplierNumerator:'2'};
 const network=getNetwork({chainFamily:'evm',chainSelectorName:'anvil-devnet',isTestnet:true})!;
 const config:any={...f.config,mode:live?'live':'replay',chainName:network.chainSelector.name,chainId:network.chainId,chainSelector:network.chainSelector.selector.toString(),replay:f.bundle};
 const receiver=live?config.liveReceiver:config.simulationReceiver;
 if(quote){config.dataSource='quote-snapshot';config.quote={symbol:'NVDA',assetId:config.assetId,sessionId:f.state.activeSessionId,secretIds:{finnhub:'FINNHUB_API_KEY',twelvedata:'TWELVEDATA_API_KEY'}};config.providers={...config.providers,primary:{id:'finnhub',url:'https://finnhub.io/api/v1/quote'},secondary:{id:'twelvedata',url:'https://api.twelvedata.com/quote'}};}
 const evm=EvmMock.testInstance(network.chainSelector.selector), http=HttpActionsMock.testInstance();
 const count={chain:0,http:0,consensus:0,secrets:0,writes:0};let assets=0,secondaryRequests=0;
 const asset=()=>({nextNonce:3n,stateHash:f.state.stateHash,configHash:f.state.configHash,activeSessionId:f.state.activeSessionId,halted:false,latestCorporateActionHash:action});
 const session=(s:any)=>({...s,reopenObservedAt:0n,scheduledReportHash:hash('schedule'),closeReportHash:hash('close'),reopenReportHash:zeroHash});
 const benchmark=(id:any)=>({finalized:id===config.referenceSessionId,assetId:config.assetId,sessionId:id,configHash:f.state.configHash,price:140000000n,multiplierNumerator:2n,multiplierDenominator:1n,observedAt:900n,primarySourceHash:hash('reference-p'),secondarySourceHash:hash('reference-s'),reportHash:hash('reference-benchmark')});
 evm.headerByNumber=()=>({header:{timestamp:'1000',blockNumber:{absVal:'AQ==',sign:'1'}}});
 const oracle=addContractMock(evm,{address:config.oracle,abi:readAbi});
 oracle.assetState=()=>{assets++;const a=asset();if(assets>1&&variant==='advanced')return {...a,nextNonce:4n,stateHash:hash('advanced')};if(assets>1&&variant==='inconsistent')return {...a,latestCorporateActionHash:hash('divergent')};return a;};
 oracle.marketSnapshot=()=>[asset(),session(f.state.session),session(f.state.activeSession),benchmark(config.sessionId),benchmark(config.referenceSessionId),f.state.corporate,f.state.latestReference];
 oracle.receiver=()=>receiver;
 const registry=addContractMock(evm,{address:config.registry,abi:readAbi});registry.getConfig=()=>{if(variant==='late-read-failure')throw Error('private backend detail');return [{assetToken:config.oracle,stockTokenDecimals:18,cashTokenDecimals:6,originationLtvBps:6000,targetLtvBps:6500,triggerLtvBps:7500,rateNumerator:800,rateDenominator:315360000000n,maxFills:8,maxActiveReceipts:32,supportedCorporateActions:6},1n,f.state.configHash];};
 const target=addContractMock(evm,{address:receiver,abi:readAbi});target.oracle=()=>config.oracle;target.forwarder=()=>live?config.liveForwarder:config.simulationForwarder;target.workflowId=()=>config.workflowId;target.workflowOwner=()=>config.workflowOwner;
 target.writeReport=req=>{count.writes++;if(variant==='unknown-write')throw Error('write echoed test-key');const payload=bytesToHex(req.report.rawReport.slice(-672)),decoded=decodeAbiParameters(reportAbi,payload);assert.equal(decoded[1],6);assert.equal(decoded[5],zeroHash);return {txStatus:'TX_STATUS_SUCCESS',receiverContractExecutionStatus:'RECEIVER_CONTRACT_EXECUTION_STATUS_SUCCESS'};};
 http.sendRequest=req=>{count.http++;assert.ok(count.http<=15);let body:string;
  if(req.url.startsWith('https://finnhub.io/')&&variant==='provider-throws')throw Error('capability echoed test-key');
  if(req.url.startsWith('https://finnhub.io/'))body=JSON.stringify({c:125,t:variant==='stale'?799:1000,...(variant==='oversize'?{padding:'😀'.repeat(6500)}:{})});
  else if(req.url.startsWith('https://api.twelvedata.com/')){secondaryRequests++;if(variant==='source-retry'&&secondaryRequests<3)return {statusCode:503,body:Buffer.from('provider echoed test-key').toString('base64')};body='{"symbol":"NVDA","close":"125","timestamp":1000}';}
  else {const key=Object.keys(config.providers).find(k=>config.providers[k].url===req.url)!;body=JSON.stringify(key==='calendar'?{...f.bundle.calendar,kind:6,assetId:config.assetId,sessionId:f.state.activeSessionId,configHash:f.state.configHash}:f.bundle[key]);}
  return {statusCode:200,body:Buffer.from(body).toString('base64')};
 };
 const secrets=new Map([['main',new Map([['FINNHUB_API_KEY','test-key'],['TWELVEDATA_API_KEY','test-key']])]]);
 const runtime=newTestRuntime(secrets,{timeProvider:()=>1000000},config),cap=runtime.callCapability.bind(runtime),getSecret=runtime.getSecret.bind(runtime);
 runtime.getSecret=input=>{count.secrets++;assert.ok(count.secrets<=5);return getSecret(input);};
 runtime.callCapability=input=>{if(['CallContract','HeaderByNumber'].includes(input.method)){count.chain++;assert.ok(count.chain<=15);}if(['Simple','Report'].includes(input.method)){count.consensus++;assert.ok(count.consensus<=50);if(input.method==='Simple'){assert.ok(toBinary(SDK_PB.SimpleConsensusInputsSchema,input.payload as any).length<25000);const p:any=input.payload;if(p.observation.case==='error')assert.ok(!p.observation.value.includes('test-key'));}}return cap(input);};
 const result=runWorkflow(runtime);
 if(['late-read-failure','oversize','inconsistent','provider-throws'].includes(variant)){assert.equal(result.status,'unavailable');assert.equal(count.writes,0);if(variant==='late-read-failure')assert.equal(count.chain,15);}
 else if(variant==='unknown-write'){assert.equal(result.status,'unknown');assert.equal(count.writes,1);}
 else if(variant==='stale'){assert.equal(result.status,'reject');assert.equal(count.writes,0);}
 else if(variant==='advanced'){assert.deepEqual(result,{status:'noop',reason:'ARC_STATE_ADVANCED'});assert.equal(count.writes,0);}
 else {assert.equal(result.status,'submitted');assert.equal(count.writes,1);assert.equal(count.chain,live?11:9);assert.equal(count.http,variant==='source-retry'?12:quote?(live?4:2):live?4:0);assert.equal(count.consensus,count.http+1);assert.equal(count.secrets,quote?2:0);}
 assert.ok(runtime.getLogs().every(l=>!l.includes('test-key')&&!l.includes('private backend')&&!l.includes('https:')));
});
