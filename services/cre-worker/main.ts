import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {Worker,type Options} from './worker.ts';
import {runtimePorts} from './verify.ts';

const options:Options={dataDir:process.env.BELL_WORKER_DATA_DIR??'/data',jobsDir:process.env.BELL_WORKER_JOBS_DIR??'/jobs',mode:(process.env.BELL_WORKER_MODE??'dry-run') as Options['mode'],pollMs:Number(process.env.BELL_WORKER_POLL_MS??'5000')};
const args=process.argv.slice(2),controller=new AbortController();
let worker:Worker|undefined,stopping=false;
process.once('SIGTERM',()=>{stopping=true;controller.abort();});process.once('SIGINT',()=>{stopping=true;controller.abort();});
async function status(ready:boolean){
 const state=worker?await worker.status():undefined;
 const summary={ready,checkedAt:Date.now(),mode:options.mode,...(state?{pending:state.pending??null,jobs:Object.fromEntries(Object.entries(state.jobs).map(([id,r])=>[id,r.status]))}:{})};
 const path=join(options.dataDir,'status.json');await writeFile(path+'.tmp',JSON.stringify(summary)+'\n',{mode:0o600});await rename(path+'.tmp',path);
}
async function main(){
 if(args.length===1&&args[0]==='--health'){
  const s=JSON.parse(await readFile(join(options.dataDir,'status.json'),'utf8'));if(s.ready!==true||Date.now()-s.checkedAt>Math.max(180000,options.pollMs*3))throw Error('UNHEALTHY');return;
 }
 if(args.length&&!((args.length===1&&args[0]==='--once')||(args.length===2&&args[0]==='--reconcile')))throw Error('INVALID_ARGUMENTS');
 worker=await Worker.open(options,await runtimePorts(options.mode,controller.signal));await mkdir(join(options.dataDir,'home'),{recursive:true,mode:0o700});await mkdir(join(options.dataDir,'tmp'),{recursive:true,mode:0o700});
 try{
  if(args[0]==='--reconcile'){const accepted=await worker.reconcile(args[1]!);await status(true);console.log(JSON.stringify({status:accepted?'accepted':'pending',jobId:args[1]}));return;}
  while(!stopping){await status(true);await worker.tick();await status(true);if(args[0]==='--once')break;try{await delay(options.pollMs,undefined,{signal:controller.signal});}catch{break;}}
 }finally{await status(false);await worker.close();}
}
main().catch(()=>{console.error(JSON.stringify({status:'error',reason:'WORKER_STOPPED_CHECK_PRIVATE_STATE'}));process.exitCode=1;});
