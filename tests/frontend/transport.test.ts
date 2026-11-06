import test from 'node:test';
import assert from 'node:assert/strict';
async function module(){const m=await import('../../src/adapter/transport.ts').catch(()=>null);assert.ok(m,'transport required');return m;}
test('review 6: uint arrays retain the full ABI width independently of their array index',async()=>{
  const m=await module(),hash=`0x${'ab'.repeat(32)}`;
  const frame=m.decodeFrame({block:{number:'1',hash,timestamp:'2'},state:{pool:{activeLoanIds:['1','9007199254740993']}}});
  assert.deepEqual(frame.state.pool.activeLoanIds,[1n,9007199254740993n]);
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
  for(const debt of ['0x10',true,false,null,'01',1])assert.throws(()=>m.decodeFrame(wrap({loans:{'1':{debt}}})),/integer/);
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
  const m=await module();for(const debt of ['-1','1e3','banana',''])assert.throws(()=>m.decodeFrame({block:{number:'1',hash:`0x${'ab'.repeat(32)}`,timestamp:'1'},state:{loans:{'1':{debt}}}}),/integer/);
});

test('transient HTTP GET failures recover on attempt three with the same query and read options',async()=>{
  const m=await module(),hash=`0x${'ab'.repeat(32)}`,account=`0x${'cd'.repeat(20)}`;
  await Promise.all([400,429,502,503,504].map(async status=>{
    const requests:Array<{path:string;init:any;at:number}>=[];
    const transport=new m.Transport('/api',async(path:any,init:any)=>{requests.push({path,init,at:Date.now()});return requests.length<3?new Response('{"error":"stale"}',{status}):new Response(JSON.stringify({block:{number:'7',hash,timestamp:'100'},state:{}}));});
    const frame=await transport.state(account);assert.equal(frame.block.number,7n);assert.equal(requests.length,3);
    assert.ok(requests[1]!.at-requests[0]!.at>=900);assert.ok(requests[2]!.at-requests[1]!.at>=1800);
    for(const request of requests){assert.equal(request.path,`/api/state?watch=${account}`);assert.equal(request.init.method,'GET');assert.equal(request.init.credentials,'same-origin');assert.equal(request.init.cache,'no-store');assert.equal(request.init.body,undefined);}
  }));
});
test('read retries stop after three attempts and preserve the final HTTP error',async()=>{
  const m=await module(),statuses=[400,503,429];let calls=0;
  const transport=new m.Transport('/api',async()=>new Response('{}',{status:statuses[calls++]!}));
  await assert.rejects(()=>transport.manifest(),/Read\/preparation failed \(429\); refresh required/);assert.equal(calls,3);
});
test('authentication and missing-route GET failures are never retried',async()=>{
  const m=await module();for(const status of [401,403,404]){let calls=0;const transport=new m.Transport('/api',async()=>{calls++;return new Response('{}',{status});});await assert.rejects(()=>transport.manifest(),new RegExp(`\\(${status}\\)`));assert.equal(calls,1);}
});
test('unsigned preparation POSTs are never retried even for transient HTTP responses',async()=>{
  const m=await module();for(const status of [400,429,502,503,504]){let calls=0;const transport=new m.Transport('/api',async(_path:any,init:any)=>{calls++;assert.equal(init.method,'POST');assert.deepEqual(JSON.parse(init.body),{amount:'9007199254740993'});return new Response('{}',{status});});await assert.rejects(()=>transport.prepare({amount:9007199254740993n}),new RegExp(`\\(${status}\\)`));assert.equal(calls,1);}
});
test('successful HTTP responses with invalid JSON or financial provenance are not retried',async()=>{
  const m=await module(),hash=`0x${'ab'.repeat(32)}`;
  for(const body of ['{','{"state":{}}',JSON.stringify({block:{number:'7',hash,timestamp:'100'},state:{loans:{'1':{debt:'0x10'}}}})]){
    let calls=0;const transport=new m.Transport('/api',async()=>{calls++;return new Response(body);});await assert.rejects(()=>transport.state());assert.equal(calls,1);
  }
  let calls=0;const transport=new m.Transport('/api',async()=>{calls++;return new Response(JSON.stringify({block:{number:'7',hash,timestamp:'100'},events:[{blockNumber:'8',blockHash:hash,blockTimestamp:'100'}]}));});
  await assert.rejects(()=>transport.events({number:7n,hash:hash as `0x${string}`,timestamp:100n}),/boundary/);assert.equal(calls,1);
});
test('transport exceptions propagate without automatic retries',async()=>{
  const m=await module();let calls=0;const transport=new m.Transport('/api',async()=>{calls++;throw new TypeError('fetch failed');});await assert.rejects(()=>transport.manifest(),/fetch failed/);assert.equal(calls,1);
});
