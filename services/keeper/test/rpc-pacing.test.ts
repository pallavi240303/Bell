import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import test from 'node:test';
import {clientFor} from '../config.ts';
const address=(i:number)=>`0x${i.toString(16).padStart(40,'0')}` as `0x${string}`;
async function server(handler:(requests:any[],res:any)=>void){
 const http=createServer(async(req,res)=>{let body='';for await(const part of req)body+=String(part);res.setHeader('content-type','application/json');handler(JSON.parse(body),res);});
 await new Promise<void>(r=>http.listen(0,'127.0.0.1',r));return {url:`http://127.0.0.1:${(http.address() as any).port}`,close:async()=>{http.closeAllConnections();await new Promise<void>(r=>http.close(()=>r()));}};
}
const results=(requests:any[])=>requests.map(r=>({jsonrpc:'2.0',id:r.id,result:r.params[0]}));
test('clientFor respects a real rolling RPC-call budget, counting each entry rather than HTTP requests',async()=>{
 const received:{time:number;count:number}[]=[],order:string[]=[];let rejected=0;
 const proxy=await server((requests,res)=>{const calls=Array.isArray(requests)?requests:[requests],now=Date.now(),cost=received.filter(x=>now-x.time<950).reduce((s,x)=>s+x.count,0);received.push({time:now,count:calls.length});order.push(...calls.map(r=>r.params[0]));if(cost+calls.length>6){rejected++;res.statusCode=429;res.setHeader('Retry-After','1');res.end(JSON.stringify(calls.map(r=>({jsonrpc:'2.0',id:r.id,error:{code:-32005,message:'rate limit exceeded'}}))));return;}res.end(JSON.stringify(results(calls)));});
 try{const client=clientFor(proxy.url),expected=Array.from({length:18},(_,i)=>address(i+1));const actual=await Promise.all(expected.map(a=>client.request({method:'eth_getBalance',params:[a,'latest']})));assert.deepEqual(actual,expected);assert.equal(rejected,0,'actual server budget is never exceeded');assert.deepEqual(order,expected,'RPC attempts remain FIFO');assert.ok(received.every(x=>x.count<=8));}finally{await proxy.close();}
});
test('native Retry-After is honored and a failed HTTP attempt re-enters the same FIFO budget',async()=>{
 const attempts:number[]=[];const proxy=await server((body,res)=>{const calls=Array.isArray(body)?body:[body];attempts.push(Date.now());if(attempts.length===1){res.statusCode=429;res.setHeader('Retry-After','1');res.end(JSON.stringify(calls.map(r=>({jsonrpc:'2.0',id:r.id,error:{code:-32005,message:'rate limit exceeded'}}))));return;}res.end(JSON.stringify(results(calls)));});
 try{const client=clientFor(proxy.url);assert.equal(await client.request({method:'eth_getBalance',params:[address(1),'latest']},{retryCount:1}),address(1));assert.equal(attempts.length,2);assert.ok(attempts[1]!-attempts[0]!>=950,'installed viem Retry-After delay remains in force');}finally{await proxy.close();}
});
test('queued aborts never dispatch and a failed attempt does not poison later work',async()=>{
 const seen:string[]=[];let fail=true;const proxy=await server((body,res)=>{const calls=Array.isArray(body)?body:[body];seen.push(...calls.map(r=>r.params[0]));res.end(JSON.stringify(calls.map(r=>fail&&r.params[0]===address(1)?{jsonrpc:'2.0',id:r.id,error:{code:-32602,message:'controlled invalid request'}}:{jsonrpc:'2.0',id:r.id,result:r.params[0]})));fail=false;});
 try{const client=clientFor(proxy.url);const first=Array.from({length:6},(_,i)=>client.request({method:'eth_getBalance',params:[address(i+1),'latest']},{retryCount:0}));const abort=new AbortController();const canceled=client.request({method:'eth_getBalance',params:[address(99),'latest']},{signal:abort.signal,retryCount:0});abort.abort();await assert.rejects(canceled,/abort/i);await Promise.allSettled(first);assert.equal(await client.request({method:'eth_getBalance',params:[address(7),'latest']},{retryCount:0}),address(7));assert.ok(!seen.includes(address(99)),'canceled queued call is never sent');}finally{await proxy.close();}
});

test('mixed cheap and unknown RPC attempts obey a weighted server budget while cheap catch-up exceeds six calls per window',async()=>{
 const observed:{time:number;cost:number;method:string}[]=[];let rejected=0;
 const proxy=await server((body,res)=>{const calls=Array.isArray(body)?body:[body],now=Date.now(),used=observed.filter(x=>now-x.time<950).reduce((sum,x)=>sum+x.cost,0);const weighted=calls.map(r=>({time:now,cost:['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode'].includes(r.method)?1:4,method:r.method}));if(used+weighted.reduce((sum,x)=>sum+x.cost,0)>24)rejected++;observed.push(...weighted);if(rejected){res.statusCode=429;res.setHeader('Retry-After','1');res.end(JSON.stringify(calls.map(r=>({jsonrpc:'2.0',id:r.id,error:{code:-32005,message:'weighted rate limit exceeded'}}))));return;}res.end(JSON.stringify(results(calls)));});
 try{const client=clientFor(proxy.url),requests=[...Array.from({length:24},(_,i)=>({method:'eth_getCode',params:[address(i+1),'latest']})),...Array.from({length:7},(_,i)=>({method:'unrecognized_read',params:[address(i+25)]})),...Array.from({length:6},(_,i)=>({method:'eth_getBalance',params:[address(i+32),'latest']}))];await Promise.all(requests.map(r=>client.request(r as any)));assert.equal(rejected,0,'unknown methods consume conservative heavy cost');const cheap=observed.filter(x=>x.method==='eth_getCode');assert.ok(cheap.some(start=>cheap.filter(x=>x.time>=start.time&&x.time-start.time<950).length>6),'cheap header/code catch-up is no longer throttled to six calls');}finally{await proxy.close();}
});
