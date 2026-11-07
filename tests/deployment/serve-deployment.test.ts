import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest,createServer,type IncomingHttpHeaders,type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localNode,deployLocal} from '../../scripts/keeper-local.ts';
import {clientFor} from '../../services/keeper/config.ts';
import {contracts} from '../../services/keeper/abi.ts';
import {json} from '../../services/keeper/types.ts';
// @ts-expect-error plain ESM module without declarations
import {createDeploymentServer,resolveAsset,RPC_METHODS,UPSTREAM_RPC,DEPLOYMENT_PATH,EXPECTED_CHAIN_ID} from '../../scripts/serve-deployment.mjs';

const root=new URL('../../',import.meta.url).pathname;
let node:Awaited<ReturnType<typeof localNode>>,deployment:any,proxy:Server,proxyUrl:string;
const upstream:{methods:string[];headers:IncomingHttpHeaders[]}={methods:[],headers:[]};
const open:Server[]=[];
/** A recording hop in front of the owned Anvil node: shows exactly what the server forwards. */
before(async()=>{
  node=await localNode();deployment=(await deployLocal(node)).deployment;
  const target=(node.client as any).transport.url as string;
  proxy=createServer(async(req,res)=>{
    let text='';for await(const part of req)text+=String(part);
    const body=JSON.parse(text);for(const item of Array.isArray(body)?body:[body])upstream.methods.push(item.method);upstream.headers.push(req.headers);
    const response=await fetch(target,{method:'POST',headers:{'content-type':'application/json'},body:text});
    res.setHeader('content-type','application/json');res.end(await response.text());
  });
  await new Promise<void>(r=>proxy.listen(0,'127.0.0.1',r));proxyUrl=`http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
});
after(async()=>{for(const s of open)await new Promise<void>(r=>{s.closeAllConnections();s.close(()=>r());});proxy.closeAllConnections();await new Promise<void>(r=>proxy.close(()=>r()));await node.stop();});
function dist(){
  const dir=mkdtempSync(join(tmpdir(),'bell-dist-'));mkdirSync(join(dir,'assets'));mkdirSync(join(dir,'fonts'));
  writeFileSync(join(dir,'index.html'),'<!doctype html><title>BELL</title>');writeFileSync(join(dir,'assets','app-1.js'),'console.log(1)');writeFileSync(join(dir,'fonts','f.woff2'),'font');
  writeFileSync(join(dir,'.env'),'SECRET=1');writeFileSync(join(dir,'notes.md'),'private');writeFileSync(join(tmpdir(),'bell-outside-secret.js'),'outside');
  symlinkSync(join(tmpdir(),'bell-outside-secret.js'),join(dir,'link.js'));
  const outside=mkdtempSync(join(tmpdir(),'bell-outside-'));writeFileSync(join(outside,'secret.js'),'outside');symlinkSync(outside,join(dir,'linked-directory'));return dir;
}
async function start(over:{deployment?:any;indexPath?:string;dist?:string}={}){
  const indexPath=over.indexPath??join(mkdtempSync(join(tmpdir(),'bell-idx-')),'index.json');
  const app=createDeploymentServer({deployment:over.deployment??deployment,client:clientFor(proxyUrl),indexPath,distDir:over.dist??dist()});
  await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));open.push(app.server);
  return {app,indexPath,base:`http://127.0.0.1:${(app.server.address() as AddressInfo).port}`,close:()=>new Promise<void>(r=>{app.server.closeAllConnections();app.server.close(()=>r());})};
}
function raw(base:string,path:string,method='GET',headers:Record<string,string>={},body?:string){
  return new Promise<{status:number;headers:IncomingHttpHeaders;body:string}>((resolve,reject)=>{
    const url=new URL(base),req=httpRequest({host:url.hostname,port:url.port,path,method,headers},res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers,body:text}));});
    req.on('error',reject);req.end(body);
  });
}
const rpc=(base:string,body:unknown,headers:Record<string,string>={})=>raw(base,'/rpc','POST',{'content-type':'application/json',...headers},JSON.stringify(body));

