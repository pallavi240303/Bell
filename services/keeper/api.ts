import {createServer} from 'node:http';
import {json} from './types.ts';
export function createApi(deps:{state:()=>Promise<unknown>;events:()=>Promise<unknown>;prepare:(input:any)=>Promise<unknown>}){
  return createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    try{
      let value:unknown;
      if(req.method==='GET'&&req.url==='/state')value=await deps.state();
      else if(req.method==='GET'&&req.url==='/events')value=await deps.events();
      else if(req.method==='GET'&&req.url==='/health')value={mode:'read-and-prepare',actorSigning:'connected-wallet'};
      else if(req.method==='POST'&&req.url==='/prepare'){
        let body='';for await(const chunk of req){body+=String(chunk);if(body.length>65536)throw Error('request too large');}
        value=await deps.prepare(JSON.parse(body));
      }else{res.statusCode=404;value={error:'route unavailable'};}
      res.end(json(value));
    }catch{res.statusCode=400;res.end(json({error:'invalid request or stale chain state; refresh required'}));}
  });
}
