import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,keccak256} from 'viem';
const address=(n:number)=>`0x${n.toString(16).padStart(40,'0')}`;
const hash=`0x${'ab'.repeat(32)}`;
const account=address(99);
async function setup(){
  const m=await import('../../src/adapter/wallet.ts').catch(()=>null);assert.ok(m,'wallet flow required');
  const {abis}=await import('../../src/generated/abis.ts');
  const addresses=Object.fromEntries(Object.keys(abis).map((k,i)=>[k,address(i+1)]));
  const manifest={chainId:'31337',deploymentBlock:'1',addresses,codeHashes:Object.fromEntries(Object.keys(addresses).map(k=>[k,keccak256('0x01')]))};
  const listeners:Record<string,Function>={},calls:any[]=[];let chain='0x7a69',accounts=[account],receipt:any={status:'success',blockNumber:7n,blockHash:hash,transactionHash:hash};
  const provider={on:(n:string,f:Function)=>listeners[n]=f,removeListener:()=>{},request:async(x:any)=>{calls.push(x);if(x.method==='eth_chainId')return chain;if(x.method==='eth_accounts'||x.method==='eth_requestAccounts')return accounts;if(x.method==='eth_sendTransaction')return hash;throw Error('unexpected request');}};
  const rpc:any={getChainId:async()=>31337,getBlock:async()=>({number:7n,hash,timestamp:100n}),getCode:async()=>'0x01',call:async(x:any)=>{calls.push({simulate:x});return {data:'0x'};},waitForTransactionReceipt:async()=>receipt};
  const client=new m.Wallet(provider as any,rpc,manifest as any);await client.connect();
  const intent={contract:'pool',method:'deposit',args:['2000000']};
  const unsigned:any={chainId:'31337',from:account,to:addresses.pool,data:encodeFunctionData({abi:abis.pool,functionName:'deposit',args:[2000000n]}),value:'0',sourceBlock:'7',sourceBlockHash:hash};
  return {m,abis,client,rpc,provider,calls,manifest,intent,unsigned,listeners,setReceipt:(r:any)=>receipt=r,setAccounts:(a:string[])=>accounts=a,setChain:(c:string)=>chain=c};
}
test('transaction progress exposes submitted hash before receipt and confirmation before index refresh',async()=>{
 const x=await setup(),stages:any[]=[];
 x.rpc.waitForTransactionReceipt=async()=>{assert.equal(stages.at(-1).phase,'submitted');assert.equal(stages.at(-1).hash,hash);return {status:'success',blockNumber:7n,blockHash:hash,transactionHash:hash};};
 await x.client.send(x.intent,x.unsigned,async()=>{assert.equal(stages.at(-1).phase,'confirmed');},(event:any)=>stages.push(event));
 assert.deepEqual(stages.map(e=>e.phase),['signature','submitted','confirmed']);
});
test('confirmed receipt remains observable when snapshot refresh fails',async()=>{
 const x=await setup(),stages:any[]=[];
 await assert.rejects(()=>x.client.send(x.intent,x.unsigned,async()=>{throw Error('index unavailable');},(event:any)=>stages.push(event)),/index unavailable/);
 assert.equal(stages.at(-1).phase,'confirmed');assert.equal(stages.at(-1).hash,hash);
});
test('verified deposit simulates, requests one wallet transaction, and refreshes at its receipt block',async()=>{
  const x=await setup();let min=0n;await x.client.send(x.intent,x.unsigned,async(b:bigint)=>{min=b;});
  assert.equal(min,7n);assert.equal(x.calls.filter(c=>c.method==='eth_sendTransaction').length,1);
  assert.ok(x.calls.findIndex(c=>c.simulate)<x.calls.findIndex(c=>c.method==='eth_sendTransaction'));
});
test('all six approval purposes encode the exact token and spender',async()=>{
  const x=await setup();for(const [purpose,token,spender]of [['deposit','cash','pool'],['offer','cash','book'],['premium','cash','book'],['repay','cash','loanManager'],['collateral','stock','vault'],['backing','stock','vault']]){
    const expected=x.client.expected({approval:purpose!,amount:'23'});assert.equal(expected.to,x.manifest.addresses[token!]);
    assert.equal(expected.data,encodeFunctionData({abi:x.abis.cash,functionName:'approve',args:[x.manifest.addresses[spender!] as any,23n]}));
  }
});
test('tampered chain, sender, destination, value, calldata, or source hash cannot reach simulation/signing',async()=>{
  for(const [key,value]of [['chainId','1'],['from',address(98)],['to',address(88)],['value','1'],['data','0x00'],['sourceBlockHash',`0x${'cd'.repeat(32)}`]]){
    const x=await setup();await assert.rejects(()=>x.client.send(x.intent,{...x.unsigned,[key!]:value},async()=>{}));
    assert.equal(x.calls.filter(c=>c.method==='eth_sendTransaction').length,0);
  }
});
test('chain and account changes, disconnect, and wallet rejection cannot be presented as confirmation',async()=>{
  for(const event of ['accountsChanged','chainChanged','disconnect']){const x=await setup();x.listeners[event]!([]);await assert.rejects(()=>x.client.send(x.intent,x.unsigned,async()=>{}),/connect|changed/i);}
  const x=await setup();x.setAccounts([address(77)]);await assert.rejects(()=>x.client.send(x.intent,x.unsigned,async()=>{}),/account/i);
  const y=await setup();y.setChain('0x1');await assert.rejects(()=>y.client.send(y.intent,y.unsigned,async()=>{}),/chain/i);
  const z=await setup();z.rpc.call=async()=>{throw Error('execution reverted');};await assert.rejects(()=>z.client.send(z.intent,z.unsigned,async()=>{}),/reverted/);assert.equal(z.calls.filter(c=>c.method==='eth_sendTransaction').length,0);
});
test('reverted receipts and cancelled replacements do not refresh as successful transactions',async()=>{
  const x=await setup();x.setReceipt({status:'reverted',blockNumber:7n,blockHash:hash});let refresh=false;
  await assert.rejects(()=>x.client.send(x.intent,x.unsigned,async()=>{refresh=true;}),/revert/);assert.equal(refresh,false);
  const y=await setup();y.rpc.waitForTransactionReceipt=async({onReplaced}:any)=>{onReplaced({reason:'cancelled',transaction:{}});return {status:'success',blockNumber:8n,blockHash:hash};};
  await assert.rejects(()=>y.client.send(y.intent,y.unsigned,async()=>{}),/replac|cancel/);
});
test('repriced identical transactions refresh canonical state; changed replacements and reorgs fail',async()=>{
  const x=await setup();x.rpc.waitForTransactionReceipt=async({onReplaced}:any)=>{onReplaced({reason:'repriced',transaction:{from:account,to:x.unsigned.to,input:x.unsigned.data,value:0n}});return {status:'success',blockNumber:7n,blockHash:hash};};
  await x.client.send(x.intent,x.unsigned,async()=>{});
  const y=await setup();y.rpc.waitForTransactionReceipt=async({onReplaced}:any)=>{onReplaced({reason:'replaced',transaction:{from:account,to:y.unsigned.to,input:'0x',value:0n}});return {status:'success',blockNumber:7n,blockHash:hash};};
  await assert.rejects(()=>y.client.send(y.intent,y.unsigned,async()=>{}),/replac/);
  const z=await setup();z.setReceipt({status:'success',blockNumber:7n,blockHash:`0x${'cd'.repeat(32)}`});await assert.rejects(()=>z.client.send(z.intent,z.unsigned,async()=>{}),/canonical/);
});
test('privileged and obsolete methods have no browser signing path',async()=>{
  const x=await setup();for(const method of ['mint','pause','postReport','setClock','withdrawAssets'])assert.throws(()=>x.client.expected({contract:'pool',method,args:[]}));
});
test('wallet rejection is propagated and account changes during receipt wait invalidate confirmation',async()=>{
  const x=await setup();x.provider.request=async()=>{throw Object.assign(Error('User rejected'),{code:4001});};await assert.rejects(()=>x.client.send(x.intent,x.unsigned,async()=>{}),/rejected/);
  const y=await setup();let refreshed=false;y.rpc.waitForTransactionReceipt=async()=>{y.listeners.accountsChanged!([address(77)]);return {status:'success',blockNumber:7n,blockHash:hash};};await assert.rejects(()=>y.client.send(y.intent,y.unsigned,async()=>{refreshed=true;}),/changed/);assert.equal(refreshed,false);
});

