import assert from 'node:assert/strict';
import test from 'node:test';
async function module(name:string):Promise<any>{const m=await import(`../${name}.ts`).catch(()=>null);assert.ok(m,`${name} implementation required`);return m;}
test('grouped reads pin a block and discard projections when its hash changes',async()=>{
  const {coherent}=await module('state');let calls=0;const rpc={getBlock:async()=>({number:3n,hash:++calls===1?'0x01':'0x02',timestamp:88n})};
  await assert.rejects(()=>coherent(rpc,async(b:any)=>{assert.equal(b.number,3n);return {debt:4n};}),/replaced/);
  const fixed={number:3n,hash:'0x01',timestamp:88n};const result=await coherent({getBlock:async()=>fixed},async()=>({debt:9007199254740993n}));assert.deepEqual(result,{block:fixed,state:{debt:9007199254740993n}});
});
test('API exposes raw snapshots and unsigned requests without a signing endpoint',async()=>{
  const {createApi}=await module('api');const server=createApi({state:async()=>({debt:9007199254740993n}),events:async()=>[],prepare:async(x:any)=>x});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  try{const state:any=await fetch(`http://127.0.0.1:${port}/state`).then(r=>r.json());assert.equal(state.debt,'9007199254740993');
    assert.equal((await fetch(`http://127.0.0.1:${port}/send`,{method:'POST'})).status,404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/prepare`,{method:'POST',body:'{'})).status,400);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(r));}
});
test('evidence hashes canonical inputs, rejects secret fields and verifies same-time conservation',async()=>{
  const {digest,assertSafe,conservation}=await module('evidence');assert.equal(digest({b:'2',a:'1'}),digest({a:'1',b:'2'}));assert.notEqual(digest({a:'1'}),digest({a:'2'}));
  for(const x of [{privateKey:'redacted'},{nested:{mnemonic:'redacted'}},{Authorization:'redacted'}])assert.throws(()=>assertSafe(x),/secret/i);
  assert.deepEqual(conservation({timestamp:10n,pool:3n,book:5n,debt:7n},{timestamp:10n,pool:5n,book:3n,debt:5n}),{cash:8n,nav:10n});
  assert.throws(()=>conservation({timestamp:10n,pool:3n,book:5n,debt:7n},{timestamp:11n,pool:5n,book:3n,debt:5n}),/timestamp/);
});
