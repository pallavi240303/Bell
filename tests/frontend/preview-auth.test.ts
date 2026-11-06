import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type IncomingMessage,type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Transport} from '../../src/adapter/transport.ts';
import {Controller} from '../../src/state/controller.ts';
const hash=`0x${'ab'.repeat(32)}` as const;
const COOKIE='__Host-sbx-session=preview-ok';
const frame={block:{number:'7',hash,timestamp:'100'},state:{pool:{activeLoanIds:['1']}}};
/** A same-origin gateway that behaves like Studio's preview authentication: no cookie, no API. */
async function gateway(requireCookie:boolean){
  const seen:Array<{url:string;cookie?:string;authorization?:string}>=[];
  const server:Server=createServer((req:IncomingMessage,res)=>{
    seen.push({url:req.url??'',cookie:req.headers.cookie,authorization:req.headers.authorization as string|undefined});
    if(requireCookie&&req.headers.cookie!==COOKIE){res.statusCode=403;res.setHeader('content-type','application/json');res.end('{"error":"forbidden"}');return;}
    res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url?.startsWith('/api/manifest')?{chainId:'5042002'}:frame));
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {server,origin,seen,close:()=>new Promise<void>(r=>server.close(()=>r()))};
}
/**
 * Models the Fetch standard's credentials mode for a page loaded from `pageOrigin`:
 * "omit" never attaches the cookie, "same-origin" attaches it only for the page's own origin.
 */
function browserFetch(pageOrigin:string,jar:string,log:Array<{url:string;credentials?:string}> = []):typeof fetch{
  return (async(input:any,init:any={})=>{
    const url=new URL(String(input),pageOrigin);log.push({url:url.href,credentials:init.credentials});
    const include=init.credentials==='include'||init.credentials==='same-origin'&&url.origin===pageOrigin;
    return fetch(url,{...init,headers:{...init.headers,...(include?{cookie:jar}:{})}});
  }) as typeof fetch;
}
test('an authenticated same-origin API read succeeds and carries the preview cookie',async()=>{
  const g=await gateway(true);try{
    const log:any[]=[];const transport=new Transport(`${g.origin}/api`,browserFetch(g.origin,COOKIE,log));
    const result=await transport.state();assert.equal(result.block.number,7n);assert.equal(result.block.hash,hash);
    assert.deepEqual(log.map(x=>x.credentials),['same-origin']);assert.equal(g.seen[0]!.cookie,COOKIE);
    assert.equal(g.seen[0]!.authorization,undefined);
    assert.equal((await transport.manifest()).chainId,'5042002');
  }finally{await g.close();}
});
test('regression guard: the former omit mode is what the authenticated preview rejects with 403',async()=>{
  const g=await gateway(true);try{
    const omit=(async(input:any,init:any)=>browserFetch(g.origin,COOKIE)(input,{...init,credentials:'omit'})) as typeof fetch;
    await assert.rejects(()=>new Transport(`${g.origin}/api`,omit).state(),/403/);assert.equal(g.seen[0]!.cookie,undefined);
  }finally{await g.close();}
});
test('a cross-origin read never receives the preview cookie or any authorization header',async()=>{
  const page=await gateway(true),other=await gateway(false);try{
    const transport=new Transport(`${other.origin}/api`,browserFetch(page.origin,COOKIE));
    const result=await transport.state();assert.equal(result.block.number,7n);
    assert.equal(other.seen[0]!.cookie,undefined);assert.equal(other.seen[0]!.authorization,undefined);assert.equal(page.seen.length,0);
  }finally{await page.close();await other.close();}
});
test('a failed authenticated read stays an error and never produces a snapshot',async()=>{
  const g=await gateway(true);try{
    const c=new Controller();c.manifest={chainId:'5042002'} as any;c.rpc={};
    c.transport=new Transport(`${g.origin}/api`,browserFetch(g.origin,'__Host-sbx-session=expired'));
    await assert.rejects(()=>c.refresh(),/Read\/preparation failed \(403\)/);
    assert.equal(c.frame,undefined);assert.deepEqual(c.events,[]);assert.equal(c.renderVals().labels.network,'UNVERIFIED');assert.equal(c.renderVals().bell.debtFmt,'—');
    await assert.rejects(()=>c.transport.prepare({a:1}),/403/);
  }finally{await g.close();}
});
test('malformed or unreachable API responses are errors, not fabricated state',async()=>{
  const bad=(async()=>new Response('{"state":{}}',{status:200})) as typeof fetch;
  await assert.rejects(()=>new Transport('/api',bad).state(),/provenance/);
  const down=(async()=>{throw new TypeError('fetch failed');}) as typeof fetch;
  await assert.rejects(()=>new Transport('/api',down).state(),/fetch failed/);
});
