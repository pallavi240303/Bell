import {readFileSync} from 'node:fs';
import {encodeFunctionData,decodeEventLog,keccak256,toHex,type Address,type Hex} from 'viem';
import type {Page} from '@playwright/test';
import {localNode,deployLocal} from '../../scripts/keeper-local.ts';
import {artifact,contracts,argsFor} from '../../services/keeper/abi.ts';
import {snapshot} from '../../services/keeper/state.ts';
import {prepareActor} from '../../services/keeper/transactions.ts';
import {bindReport} from '../../services/keeper/replay.ts';
import {json,integers} from '../../services/keeper/types.ts';
const zero=`0x${'0'.repeat(64)}` as Hex;
export async function harness(seedOffers=true){
  const node=await localNode(),{deployment:d}=await deployLocal(node),a=d.addresses;
  const input=JSON.parse(readFileSync('services/keeper/fixtures/replay.json','utf8')),actors=input.actors as Record<string,Address>;
  const logs:any[]=[],ids:Hex[]=[];let account=actors.borrower!;const sends:any[]=[];
  const record=async(receipt:any)=>{const block=await node.client.getBlock({blockNumber:receipt.blockNumber});for(const log of receipt.logs){const key=Object.keys(a).find(k=>a[k]!.toLowerCase()===log.address.toLowerCase());if(key)try{const decoded:any=decodeEventLog({abi:artifact(contracts[key]!).abi,data:log.data,topics:log.topics});logs.push(integers({...log,blockTimestamp:block.timestamp,decoded}));if(decoded.eventName==='OfferPosted')ids.push(decoded.args.offerId);}catch{}}};
  const send=async(from:Address,c:string,method:string,args:any[])=>{const receipt=await node.send(from,a[c]!,encodeFunctionData({abi:artifact(contracts[c]!).abi,functionName:method,args}));await record(receipt);return receipt;};
  const read=async(c:string,method:string,args:any[]=[])=>node.client.readContract({address:a[c]!,abi:artifact(contracts[c]!).abi,functionName:method,args}) as Promise<any>;
  const asset=keccak256(toHex(input.assetLabel)),session=keccak256(toHex(input.sessionLabel)),policy=keccak256(toHex(input.policyLabel));
  const config=argsFor('AssetRegistry','scheduleAssetConfig',[asset,{...input.config,assetToken:a.stock},input.effectiveAt])[1];
  await send(actors.owner!,'registry','scheduleAssetConfig',[asset,config,1001n]);
  const configHash=await read('registry','configHash',[asset,1n]);
  const report=async(index:number,price?:bigint)=>{const fact={...input.reports[index],...(price===undefined?{}:{benchmarkPrice:price.toString()})};await node.time(BigInt(fact.observedAt));const state=await read('oracle','assetState',[asset]);const bound=bindReport(fact,{chainId:d.chainId,oracle:a.oracle!,configHash,nonce:state.nextNonce.toString(),previousStateHash:state.stateHash});await send(actors.owner!,'receiver','onReport',['0x',bound.payload]);};
  await report(0);await node.time(1001n);
  for(const role of ['lender','borrower','buyerA','buyerB']){await send(actors.owner!,'cash','mint',[actors[role],BigInt(input.cashFunding)]);await send(actors.owner!,'stock','mint',[actors[role],BigInt(input.stockFunding)]);await send(actors.owner!,'eligibility','setEligible',[asset,actors[role],policy,true]);}
  await send(actors.lender!,'cash','approve',[a.pool,BigInt(input.lenderSupply)]);await send(actors.lender!,'pool','deposit',[BigInt(input.lenderSupply)]);
  for(const buyer of seedOffers?input.scenarios[0].buyers:[]){const who=actors[buyer.actor]!;await send(who,'cash','approve',[a.book,BigInt(input.cashFunding)]);const terms={...input.offerCommon,assetId:asset,policyHash:policy,strike:buyer.strike,nonce:buyer.nonce};await send(who,'book','postOffer',argsFor('CommitmentBook','postOffer',[terms]));}
  await send(actors.borrower!,'cash','approve',[a.book,BigInt(input.cashFunding)]);await send(actors.borrower!,'stock','approve',[a.vault,BigInt(input.stockFunding)]);
  const fact=await read('oracle','sessionFact',[session]);
  const quote={...input.consent,borrower:actors.borrower,recipient:actors.borrower,assetId:asset,sessionId:session,configHash,policyHash:policy,scheduledReportHash:fact.scheduledReportHash,corporateActionHash:zero,weightedStrike:input.scenarios[0].weightedStrike};
  const observe=()=>snapshot(node.client,d,Object.values(actors),ids,undefined,logs);
  const attach=async(page:Page,role='borrower')=>{
    account=actors[role]!;
    await page.route('**/api/**',async route=>{try{const url=new URL(route.request().url());let value:unknown;if(url.pathname==='/api/manifest')value=d;else if(url.pathname==='/api/state')value=await observe();else if(url.pathname==='/api/events'){const block=await node.client.getBlock({blockNumber:BigInt(url.searchParams.get('blockNumber')!)});if(block.hash!==url.searchParams.get('blockHash'))throw Error('replaced boundary');value={block:{number:block.number,hash:block.hash,timestamp:block.timestamp},events:logs.filter(l=>l.blockNumber<=block.number)};}else if(url.pathname==='/api/prepare')value=await prepareActor(d,(await observe()).block,route.request().postDataJSON(),node.client);else throw Error('Unallowed browser route');await route.fulfill({contentType:'application/json',body:json(value)});}catch{await route.fulfill({status:400,body:'{}'});}});
    await page.route('**/rpc',async route=>{const request=route.request().postDataJSON();try{const result=await node.request(request.method,request.params);await route.fulfill({contentType:'application/json',body:json({jsonrpc:'2.0',id:request.id,result})});}catch{await route.fulfill({contentType:'application/json',body:json({jsonrpc:'2.0',id:request.id,error:{code:-32000,message:'local RPC rejected'}})});}});
    await page.exposeBinding('walletRequest',async(_,request:any)=>{
      if(request.method==='eth_accounts'||request.method==='eth_requestAccounts')return [account];
      if(request.method==='eth_sendTransaction'){const tx=request.params[0];if(tx.from.toLowerCase()!==account)throw Error('Wrong fixture wallet');sends.push(tx);const receipt=await node.send(account,tx.to,tx.data);await record(receipt);return receipt.transactionHash;}
      return node.request(request.method,request.params??[]);
    });
    await page.addInitScript(()=>{const listeners:Record<string,Function[]>={};(window as any).ethereum={request:(args:any)=>(window as any).walletRequest(args),on:(name:string,fn:Function)=>(listeners[name]??=[]).push(fn),removeListener:(name:string,fn:Function)=>{listeners[name]=(listeners[name]??[]).filter(x=>x!==fn);}};});
  };
  return {node,d,actors,input,quote,asset,policy,ids,logs,sends,observe,read,send,report,attach,stop:node.stop};
}
