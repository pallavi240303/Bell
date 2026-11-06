import test from 'node:test';
import assert from 'node:assert/strict';
async function module(){const m=await import('../../src/adapter/transport.ts').catch(()=>null);assert.ok(m,'transport required');return m;}
test('snapshot decoder keeps one complete block provenance and bigint financial frame',async()=>{
  const m=await module();const frame=m.decodeFrame({block:{number:'7',hash:`0x${'ab'.repeat(32)}`,timestamp:'100'},state:{pool:{totalAssets:'9007199254740993'},offers:{}}});
  assert.equal(frame.state.pool.totalAssets,9007199254740993n);assert.equal(frame.block.number,7n);
  for(const input of [{block:{number:7},state:{}},{block:{number:'7',hash:'0x00',timestamp:'1'},state:{}},{block:{number:'7',hash:`0x${'ab'.repeat(32)}`,timestamp:'1'},state:{debt:12}}])assert.throws(()=>m.decodeFrame(input));
});
test('transport uses only unsigned prepare and read paths with canonical strings and no credentials',async()=>{
  const m=await module();const requests:any[]=[];const transport=new m.Transport('/api',async(path:any,init:any)=>{requests.push({path,init});return new Response(JSON.stringify({ok:true}),{status:200});});
  await transport.prepare({amount:9007199254740993n});assert.equal(JSON.parse(requests[0].init.body).amount,'9007199254740993');assert.equal(requests[0].path,'/api/prepare');assert.equal(requests[0].init.headers.Authorization,undefined);
});
test('browser fetch retains its global receiver instead of the Transport instance',async()=>{
  const m=await module();const transport=new m.Transport('/api',async function(this:unknown){assert.equal(this,globalThis);return new Response('{}');} as any);await transport.manifest();
});
test('financial snapshot values reject negative, scientific, and arbitrary string amounts',async()=>{
  const m=await module();for(const debt of ['-1','1e3','banana',''])assert.throws(()=>m.decodeFrame({block:{number:'1',hash:`0x${'ab'.repeat(32)}`,timestamp:'1'},state:{receipts:{'1':{debt}}}}),/integer/);
});
