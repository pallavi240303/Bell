import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFunctionData, keccak256 } from 'viem';

async function module(name: string): Promise<any> {
  const result = await import(`../${name}.ts`).catch(() => null);
  assert.ok(result, `${name} implementation is required`);
  return result;
}
const address = (n: number) => `0x${n.toString(16).padStart(40,'0')}`;
const hash = (n: number) => `0x${n.toString(16).padStart(64,'0')}`;
const deployment = {chainId:'5042002',deploymentBlock:'1',addresses:Object.fromEntries(['manager','loanManager','book','pool','vault','cash','stock','oracle','registry','receiver'].map((x,i)=>[x,address(i+1)]))};

function wiring({address:target,functionName:f}:any){
 const c=Object.keys(deployment.addresses).find(k=>deployment.addresses[k]===target);
 const routes:Record<string,Record<string,string>>={manager:{loanManager:'loanManager',registry:'registry',oracle:'oracle',book:'book',pool:'pool',vault:'vault'},loanManager:{coverManager:'manager',registry:'registry',oracle:'oracle',pool:'pool',vault:'vault'},book:{coverManager:'manager',protectedPool:'pool',cashToken:'cash'},pool:{coverManager:'loanManager',cashToken:'cash'},vault:{coverManager:'loanManager'},oracle:{receiver:'receiver'},receiver:{oracle:'oracle'}};
 if(f==='profile')return 1;if(f==='coverOpensBeforeClose')return 600n;if(f==='coverCutoffBeforeClose')return 60n;
 return deployment.addresses[routes[c!]![f]!];
}

test('deployment identity requires complete unique addresses and hashes before preparation',async()=>{
  const {verifyDeployment}=await module('config');const {prepareActor,prepareSettlement}=await module('transactions');
  const source={number:12n,hash:hash(12),timestamp:99n};const code='0x6000';
  const valid={...deployment,codeHashes:Object.fromEntries(Object.keys(deployment.addresses).map(k=>[k,keccak256(code)]))};
  const rpc={readContract:async(args:any)=>wiring(args),getChainId:async()=>5042002,getBlock:async()=>source,getCode:async({blockNumber}:any)=>{assert.equal(blockNumber,12n,'code reads must be pinned');return code;}};
  const malformed:any[]=[deployment,{...valid,addresses:{...valid.addresses,pool:undefined}},{...valid,codeHashes:{...valid.codeHashes,pool:undefined}},{...valid,addresses:{...valid.addresses,pool:valid.addresses.book}},{...valid,addresses:{...valid.addresses,pool:'0x12'}},{...valid,addresses:{...valid.addresses,pool:address(0)}},{...valid,codeHashes:{...valid.codeHashes,pool:'0x12'}},{...valid,chainId:'0'},{...valid,chainId:5042002},{...valid,deploymentBlock:'01'},{...valid,deploymentBlock:'13'}];
  for(const d of malformed)await assert.rejects(()=>verifyDeployment({...rpc,getCode:async()=>code},d));
  await verifyDeployment(rpc,valid,source);
  await assert.rejects(()=>verifyDeployment({...rpc,readContract:async()=>address(99)},valid,source),/wiring/);
  await assert.rejects(()=>verifyDeployment(rpc,{...valid,codeHashes:{...valid.codeHashes,pool:hash(0)}},source),/code mismatch/);
  let calls=0;await assert.rejects(()=>verifyDeployment({...rpc,getBlock:async()=>({...source,hash:++calls===1?source.hash:hash(13)})},valid,source),/replaced/);
  const input={chainId:valid.chainId,from:address(20),contract:'loanManager',method:'repay',args:['1','2']};
  await assert.rejects(async()=>prepareActor(valid,source,input,{...rpc,getCode:async()=> '0x6001'}),/code mismatch/);
  await assert.rejects(async()=>prepareSettlement(valid,source,address(20),1n,'settle',{...rpc,getCode:async()=> '0x6001'}),/code mismatch/);
});

test('raw integers retain 256-bit precision and reject noncanonical JSON encodings', async () => {
  const {rawUint, json} = await module('types');
  const max = (2n**256n-1n).toString(); assert.equal(rawUint(max),BigInt(max));
  assert.equal(json({amount:BigInt(max)}),`{"amount":"${max}"}`);
  for(const value of [1,-1,'-1','01','1.0','1e3','', (2n**256n).toString()]) assert.throws(()=>rawUint(value));
  assert.throws(()=>rawUint('256',8));
});

test('unsigned actor calls preserve exact caller, argument, destination, source and approval spender', async () => {
  const {prepareActor} = await module('transactions'); const {artifact} = await module('abi');
  const source = {number:12n,hash:hash(12),timestamp:99n};
  const checked={...deployment,codeHashes:Object.fromEntries(Object.keys(deployment.addresses).map(k=>[k,keccak256('0x6000')]))};
  const rpc={readContract:async(args:any)=>wiring(args),getChainId:async()=>5042002,getBlock:async()=>source,getCode:async()=> '0x6000'};
  const base = {chainId:'5042002',from:address(20),contract:'loanManager',method:'repay',args:['7','9007199254740993']};
  const tx = await prepareActor(checked,source,base,rpc);
  assert.equal(tx.from,base.from);assert.equal(tx.to,deployment.addresses.loanManager);assert.equal(tx.value,'0');assert.equal(tx.sourceBlock,'12');
  assert.deepEqual(decodeFunctionData({abi:artifact('LoanManager').abi,data:tx.data}).args,[7n,9007199254740993n]);
  for(const [purpose,token,spender] of [['deposit','cash','pool'],['offer','cash','book'],['premium','cash','book'],['repay','cash','loanManager'],['collateral','stock','vault'],['backing','stock','vault']]) {
    const approval = await prepareActor(checked,source,{chainId:'5042002',from:address(20),approval:purpose,amount:'123'},rpc);
    assert.equal(approval.to,deployment.addresses[token!]);
    const decoded=decodeFunctionData({abi:artifact('MockCashToken').abi,data:approval.data});
    assert.equal(String(decoded.args![0]).toLowerCase(),deployment.addresses[spender!]);assert.equal(decoded.args![1],123n);
  }
  for(const extra of [{privateKey:'secret'},{to:address(30)},{data:'0x12'},{chainId:'31337'},{args:['7',1]},{method:'acceptReport'},{contract:'receiver'}]) await assert.rejects(()=>prepareActor(checked,source,{...base,...extra},rpc));
});

