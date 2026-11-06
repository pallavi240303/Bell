import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../api.ts';
test('review 4: browser events API forwards an explicit canonical state boundary',async()=>{
  let received:any;const hash=`0x${'ab'.repeat(32)}`;
  const server=createApi({state:async()=>({}),events:async(boundary:any)=>{received=boundary;return {block:boundary,events:[]};},prepare:async()=>({})} as any);
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as any).port;
  try{const response=await fetch(`http://127.0.0.1:${port}/events?blockNumber=2&blockHash=${hash}`);assert.equal(response.status,200);assert.deepEqual(received,{number:2n,hash});
    assert.equal((await fetch(`http://127.0.0.1:${port}/events?blockNumber=0x2&blockHash=${hash}`)).status,400);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
test('browser can read public manifest and watch its explicit connected address without authority',async()=>{
  const account=`0x${'ab'.repeat(20)}`;let watched:string[]=[];
  const server=createApi({state:async(watch:string[]=[])=>{watched=watch;return {block:{number:1n}};},events:async()=>[],prepare:async()=>({}),manifest:()=>({chainId:'31337'})} as any);
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as any).port;
  try{const manifest=await fetch(`http://127.0.0.1:${port}/manifest`);assert.equal(manifest.status,200);assert.equal((await manifest.json() as any).chainId,'31337');
    assert.equal((await fetch(`http://127.0.0.1:${port}/state?watch=${account}`)).status,200);assert.deepEqual(watched,[account]);
    assert.equal((await fetch(`http://127.0.0.1:${port}/state?watch=alice`)).status,400);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