test('removed manager loan methods cannot be prepared by a browser',async()=>{const x=await setup();for(const method of ['borrowWithCover','repay','addCollateral','withdrawCollateral','liquidate','topUpBacking','finalizeHandoff'])assert.throws(()=>x.client.expected({contract:'manager',method,args:[]}));});

test('settlement intent encodes only the explicit receipt on the manager and checks unsigned identity',async()=>{
 for(const settlement of ['settle','terminalSettle'] as const){
  const x=await setup(),intent={settlement,receiptId:'9007199254740993'};
  const data=encodeFunctionData({abi:x.abis.manager,functionName:settlement,args:[9007199254740993n]});
  const unsigned={...x.unsigned,to:x.manifest.addresses.manager,data};let refreshed=false;
  await x.client.send(intent as any,unsigned,async()=>{refreshed=true;});assert.equal(refreshed,true);
  for(const bad of [{chainId:'1'},{from:address(4)},{to:x.manifest.addresses.loanManager},{value:'1'},{data:encodeFunctionData({abi:x.abis.manager,functionName:settlement,args:[1n]})},{sourceBlockHash:`0x${'cd'.repeat(32)}`}]){
   const count=x.calls.filter(c=>c.method==='eth_sendTransaction').length;
   await assert.rejects(()=>x.client.send(intent as any,{...unsigned,...bad},async()=>{}));assert.equal(x.calls.filter(c=>c.method==='eth_sendTransaction').length,count);
  }
  for(const receiptId of ['01',1,'-1'])assert.throws(()=>x.client.expected({settlement,receiptId} as any));
  assert.throws(()=>x.client.expected({contract:'manager',method:settlement,args:['1']}));
 }
});
test('disposing a provider while preparing or connecting invalidates its pending generation',async()=>{
 const x=await setup();let finish!:(value:any)=>void;
 x.provider.request=async({method}:any)=>method==='eth_requestAccounts'?new Promise(r=>finish=r):method==='eth_accounts'?[account]:'0x7a69';
 const pending=x.client.connect();x.client.dispose();finish([account]);await assert.rejects(()=>pending,/changed/i);assert.equal(x.client.verified,false);assert.equal(x.client.account,undefined);
});