test('Anvil signer key loading requires all four gates and never occurs on Arc', async () => {
  const {localActors} = await module('anvil'); let loaded=0;
  const load=()=>{loaded++;return ['secret'];};
  const rpc={request:async()=>({})};
  for(const options of [{mode:'arc',chainId:5042002,rpcUrl:'https://rpc.testnet.arc.io'},{mode:'local',chainId:5042002,rpcUrl:'http://127.0.0.1:8545'},{mode:'local',chainId:31337,rpcUrl:'https://example.com'},{mode:'arc',chainId:31337,rpcUrl:'http://localhost:8545'}]) await assert.rejects(()=>localActors(options,rpc,load));
  await assert.rejects(()=>localActors({mode:'local',chainId:31337,rpcUrl:'http://localhost:8545'},{request:async()=>{throw Error('unsupported');}},load));
  assert.equal(loaded,0);
  const local={mode:'local',chainId:31337,rpcUrl:'http://127.0.0.1:8545'};
  const result=await localActors(local,{request:async({method}:any)=>method==='eth_chainId'?'0x7a69':{}},()=>{loaded++;return [];});
  assert.deepEqual(result,[]);assert.equal(loaded,1);
  await assert.rejects(()=>localActors(local,{request:async({method}:any)=>method==='eth_chainId'?'0x1':{}},load));assert.equal(loaded,1);
});

test('settlement uses chain deadline, terminal precedence, accepted identity and refresh after races', async () => {
  const {classify,monitor} = await module('settler');
  const r={status:1n,settlementDeadline:100n,benchmarkReportHash:hash(0),consent:{assetId:hash(1),sessionId:hash(2),configHash:hash(3)}};
  const b={finalized:true,reportHash:hash(4),...r.consent};
  assert.equal(classify(r,b,99n),'settle');assert.equal(classify(r,b,100n),'terminalSettle');
  assert.equal(classify(r,{finalized:false},100n),'terminalSettle');assert.equal(classify(r,{finalized:false},99n),null);
  assert.equal(classify({...r,benchmarkReportHash:hash(4)},b,99n),null);assert.equal(classify({...r,status:2n},b,101n),null);
  assert.equal(classify(r,{...b,configHash:hash(8)},99n),null);
  let reads=0,sends=0;
  const result=await monitor(async()=>({receipt:reads++===0?r:{...r,status:2n},benchmark:b,block:{number:1n,hash:hash(1),timestamp:99n}}),async()=>{sends++;throw Error('replaced');});
  assert.equal(reads,2);assert.equal(sends,1);assert.equal(result.next,null);assert.equal(result.status,'refresh');
});

test('missing generated artifacts fail clearly', async () => {
  const {artifact}=await module('abi');assert.throws(()=>artifact('NotAContract'),/forge build|artifact/i);
});

// Catches accidentally widening the actor lane or skipping/doubling deployment verification.
test('exact permissionless settlement envelope delegates once and rejects actor or arbitrary fields',async()=>{
 const {prepareActor}=await module('transactions'),{artifact}=await module('abi');
 const source={number:12n,hash:hash(12),timestamp:99n},checked={...deployment,codeHashes:Object.fromEntries(Object.keys(deployment.addresses).map(k=>[k,keccak256('0x6000')]))};
 let identities=0;const rpc={readContract:async(args:any)=>wiring(args),getChainId:async()=>{identities++;return 5042002;},getBlock:async()=>source,getCode:async()=> '0x6000'};
 const base={chainId:'5042002',from:address(20),settlement:'settle',receiptId:'9007199254740993'};
 for(const settlement of ['settle','terminalSettle']){
  identities=0;const tx=await prepareActor(checked,source,{...base,settlement},rpc);
  assert.equal(identities,1);assert.equal(tx.to,checked.addresses.manager);assert.equal(tx.from,base.from);assert.equal(tx.value,'0');assert.equal(tx.sourceBlock,'12');assert.equal(tx.sourceBlockHash,source.hash);
  const call=decodeFunctionData({abi:artifact('CoverManager').abi,data:tx.data});assert.equal(call.functionName,settlement);assert.deepEqual(call.args,[9007199254740993n]);
 }
 for(const extra of [{amount:'1'},{recipient:address(9)},{contract:'manager'},{method:'settle'},{args:['1']},{value:'0'},{to:address(4)},{settlement:'withdrawClaim'},{settlement:undefined},{receiptId:'01'},{receiptId:1},{receiptId:(2n**256n).toString()},{chainId:'31337'},{from:'0x12'}])await assert.rejects(()=>prepareActor(checked,source,{...base,...extra},rpc));
 for(const method of ['settle','terminalSettle'])await assert.rejects(()=>prepareActor(checked,source,{chainId:checked.chainId,from:base.from,contract:'manager',method,args:['1']},rpc),/actor method/);
 await assert.rejects(()=>prepareActor(checked,source,base,{...rpc,getCode:async()=> '0x6001'}),/code mismatch/);
});
