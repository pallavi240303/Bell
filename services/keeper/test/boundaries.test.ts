import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFunctionData } from 'viem';

async function module(name: string): Promise<any> {
  const result = await import(`../${name}.ts`).catch(() => null);
  assert.ok(result, `${name} implementation is required`);
  return result;
}
const address = (n: number) => `0x${n.toString(16).padStart(40,'0')}`;
const hash = (n: number) => `0x${n.toString(16).padStart(64,'0')}`;
const deployment = {chainId:'5042002',deploymentBlock:'1',addresses:Object.fromEntries(['manager','book','pool','vault','cash','stock','oracle','registry','receiver'].map((x,i)=>[x,address(i+1)]))};

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
  const base = {chainId:'5042002',from:address(20),contract:'manager',method:'repay',args:['7','9007199254740993']};
  const tx = prepareActor(deployment,source,base);
  assert.equal(tx.from,base.from);assert.equal(tx.to,deployment.addresses.manager);assert.equal(tx.value,'0');assert.equal(tx.sourceBlock,'12');
  assert.deepEqual(decodeFunctionData({abi:artifact('CoverManager').abi,data:tx.data}).args,[7n,9007199254740993n]);
  for(const [purpose,token,spender] of [['deposit','cash','pool'],['offer','cash','book'],['premium','cash','book'],['repay','cash','manager'],['collateral','stock','vault'],['backing','stock','vault']]) {
    const approval = prepareActor(deployment,source,{chainId:'5042002',from:address(20),approval:purpose,amount:'123'});
    assert.equal(approval.to,deployment.addresses[token!]);
    const decoded=decodeFunctionData({abi:artifact('MockCashToken').abi,data:approval.data});
    assert.equal(String(decoded.args![0]).toLowerCase(),deployment.addresses[spender!]);assert.equal(decoded.args![1],123n);
  }
  for(const extra of [{privateKey:'secret'},{to:address(30)},{data:'0x12'},{chainId:'31337'},{args:['7',1]},{method:'acceptReport'},{contract:'receiver'}]) assert.throws(()=>prepareActor(deployment,source,{...base,...extra}));
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
