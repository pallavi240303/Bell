import {constants} from 'node:fs';
import {open,mkdir,readdir,lstat,rename,unlink,readFile,rm} from 'node:fs/promises';
import {hostname} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {keccak256,toHex,type Hex} from 'viem';
import {canonical,validateConfig} from '../../cre/bell-market-event/src/core.ts';
import type {Config} from '../../cre/bell-market-event/src/schema.ts';
import type {ArcState} from '../../cre/bell-market-event/src/schema.ts';

export interface Job {id:string;notBefore:string;expiresAt:string;config:Config}
export interface Expected {reportHash:Hex;payload:Hex;nonce:string;previousStateHash:Hex;assetId:Hex;sessionId:Hex;kind:number;primarySourceHash:Hex;secondarySourceHash:Hex}
export interface Identity {chainId:string;rpc:string;sourceBlock:string;sourceBlockHash:Hex;oracle:Hex;registry:Hex;receiver:Hex;forwarder:Hex;codeHashes:Record<string,Hex>;transmitter?:Hex;operatorNonce?:number;wasmHash?:Hex}
export interface Frozen {config:Config;expected:Expected;identity:Identity;quote?:{state:ArcState;preparedAt:string;resultAt?:string;transactionHash?:Hex}}
export interface Proof {transactionHash:Hex;blockNumber:string;blockHash:Hex}
export interface WorkerPorts {now():bigint;prepare(job:Job):Promise<Frozen>;invoke(frozen:Frozen,directory:string,broadcast:boolean):Promise<{submitted:boolean;expected?:Expected;quote?:Frozen['quote']}>;verify(frozen:Frozen):Promise<Proof|undefined>}
export interface Options {dataDir:string;jobsDir:string;mode:'dry-run'|'broadcast';pollMs:number}
interface RecordJob {hash:Hex;status:'scheduled'|'expired'|'rejected'|'dispatching'|'pending'|'accepted'|'dry-run'|'failed';frozen?:Frozen;proof?:Proof}
export interface State {version:1;pending?:string;jobs:Record<string,RecordJob>}
const jobID=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/;
export function parseJob(value:unknown):Job {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_JOB');
 const j=value as Record<string,unknown>;
 if(Object.keys(j).sort().join(',')!=='config,expiresAt,id,notBefore'||typeof j.id!=='string'||!jobID.test(j.id))throw Error('INVALID_JOB');
 for(const key of ['notBefore','expiresAt'])if(typeof j[key]!=='string'||!/^(0|[1-9][0-9]*)$/.test(j[key] as string)||(j[key] as string).length>20)throw Error('INVALID_JOB_TIME');
 if(BigInt(j.notBefore as string)>=BigInt(j.expiresAt as string))throw Error('INVALID_JOB_TIME');
 const config=validateConfig(j.config);if(config.mode!=='replay')throw Error('SIMULATION_REPLAY_ONLY');
 return {id:j.id,notBefore:j.notBefore as string,expiresAt:j.expiresAt as string,config};
}
async function privateWrite(path:string,data:string){const f=await open(path,'wx',0o600);try{await f.writeFile(data);await f.sync();}finally{await f.close();}}
async function syncDirectory(path:string){const f=await open(path,'r');try{await f.sync();}finally{await f.close();}}
export class Worker {
 private state:State={version:1,jobs:Object.create(null)};
 private closed=false;
 private constructor(readonly options:Options,private ports:WorkerPorts,private lock:string){}
 static async open(options:Options,ports:WorkerPorts):Promise<Worker>{
  if(!['dry-run','broadcast'].includes(options.mode)||!Number.isInteger(options.pollMs)||options.pollMs<100)throw Error('INVALID_OPTIONS');
  options={...options,dataDir:resolve(options.dataDir),jobsDir:resolve(options.jobsDir)};
  await mkdir(options.dataDir,{recursive:true,mode:0o700});
  if(!(await lstat(options.dataDir)).isDirectory()||(await lstat(options.dataDir)).isSymbolicLink())throw Error('DATA_PATH');
  const lock=join(options.dataDir,'.lock');
  // A container PID/hostname cannot prove another replica is dead. Crash
  // recovery requires stopping the old container before lock-only cleanup.
  try{await mkdir(lock,{mode:0o700});}catch{throw Error('WORKER_LOCKED');}
  const w=new Worker(options,ports,lock);
  try{await privateWrite(join(lock,'owner.json'),JSON.stringify({pid:process.pid,host:hostname()}));try{const f=await open(join(options.dataDir,'state.json'),constants.O_RDONLY|constants.O_NOFOLLOW);let raw;try{const stat=await f.stat();if(!stat.isFile()||stat.size>8*1024*1024||(stat.mode&0o077)!==0||(process.getuid&&stat.uid!==process.getuid()))throw Error('STATE_INVALID');raw=JSON.parse(await f.readFile('utf8'));}finally{await f.close();}if(raw.version!==1||!raw.jobs||typeof raw.jobs!=='object'||Array.isArray(raw.jobs)||(raw.pending!==undefined&&(!jobID.test(raw.pending)||!Object.hasOwn(raw.jobs,raw.pending)||!raw.jobs[raw.pending]?.frozen)))throw Error('STATE_INVALID');for(const [id,r] of Object.entries(raw.jobs)){if(!jobID.test(id)||!r||typeof r!=='object'||!/^0x[0-9a-f]{64}$/.test((r as RecordJob).hash)||!['scheduled','expired','rejected','dispatching','pending','accepted','dry-run','failed'].includes((r as RecordJob).status))throw Error('STATE_INVALID');}w.state=raw;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw Error('STATE_INVALID');}await w.save();return w;}catch(e){await w.close();throw e;}
 }
 async status():Promise<State>{return structuredClone(this.state);}
 private async save(){const path=join(this.options.dataDir,'state.json'),temp=path+'.'+randomUUID();await privateWrite(temp,JSON.stringify(this.state,null,2)+'\n');await rename(temp,path);await syncDirectory(this.options.dataDir);}
 async close(){if(this.closed)return;this.closed=true;await rm(this.lock,{recursive:true,force:true});}
 async reconcile(id:string){
  if(this.state.pending!==id)throw Error('NOT_PENDING');const record=this.state.jobs[id]!;
  let proof;try{proof=await this.ports.verify(record.frozen!);}catch{return false;}
  if(!proof)return false;record.proof=proof;record.status='accepted';delete this.state.pending;await this.save();return true;
 }
 async tick(){
  const jobs:Job[]=[],seen=new Set<string>();
  for(const name of (await readdir(this.options.jobsDir)).sort()){
   if(!name.endsWith('.json'))continue;
   const path=join(this.options.jobsDir,name),stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>262144)throw Error('JOB_PATH');
   const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let value;try{value=JSON.parse(await f.readFile('utf8'));}finally{await f.close();}
   const job=parseJob(value);if(seen.has(job.id))throw Error('DUPLICATE_JOB_ID');seen.add(job.id);jobs.push(job);
  }
  // Validate the entire queue before any possible dispatch.
  for(const j of jobs){const hash=keccak256(toHex(canonical(j)));if(Object.hasOwn(this.state.jobs,j.id)&&this.state.jobs[j.id]!.hash!==hash)throw Error('JOB_CHANGED');}
  for(const j of jobs){if(!Object.hasOwn(this.state.jobs,j.id))this.state.jobs[j.id]={hash:keccak256(toHex(canonical(j))),status:'scheduled'};}await this.save();
  if(this.state.pending){await this.reconcile(this.state.pending);if(this.state.pending)return;}
  for(const j of jobs.sort((a,b)=>BigInt(a.notBefore)<BigInt(b.notBefore)?-1:BigInt(a.notBefore)>BigInt(b.notBefore)?1:a.id.localeCompare(b.id))){
   const r=this.state.jobs[j.id]!;if(r.status!=='scheduled')continue;
   const now=this.ports.now();if(now>=BigInt(j.expiresAt)){r.status='expired';await this.save();continue;}if(now<BigInt(j.notBefore))continue;
   try{r.frozen=await this.ports.prepare(j);}catch{r.status='rejected';await this.save();continue;}
   if(this.ports.now()>=BigInt(j.expiresAt)){r.status='expired';await this.save();continue;}
   const broadcast=this.options.mode==='broadcast';
   r.status=broadcast?'pending':'dispatching';if(broadcast)this.state.pending=j.id;await this.save();
   const directory=join(this.options.dataDir,'runs',j.id);await mkdir(directory,{recursive:true,mode:0o700});
   try{const result=await this.ports.invoke(r.frozen,directory,broadcast);if(result.expected&&result.quote){r.frozen.expected=result.expected;r.frozen.quote=result.quote;}if(!broadcast)r.status=result.submitted?'dry-run':'failed';}catch{if(!broadcast)r.status='failed';}
   await this.save();if(broadcast){await this.reconcile(j.id);if(this.state.pending)return;}
  }
 }
}