test('cold start with an empty index verifies the deployment, then serves a canonical state and events',async()=>{
  const s=await start();await s.app.ready;
  const health=JSON.parse((await raw(s.base,'/healthz')).body);assert.equal(health.status,'ready');assert.ok(health.indexedBlocks>0);assert.equal(health.cursorBlock,(await node.client.getBlockNumber()).toString());assert.equal(health.deploymentBlock,deployment.deploymentBlock);
  const manifest=await raw(s.base,'/api/manifest');assert.equal(manifest.status,200);assert.deepEqual(JSON.parse(manifest.body),deployment);assert.equal(manifest.headers['cache-control'],'no-store');
  const head=await node.client.getBlock();
  const state=await raw(s.base,'/api/state');assert.equal(state.status,200);const frame=JSON.parse(state.body);
  assert.equal(frame.block.number,head.number.toString());assert.equal(frame.block.hash,head.hash);assert.equal(frame.block.timestamp,head.timestamp.toString());
  const events=await raw(s.base,`/api/events?blockNumber=${frame.block.number}&blockHash=${frame.block.hash}`);assert.equal(events.status,200);assert.equal(JSON.parse(events.body).block.hash,head.hash);
  assert.equal((await raw(s.base,'/api/events?blockNumber=1')).status,400);
  const stored=JSON.parse(readFileSync(s.indexPath,'utf8'));assert.equal(stored.cursor.blockHash,head.hash);assert.ok(stored.blocks.every((b:any)=>b.projection.discoveryOnly===true));
  assert.equal(json(stored.deployment),json(deployment));
  await s.close();
});
test('restart resumes from the persisted cursor and never rewinds or reseeds it',async()=>{
  const first=await start();await first.app.ready;await raw(first.base,'/api/state');
  const before=JSON.parse(readFileSync(first.indexPath,'utf8'));await first.close();
  await node.time(BigInt((await node.client.getBlock()).timestamp)+5n);
  const second=await start({indexPath:first.indexPath});await second.app.ready;
  const health=JSON.parse((await raw(second.base,'/healthz')).body);assert.ok(BigInt(health.cursorBlock)>=BigInt(before.cursor.blockNumber));assert.ok(health.indexedBlocks>=before.blocks.length);
  const head=await node.client.getBlock();const state=JSON.parse((await raw(second.base,'/api/state')).body);assert.equal(state.block.hash,head.hash);
  const after=JSON.parse(readFileSync(second.indexPath,'utf8'));assert.equal(after.blocks[0].header.hash,before.blocks[0].header.hash);assert.ok(after.blocks.length>=before.blocks.length);
  await second.close();
});
test('a wrong code hash fails startup, keeps /api and /rpc unavailable, and never fakes readiness',async()=>{
  const bad={...deployment,codeHashes:{...deployment.codeHashes,pool:`0x${'11'.repeat(32)}`}};
  const s=await start({deployment:bad});await assert.rejects(()=>s.app.ready,/code mismatch/);
  const health=await raw(s.base,'/healthz');assert.equal(health.status,503);assert.equal(JSON.parse(health.body).status,'failed');
  for(const path of ['/api/state','/api/manifest','/rpc'])assert.equal((await raw(s.base,path,path==='/rpc'?'POST':'GET',{},path==='/rpc'?'{}':undefined)).status,503);
  assert.equal((await raw(s.base,'/')).status,200);assert.equal(existsSync(s.indexPath),false);await s.close();
});
test('an index written for a different deployment is refused instead of being adopted',async()=>{
  const a=await start();await a.app.ready;await raw(a.base,'/api/state');await a.close();
  const moved={...deployment,deploymentBlock:String(BigInt(deployment.deploymentBlock)+1n)};
  const b=await start({deployment:moved,indexPath:a.indexPath});await assert.rejects(()=>b.app.ready,/identity mismatch/);
  assert.equal(JSON.parse((await raw(b.base,'/healthz')).body).status,'failed');assert.equal((await raw(b.base,'/api/state')).status,503);await b.close();
});
test('/rpc forwards only an allowlisted read-only set, through the one paced client, without browser credentials',async()=>{
  const s=await start();await s.app.ready;upstream.methods.length=0;upstream.headers.length=0;
  const ok=await rpc(s.base,{jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]},{cookie:'__Host-sbx-session=x',authorization:'Bearer secret'});
  assert.equal(JSON.parse(ok.body).result,'0x7a69');
  const forbidden=['eth_sendRawTransaction','eth_sendTransaction','eth_sign','eth_signTransaction','eth_signTypedData_v4','personal_sign','personal_unlockAccount','wallet_addEthereumChain','wallet_switchEthereumChain','eth_accounts','eth_requestAccounts','anvil_setBalance','anvil_impersonateAccount','evm_mine','debug_traceTransaction','admin_nodeInfo','txpool_content','eth_subscribe'];
  const sent=upstream.methods.length;
  const calls=[{jsonrpc:'2.0',id:7,method:'eth_blockNumber'},...forbidden.map((method,i)=>({jsonrpc:'2.0',id:100+i,method,params:[]}))];
  const batch:any[]=[];for(let offset=0;offset<calls.length;offset+=8)batch.push(...JSON.parse((await rpc(s.base,calls.slice(offset,offset+8))).body));
  assert.equal(batch.length,forbidden.length+1);assert.ok(/^0x/.test(batch[0].result));
  for(const [i,method] of forbidden.entries()){assert.equal(batch[i+1].error.code,-32601,method);assert.equal(batch[i+1].id,100+i);assert.equal(batch[i+1].result,undefined);}
  assert.ok(upstream.methods.slice(sent).every(m=>RPC_METHODS.has(m)),'only allowlisted methods reached the upstream');
  assert.equal(upstream.methods.some(m=>forbidden.includes(m)),false);
  assert.ok(upstream.headers.every(h=>h.cookie===undefined&&h.authorization===undefined),'no cookie or authorization header reaches the upstream');
  for(const method of RPC_METHODS)assert.doesNotMatch(method,/send|sign|personal|wallet|debug|admin|anvil|evm|subscribe|accounts/i);
  await s.close();
});
test('/rpc rejects wrong methods, cross-origin posts, oversized and malformed bodies',async()=>{
  const s=await start();await s.app.ready;
  assert.equal((await raw(s.base,'/rpc')).status,405);assert.equal((await raw(s.base,'/rpc','PUT')).status,405);
  assert.equal((await rpc(s.base,{jsonrpc:'2.0',id:1,method:'eth_chainId'},{origin:'https://evil.example'})).status,403);
  assert.equal((await rpc(s.base,{jsonrpc:'2.0',id:1,method:'eth_chainId'},{origin:s.base})).status,200);
  assert.equal((await raw(s.base,'/rpc','POST',{},'{not json')).status,400);
  assert.equal((await raw(s.base,'/rpc','POST',{},JSON.stringify({pad:'x'.repeat(70000)}))).status,413);
  assert.equal((await rpc(s.base,[])).status,400);
  for(const item of [{jsonrpc:'1.0',id:1,method:'eth_chainId'},{jsonrpc:'2.0',id:1,method:'eth_chainId',url:'https://example.com'},{jsonrpc:'2.0',id:1.5,method:'eth_chainId'}])assert.equal(JSON.parse((await rpc(s.base,item)).body).error.code,-32600);
  assert.equal((await raw(s.base,'/rpc?url=https://example.com','POST',{},JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId'}))).status,400);assert.equal((await rpc(s.base,Array.from({length:9},(_,i)=>({jsonrpc:'2.0',id:i,method:'eth_chainId'})))).status,400);
  assert.equal(JSON.parse((await rpc(s.base,{jsonrpc:'2.0',id:1,method:'eth_chainId',params:'x'})).body).error.code,-32602);
  assert.equal(JSON.parse((await rpc(s.base,'x' as any)).body).error.code,-32600);
  await s.close();
});
test('/api exposes only the keeper read routes and unsigned prepare, never other methods or paths',async()=>{
  const s=await start();await s.app.ready;
  for(const [method,path] of [['GET','/api/prepare'],['POST','/api/state'],['DELETE','/api/state'],['GET','/api/replay/play'],['POST','/api/manifest']] as const)assert.equal((await raw(s.base,path,method,{},method==='POST'?'{}':undefined)).status,404,`${method} ${path}`);
  assert.equal((await raw(s.base,'/api/prepare','POST',{origin:'https://evil.example'},'{}')).status,403);
  const [invalid,prepared]=await Promise.all([raw(s.base,'/api/prepare','POST',{origin:s.base},'{"contract":"pool","method":"mint","args":[]}'),raw(s.base,'/api/prepare','POST',{origin:s.base},JSON.stringify({chainId:'31337',from:node.actors[1],approval:'deposit',amount:'1'}))]);
  assert.equal(invalid.status,400);assert.equal(prepared.status,200);
  const unsigned=JSON.parse(prepared.body);assert.equal(unsigned.chainId,'31337');assert.equal(unsigned.from,node.actors[1]);assert.equal(unsigned.to,deployment.addresses.cash);assert.equal(unsigned.value,'0');
  assert.equal(unsigned.data,`0x095ea7b3${deployment.addresses.pool.slice(2).padStart(64,'0')}${'1'.padStart(64,'0')}`);
  assert.equal(unsigned.sourceBlockHash,(await node.client.getBlock({blockNumber:BigInt(unsigned.sourceBlock)})).hash);
  assert.deepEqual(Object.keys(unsigned).sort(),['chainId','data','from','sourceBlock','sourceBlockHash','to','value']);
  assert.equal(JSON.parse((await raw(s.base,'/api/health')).body).actorSigning,'connected-wallet');
  await s.close();
});
test('only built frontend assets are served: no source, dotfiles, traversal, symlinks or runtime files',async()=>{
  const dir=dist(),s=await start({dist:dir});await s.app.ready;
  const index=await raw(s.base,'/');assert.equal(index.status,200);assert.match(index.body,/BELL/);assert.equal(index.headers['x-content-type-options'],'nosniff');assert.equal(index.headers['content-type'],'text/html; charset=utf-8');
  const asset=await raw(s.base,'/assets/app-1.js');assert.equal(asset.status,200);assert.match(String(asset.headers['cache-control']),/immutable/);
  assert.equal((await raw(s.base,'/fonts/f.woff2')).headers['content-type'],'font/woff2');
  assert.equal((await raw(s.base,'/some/client/route')).body,index.body);
  const head=await raw(s.base,'/','HEAD');assert.equal(head.status,200);assert.equal(head.body,'');
  for(const path of ['/linked-directory/secret.js','/.env','/assets/.env','/%2e%2eenv','/%2e%2e/%2e%2e/etc/passwd','/..%2f..%2fetc%2fpasswd','/assets/../../package.json','/src/main.tsx','/services/keeper/cli.ts','/deployments/arc-optional-cover.json','/out/CoverManager.sol/CoverManager.json','/services/keeper/runs/index.json','/index.json','/notes.md','/link.js','/missing.js','/%00','/assets%5C..%5C..%5Cpackage.json','/.git/config'])
    {const r=await raw(s.base,path);assert.ok([403,404].includes(r.status)||r.status===200&&r.body===index.body,`${path} -> ${r.status}`);assert.doesNotMatch(r.body,/SECRET|outside|private|passwd|compilerOptions/,path);}
  assert.equal((await raw(s.base,'/','POST',{},'{}')).status,405);
  assert.equal(resolveAsset(dir,'/..'),null);assert.equal(resolveAsset(dir,'/link.js'),null);assert.equal(resolveAsset(dir,'/linked-directory/secret.js'),null);assert.equal(resolveAsset(dir,'/.env'),null);
  await s.close();
});
test('the server pins one fixed upstream and the Arc manifest; nothing is configurable from the environment',()=>{
  assert.equal(UPSTREAM_RPC,'https://rpc.testnet.arc.io');assert.equal(EXPECTED_CHAIN_ID,'5042002');
  const source=readFileSync(`${root}scripts/serve-deployment.mjs`,'utf8');
  assert.doesNotMatch(source,/process\.env\.(RPC|UPSTREAM|DEPLOYMENT|PRIVATE|KEY|SECRET|ETH_RPC)/i);
  const arc=JSON.parse(readFileSync(DEPLOYMENT_PATH,'utf8'));assert.equal(arc.chainId,'5042002');assert.equal(arc.deploymentBlock,'71021459');
});
test('image builds generated artifacts from source and keeps private/runtime inputs excluded',()=>{
  const ignore=readFileSync(`${root}.dockerignore`,'utf8').split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));
  assert.equal(ignore[0],'**','default-deny context');const allowed=ignore.filter(l=>l.startsWith('!')).map(l=>l.slice(1));
  assert.ok(allowed.includes('contracts/src/**'));assert.ok(allowed.includes('services/keeper/discovery.ts'));
  assert.equal(allowed.some(p=>p==='out'||p.startsWith('out/')),false,'host artifacts excluded');
  for(const forbidden of ['.env','.git','.agents','deployments/runs','services/keeper/runs','evidence','cache','dist','node_modules','tests','.circle'])assert.equal(allowed.some(p=>p===forbidden||p.startsWith(`${forbidden}/`)||p.startsWith(`${forbidden}*`)),false,`${forbidden} must not be allowlisted`);
  assert.equal(allowed.some(p=>/(^|\/)\.env|\.pem|journal|recovery|index\.json|secret|key/i.test(p)),false);
  assert.ok(allowed.includes('deployments/arc-optional-cover.json'));assert.ok(allowed.includes('scripts/serve-deployment.mjs'));
  const docker=readFileSync(`${root}Dockerfile.vercel`,'utf8');
  assert.match(docker,/ENV[^\n]*PORT=3000/);assert.match(docker,/EXPOSE 3000/);assert.match(docker,/serve-deployment\.mjs/);
  assert.doesNotMatch(docker,/COPY\s+\.\s|ADD\s|\.env|PRIVATE|SECRET|API_KEY|ARG\s/i);
});

test('a cold-start API call waits for verification instead of permanently failing the first browser request',async()=>{
  await node.request('anvil_setChainId',[31337]);
  const s=await start();
  const response=await raw(s.base,'/api/manifest');
  assert.equal(response.status,200);assert.deepEqual(JSON.parse(response.body),deployment);
  await s.close();
});
test('startup verification has a finite deadline and leaves read endpoints honestly unavailable',{timeout:2000},async()=>{
  const app=createDeploymentServer({deployment,client:{getChainId:()=>new Promise(()=>{}),getBlock:()=>new Promise(()=>{})},indexPath:join(mkdtempSync(join(tmpdir(),'bell-timeout-')),'index.json'),distDir:dist(),startupTimeoutMs:25});
  await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));open.push(app.server);
  const base=`http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const response=await raw(base,'/api/manifest');assert.equal(response.status,503);
  await assert.rejects(app.ready,/startup timeout/);
  assert.equal((await raw(base,'/healthz')).status,503);
  app.server.closeAllConnections();await new Promise<void>(r=>app.server.close(()=>r()));
});

test('a rate-limited history scan retries while verified lenders can prepare before the index is ready',async()=>{
  let reads=0,unblock!:()=>void,started!:()=>void;
  const gate=new Promise<void>(r=>unblock=r),failed=new Promise<void>(r=>started=r);
  const client={...node.client,getLogs:async(params:any)=>{if(++reads===1){started();throw Object.assign(Error('Request exceeds defined limit.'),{code:-32005});}await gate;return node.client.getLogs(params);}};
  const app=createDeploymentServer({deployment,client,indexPath:join(mkdtempSync(join(tmpdir(),'bell-retry-')),'index.json'),distDir:dist()});
  await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));open.push(app.server);
  const base=`http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  try{await failed;const approval=await raw(base,'/api/prepare','POST',{},JSON.stringify({chainId:deployment.chainId,from:node.actors[1],approval:'deposit',amount:'10000000'}));assert.equal(approval.status,200);assert.equal((await raw(base,'/healthz')).status,503);unblock();await app.ready;assert.ok(reads>=2);}
  finally{unblock();app.server.closeAllConnections();await new Promise<void>(r=>app.server.close(()=>r()));}
});

// Uses the real keeper against an owned local chain with the public chain ID; no public RPC is contacted.
test('public-chain startup discovers thousands of empty finalized blocks sparsely before readiness',async()=>{
  await node.request('anvil_setChainId',[5042002]);
  for(let i=0;i<8;i++)await node.request('anvil_mine',['0x200']);
  const publicDeployment={...deployment,chainId:'5042002'};
  const sent=upstream.methods.length,s=await start({deployment:publicDeployment});await s.app.ready;
  const health=JSON.parse((await raw(s.base,'/healthz')).body);
  assert.equal(health.status,'ready');assert.equal(health.cursorBlock,(await node.client.getBlock({blockTag:'finalized'})).number.toString());
  assert.ok(upstream.methods.slice(sent).filter(m=>m==='eth_getBlockByNumber').length<40,'sparse discovery must not fetch every empty header');
  const stored=JSON.parse(readFileSync(s.indexPath,'utf8'));
  assert.ok(stored.blocks.some((b:any)=>b.evidence?.[0]?.mode==='finalized'));
  assert.ok(stored.blocks.length<20);
  const state=JSON.parse((await raw(s.base,'/api/state')).body);assert.equal(state.block.number,health.cursorBlock);
  await s.close();
});
