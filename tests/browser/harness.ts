import {encodeFunctionData,decodeEventLog,type Address,type Hex} from 'viem';
import type {Page} from '@playwright/test';
import {createLocalFixture} from '../../services/keeper/replay.ts';
import {artifact,contracts,argsFor} from '../../services/keeper/abi.ts';
import {prepareActor} from '../../services/keeper/transactions.ts';
import {json} from '../../services/keeper/types.ts';
import {revertBytes} from '../../services/keeper/state.ts';
import {coverPreview} from '../../src/adapter/actions.ts';
import {policyHash} from '../../engine/quote.ts';
export async function harness(seedOffers=true,seedLoan=true){
 const f=await createLocalFixture();let stopped=false;const stop=async()=>{if(stopped)return;stopped=true;await f.stop();};
 try{
 const {node,deployment:d,actors,input,assetId:asset}=f,a=d.addresses,sends:any[]=[];let loanId=0n,ids:Hex[]=[];
 const read=f.read,send=f.send,observe=f.observe;
 await f.report(f.role('schedule'));await f.report(f.role(seedLoan?'origination-price':'window-price'));
 await f.approve(actors.lender!,'deposit');await f.action(actors.lender!,'pool','deposit',[input.lenderSupply]);
 if(seedLoan){await f.approve(actors.borrower!,'collateral');loanId=await f.borrow();await node.time(BigInt(input.repayAt));await f.approve(actors.borrower!,'repay');await f.action(actors.borrower!,'loanManager','repay',[loanId,input.partialRepay]);await f.report(f.role('window-price'));}
 await node.time(BigInt(input.coverAt));
 const before=await observe(),m=before.state.assets[asset],session=m.state.activeSessionId,cp=before.state.coverPolicy;
 const policy=policyHash(BigInt(d.chainId),a.manager,asset,session,m.state.configHash,1n,1n,cp.profile,cp.coverOpensBeforeClose,cp.coverCutoffBeforeClose);
 for(const buyer of seedOffers?input.scenarios[0].buyers:[]){const actor=actors[buyer.actor]!;await send(actors.owner!,'eligibility','setEligible',[asset,actor,policy,true]);await f.approve(actor,'offer');const terms={...input.offerCommon,assetId:asset,policyHash:policy,strike:buyer.strike,nonce:buyer.nonce};await f.action(actor,'book','postOffer',[terms]);ids.push(await read('book','computeOfferId',[actor,BigInt(buyer.nonce)]));}
 if(seedLoan)await f.approve(actors.borrower!,'premium');
 const quote=seedOffers&&seedLoan?coverPreview(await observe(),d.chainId,a.manager,actors.borrower!,loanId.toString(),ids):undefined;
 const report=async(index:number,price?:bigint)=>f.report({...f.role(index===1?'close':'reopen'),...(price===undefined?{}:{benchmarkPrice:price.toString()})});
 const attach=async(page:Page,role='borrower')=>{
  const account=actors[role]!;
  await page.route('**/api/**',async route=>{try{const url=new URL(route.request().url());let value:unknown;if(url.pathname==='/api/manifest')value=d;else if(url.pathname==='/api/state')value=await observe();else if(url.pathname==='/api/events'){const block=await node.client.getBlock({blockNumber:BigInt(url.searchParams.get('blockNumber')!)});if(block.hash!==url.searchParams.get('blockHash'))throw Error('replaced boundary');value={block:{number:block.number,hash:block.hash,timestamp:block.timestamp},events:f.transactions.flatMap(t=>t.events).filter(l=>BigInt(l.blockNumber)<=block.number).map(l=>({...l,blockTimestamp:f.transactions.find(t=>t.transactionHash===l.transactionHash)!.block.timestamp}))};}else if(url.pathname==='/api/prepare')value=await prepareActor(d,(await observe()).block,route.request().postDataJSON(),node.client);else throw Error('Unallowed route');await route.fulfill({contentType:'application/json',body:json(value)});}catch{await route.fulfill({status:400,body:'{}'});}});
  await page.route('**/rpc',async route=>{const request=route.request().postDataJSON();try{const result=await node.request(request.method,request.params);await route.fulfill({contentType:'application/json',body:json({jsonrpc:'2.0',id:request.id,result})});}catch{await route.fulfill({contentType:'application/json',body:json({jsonrpc:'2.0',id:request.id,error:{code:-32000,message:'local RPC rejected'}})});}});
  await page.exposeBinding('walletRequest',async(_,request:any)=>{
   if(request.method==='eth_accounts'||request.method==='eth_requestAccounts')return [account];
   if(request.method==='eth_sendTransaction'){const tx=request.params[0];if(tx.from.toLowerCase()!==account)throw Error('Wrong fixture wallet');sends.push(tx);const c=Object.keys(a).find(k=>a[k]!.toLowerCase()===tx.to.toLowerCase())!;const {decodeFunctionData}=await import('viem');const call=decodeFunctionData({abi:artifact(contracts[c]!).abi,data:tx.data});return (await send(account,c,call.functionName,call.args as any[])).transactionHash;}
   try{return await node.request(request.method,request.params??[]);}catch(error){return {__bellRpcError:{code:(error as any).code??(error as any).cause?.code??-32603,message:(error as Error).message,data:revertBytes(error)}};}
  });
  await page.addInitScript(()=>{const listeners:Record<string,Function[]>={};(window as any).ethereum={request:async(args:any)=>{const result=await (window as any).walletRequest(args);if(result?.__bellRpcError)throw Object.assign(new Error(result.__bellRpcError.message),result.__bellRpcError);return result;},on:(name:string,fn:Function)=>(listeners[name]??=[]).push(fn),removeListener:(name:string,fn:Function)=>{listeners[name]=(listeners[name]??[]).filter(x=>x!==fn);}};(window as any).emitWallet=(event:string,value:any)=>listeners[event]?.forEach(fn=>fn(value));});
 };
 return {f,node,d,actors,input,quote,loanId,asset,policy,get ids(){return f.transactions.flatMap(t=>t.events.filter((e:any)=>e.decoded?.eventName==='OfferPosted').map((e:any)=>e.decoded.args.offerId as Hex));},sends,observe,read,send,report,attach,stop,get logs(){return f.transactions.flatMap(t=>t.events);}};
 }catch(e){await stop();throw e;}
}
