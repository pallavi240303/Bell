import {createServer} from 'node:http';
import {json,rawUint,type Hex} from './types.ts';
export function createApi(deps:{state:(watch?:Hex[])=>Promise<unknown>;events:(boundary?:{number:bigint;hash:Hex})=>Promise<unknown>;prepare:(input:any)=>Promise<unknown>;manifest?:()=>unknown}){
  return createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    try{
      let value:unknown;
      const url=new URL(req.url??'/', 'http://localhost');
      if(req.method==='GET'&&url.pathname==='/state'){
        const watch=url.searchParams.getAll('watch');
        if(watch.length>8||watch.some(x=>!/^0x[0-9a-fA-F]{40}$/.test(x))||[...url.searchParams.keys()].some(k=>k!=='watch'))throw Error('explicit watch address required');
        value=await deps.state(watch as `0x${string}`[]);
      }
      else if(req.method==='GET'&&req.url==='/manifest'&&deps.manifest)value=deps.manifest();
      else if(req.method==='GET'&&url.pathname==='/events'){
        if([...url.searchParams.keys()].some(k=>!['blockNumber','blockHash'].includes(k)))throw Error('unknown boundary field');
        if(url.searchParams.size){
          const number=rawUint(url.searchParams.get('blockNumber')),hash=url.searchParams.get('blockHash');
          if(url.searchParams.size!==2||!hash||!/^0x[0-9a-fA-F]{64}$/.test(hash))throw Error('canonical boundary required');
          value=await deps.events({number,hash:hash as Hex});
        }else value=await deps.events();
      }
      else if(req.method==='GET'&&req.url==='/health')value={mode:'read-and-prepare',actorSigning:'connected-wallet'};
      else if(req.method==='POST'&&req.url==='/prepare'){
        let body='';for await(const chunk of req){body+=String(chunk);if(body.length>65536)throw Error('request too large');}
        value=await deps.prepare(JSON.parse(body));
      }else{res.statusCode=404;value={error:'route unavailable'};}
      res.end(json(value));
    }catch{res.statusCode=400;res.end(json({error:'invalid request or stale chain state; refresh required'}));}
  });
}
