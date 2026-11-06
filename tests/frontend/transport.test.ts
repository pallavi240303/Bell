import test from 'node:test';
import assert from 'node:assert/strict';
async function module(){const m=await import('../../src/adapter/transport.ts').catch(()=>null);assert.ok(m,'transport required');return m;}
test('review 6: uint arrays retain the full ABI width independently of their array index',async()=>{
  const m=await module(),hash=`0x${'ab'.repeat(32)}`;
  const frame=m.decodeFrame({block:{number:'1',hash,timestamp:'2'},state:{pool:{activeReceiptIds:['1','9007199254740993']}}});
  assert.deepEqual(frame.state.pool.activeReceiptIds,[1n,9007199254740993n]);
});
test('review 4: event schema supports generated ABI name variants without accepting malformed financial args',async()=>{
  const m=await module(),hash=`0x${'ab'.repeat(32)}`,account=`0x${'ab'.repeat(20)}`;
  const event=(args:any)=>({block:{number:'2',hash,timestamp:'20'},events:[{blockNumber:'1',blockHash:hash,blockTimestamp:'10',decoded:{eventName:'Transfer',args}}]});
  for(const field of ['value','amount'])assert.equal(m.decodeEvidence(event({from:account,to:account,[field]:'16'})).events[0]!.decoded.args[field],16n);
  assert.throws(()=>m.decodeEvidence(event({from:account,to:account,amount:'0x10'})));
});
test('review 6: schema rejects hex, boolean and null money while preserving explicit identifiers',async()=>{
  const m=await module(),hash=`0x${'ab'.repeat(32)}`,account=`0x${'ab'.repeat(20)}`;
  const wrap=(state:any)=>({block:{number:'1',hash,timestamp:'2'},state});
  for(const debt of ['0x10',true,false,null,'01',1])assert.throws(()=>m.decodeFrame(wrap({receipts:{'1':{debt}}})),/integer/);
  for(const cash of ['0x10',true,null])assert.throws(()=>m.decodeFrame(wrap({balances:{[account]:{cash}}})),/integer/);
  const frame=m.decodeFrame(wrap({termsHashes:{[hash]:hash},balances:{[account]:{cash:'16',restricted:false}},tokens:{stock:{symbol:'0x10',decimals:'18',paused:false}}}));
  assert.equal(frame.state.termsHashes[hash],hash);assert.equal(frame.state.balances[account].cash,16n);assert.equal(frame.state.tokens.stock.symbol,'0x10');
  assert.throws(()=>m.decodeFrame(wrap({termsHashes:{[hash]:'16'}})));
  assert.throws(()=>m.decodeFrame(wrap({balances:{[account]:{unexpected:'3'}}})));
});
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
