import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture} from '../../../cre/bell-market-event/tests/fixtures.ts';
import {Worker, type WorkerPorts,type Frozen,type Proof} from '../worker.ts';

async function setup(mode:'broadcast'|'dry-run'='dry-run') {
 const dir=await mkdtemp(join(tmpdir(),'bell-worker-test-')),jobs=join(dir,'jobs'),data=join(dir,'data');await mkdir(jobs);
 const f=fixture(),job={id:'reopen-1',notBefore:'990',expiresAt:'1100',config:{...f.config,replay:f.bundle}};
 await writeFile(join(jobs,'one.json'),JSON.stringify(job));
 let calls=0,accepted=false;
 const ports:WorkerPorts={now:()=>1000n,prepare:async()=>({config:job.config as any,expected:{reportHash:'0x'+'1'.repeat(64),payload:'0x12',nonce:'3',previousStateHash:f.state.stateHash,assetId:f.config.assetId,sessionId:f.config.sessionId,kind:3,primarySourceHash:f.bundle.primary!.responseHash,secondarySourceHash:f.bundle.secondary!.responseHash},identity:{chainId:'31337',rpc:'http://127.0.0.1:1',sourceBlock:'1',sourceBlockHash:'0x'+'2'.repeat(64),oracle:f.config.oracle,registry:f.config.registry,receiver:f.config.simulationReceiver,forwarder:f.config.simulationForwarder,codeHashes:{},transmitter:f.config.workflowOwner}} as Frozen),invoke:async()=>{calls++;return {submitted:true};},verify:async()=>accepted?{transactionHash:'0x'+'3'.repeat(64),blockNumber:'2',blockHash:'0x'+'4'.repeat(64)} as Proof:undefined};
 const options={dataDir:data,jobsDir:jobs,mode,pollMs:5000};
 return {dir,jobs,data,job,ports,options,calls:()=>calls,accept:()=>{accepted=true;},cleanup:()=>rm(dir,{recursive:true,force:true})};
}

test('a completed dry run is durable across restart and never claimed accepted',async()=>{
 const f=await setup();try{const w=await Worker.open(f.options,f.ports);await w.tick();assert.equal(f.calls(),1);assert.equal((await w.status()).jobs['reopen-1']!.status,'dry-run');await w.close();const restarted=await Worker.open(f.options,f.ports);await restarted.tick();assert.equal(f.calls(),1);assert.equal((await restarted.status()).pending,undefined);await restarted.close();}finally{await f.cleanup();}
});
test('ambiguous broadcast blocks every other job and restart until canonical reconciliation',async()=>{
 const f=await setup('broadcast');try{let w=await Worker.open(f.options,f.ports);await w.tick();assert.equal((await w.status()).pending,'reopen-1');await w.close();await writeFile(join(f.jobs,'two.json'),JSON.stringify({...f.job,id:'reopen-2'}));w=await Worker.open(f.options,f.ports);await w.tick();assert.equal(f.calls(),1);assert.equal(await w.reconcile('reopen-1'),false);f.accept();assert.equal(await w.reconcile('reopen-1'),true);assert.equal((await w.status()).jobs['reopen-1']!.status,'accepted');await w.tick();assert.equal(f.calls(),2);await w.close();}finally{await f.cleanup();}
});
test('a CLI crash after dispatch preserves pending without logging private errors',async()=>{
 const f=await setup('broadcast');try{f.ports.invoke=async()=>{throw Error('PRIVATE_KEY_MUST_NOT_APPEAR');};const w=await Worker.open(f.options,f.ports);await w.tick();const state=await readFile(join(f.data,'state.json'),'utf8');assert.ok(!state.includes('PRIVATE_KEY'));assert.equal((await w.status()).pending,'reopen-1');await w.tick();assert.equal((await w.status()).pending,'reopen-1');await w.close();}finally{await f.cleanup();}
});
test('concurrent writers are rejected before dispatch',async()=>{
 const f=await setup();try{const w=await Worker.open(f.options,f.ports);await assert.rejects(Worker.open(f.options,f.ports),/WORKER_LOCKED/);assert.equal(f.calls(),0);await w.close();}finally{await f.cleanup();}
});
test('duplicate IDs, changed immutable jobs and symlinked files fail before dispatch',async()=>{
 const f=await setup();try{const w=await Worker.open(f.options,f.ports);await writeFile(join(f.jobs,'duplicate.json'),JSON.stringify(f.job));await assert.rejects(w.tick(),/DUPLICATE_JOB_ID/);assert.equal(f.calls(),0);await rm(join(f.jobs,'duplicate.json'));await w.tick();await writeFile(join(f.jobs,'one.json'),JSON.stringify({...f.job,expiresAt:'1200'}));await assert.rejects(w.tick(),/JOB_CHANGED/);await rm(join(f.jobs,'one.json'));await symlink(join(f.dir,'elsewhere'),join(f.jobs,'escape.json'));await assert.rejects(w.tick(),/JOB_PATH/);await w.close();}finally{await f.cleanup();}
});
test('future and expired jobs do not invoke and expiry is durable',async()=>{
 const f=await setup();try{await writeFile(join(f.jobs,'one.json'),JSON.stringify({...f.job,notBefore:'1001'}));const w=await Worker.open(f.options,f.ports);await w.tick();assert.equal(f.calls(),0);f.ports.now=()=>1101n;await w.tick();assert.equal((await w.status()).jobs['reopen-1']!.status,'expired');assert.equal(f.calls(),0);await w.close();}finally{await f.cleanup();}
});
test('prepare failure is terminal and raw upstream errors never persist',async()=>{
 const f=await setup();try{f.ports.prepare=async()=>{throw Error('SECRET_HTTP_URL');};const w=await Worker.open(f.options,f.ports);await w.tick();await w.tick();assert.equal(f.calls(),0);assert.equal((await w.status()).jobs['reopen-1']!.status,'rejected');assert.ok(!(await readFile(join(f.data,'state.json'),'utf8')).includes('SECRET_HTTP_URL'));await w.close();}finally{await f.cleanup();}
});
test('prototype-named job IDs remain independent durable records',async()=>{
 const f=await setup();try{await writeFile(join(f.jobs,'one.json'),JSON.stringify({...f.job,id:'constructor'}));const w=await Worker.open(f.options,f.ports);await w.tick();assert.equal((await w.status()).jobs['constructor']!.status,'dry-run');assert.equal(f.calls(),1);await w.close();}finally{await f.cleanup();}
});
test('state symlinks are refused and abandoned replica locks require explicit cleanup',async()=>{
 const f=await setup();try{await mkdir(f.data);await symlink(join(f.dir,'outside-state'),join(f.data,'state.json'));await assert.rejects(Worker.open(f.options,f.ports),/STATE_INVALID/);await rm(join(f.data,'state.json'));await mkdir(join(f.data,'.lock'));await writeFile(join(f.data,'.lock','owner.json'),JSON.stringify({pid:999999,host:'old-container'}));await assert.rejects(Worker.open(f.options,f.ports),/WORKER_LOCKED/);assert.equal(f.calls(),0);}finally{await f.cleanup();}
});
