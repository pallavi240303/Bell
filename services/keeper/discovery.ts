import {decodeEventLog,formatLog,toEventSelector,toHex} from 'viem';
import {artifact,contracts} from './abi.ts';
import {integers,json,raw,rawUint,type Header} from './types.ts';
import type {Store,StoredBlock} from './store.ts';
const RANGE=2048n,CONCURRENCY=8;
const hash=/^0x[0-9a-fA-F]{64}$/,address=/^0x[0-9a-fA-F]{40}$/,bytes=/^0x(?:[0-9a-fA-F]{2})*$/;
const cashTopics=[toEventSelector('Transfer(address,address,uint256)'),toEventSelector('Approval(address,address,uint256)')];
type Identity={number:string;hash:string};
type Scope={protocol:string[];cash:string;topics:string[];endpoints:string[]};
type Coverage={version:1;mode:'finalized';from:string;to:string;previous:Identity|null;finalized:Identity;scope:Scope;selected:Identity[]};
type Segment={start:number;end:number;sparse:boolean};
const identity=(h:{number:bigint|string;hash:string}):Identity=>({number:String(h.number),hash:h.hash});
function header(value:any,number?:bigint):Header{
 if(!value||typeof value.number!=='bigint'||value.number<0n||number!==undefined&&value.number!==number||!hash.test(value.hash)||!hash.test(value.parentHash)||typeof value.timestamp!=='bigint'||value.timestamp<0n)throw Error('missing or malformed canonical header');
 return {number:value.number,hash:value.hash,parentHash:value.parentHash,timestamp:value.timestamp};
}
/** Drain the bounded read batch before allowing a failed sync to be retried. */
async function headers(numbers:bigint[],rpc:any):Promise<Header[]>{
 const result:Header[]=[];let next=0,failed=false,failure:unknown;
 await Promise.all(Array.from({length:Math.min(CONCURRENCY,numbers.length)},async()=>{while(!failed&&next<numbers.length){const i=next++;try{result[i]=header(await rpc.getBlock({blockNumber:numbers[i]}),numbers[i]);}catch(error){failed=true;failure=error;}}}));
 if(failed)throw failure;return result;
}
function scopeFor(store:Store):Scope{
 const cash=store.deployment.addresses.cash?.toLowerCase(),protocol=Object.values(store.deployment.addresses).map(a=>a.toLowerCase()).filter(a=>a!==cash).sort();
 if(!cash||!address.test(cash)||!protocol.length||protocol.some(a=>!address.test(a)))throw Error('invalid discovery scope');
 return {cash,protocol,topics:cashTopics,endpoints:protocol.map(a=>`0x${a.slice(2).padStart(64,'0')}`)};
}
function validLog(log:any,from:bigint,to:bigint,scope:Scope,cashEndpoint?:number){
 if(!log||typeof log.blockNumber!=='bigint'||log.blockNumber<from||log.blockNumber>to||!hash.test(log.blockHash)||!hash.test(log.transactionHash)||!Number.isSafeInteger(log.transactionIndex)||log.transactionIndex<0||!Number.isSafeInteger(log.logIndex)||log.logIndex<0||log.removed!==undefined&&log.removed!==false||!address.test(log.address)||!bytes.test(log.data)||!Array.isArray(log.topics)||log.topics.length>4||log.topics.some((t:any)=>typeof t!=='string'||!hash.test(t)))throw Error('malformed log provenance');
 const emitter=log.address.toLowerCase();
 if(cashEndpoint!==undefined){
  if(emitter!==scope.cash||log.topics.length!==3||!scope.topics.includes(log.topics[0].toLowerCase())||!/^0x[0-9a-fA-F]{64}$/.test(log.data)||!log.topics.slice(1).every((t:string)=>/^0x0{24}[0-9a-fA-F]{40}$/.test(t))||!scope.endpoints.includes(log.topics[cashEndpoint].toLowerCase()))throw Error('cash log outside query scope');
 }else if(!scope.protocol.includes(emitter))throw Error('log outside protocol scope');
}
function adjacent(selected:Header[],previous?:StoredBlock){
 let prior=previous?{number:rawUint(previous.header.number),hash:previous.header.hash}:undefined;
 for(const block of selected){if(prior&&block.number===prior.number+1n&&block.parentHash!==prior.hash)throw Error('adjacent parent mismatch');prior=block;}
}
function storedLog(log:any,block:StoredBlock,scope:Scope,sparse:boolean){
 if(!log||log.blockNumber!==block.header.number||log.blockHash!==block.header.hash)throw Error('stored event provenance mismatch');
 if(sparse){const normalized={...log,blockNumber:rawUint(log.blockNumber),transactionIndex:Number(rawUint(log.transactionIndex)),logIndex:Number(rawUint(log.logIndex))};
  const endpoint=String(log.address).toLowerCase()===scope.cash?(scope.endpoints.includes(log.topics?.[1])?1:2):undefined;
  validLog(normalized,BigInt(block.header.number),BigInt(block.header.number),scope,endpoint);
 }
}
/** Coverage is durable query evidence under the trusted canonical RPC model, not an ancestry proof for omitted headers. */
function segments(blocks:StoredBlock[],deployment:bigint,scope:Scope):Segment[]{
 const result:Segment[]=[];let expected=deployment,i=0,sparseStarted=false;
 while(i<blocks.length){
  const candidate=blocks.findIndex((b,j)=>j>=i&&b.evidence!==undefined);
  const coverage=candidate<0?undefined:blocks[candidate]!.evidence?.[0] as Coverage|undefined;
  if(coverage&&coverage.from===String(expected)){
   if(blocks[candidate]!.evidence!.length!==1||coverage.version!==1||coverage.mode!=='finalized'||json(coverage.scope)!==json(scope)||rawUint(coverage.to)<expected||rawUint(coverage.to)-expected>=RANGE||rawUint(coverage.finalized?.number)<rawUint(coverage.to)||!hash.test(coverage.finalized?.hash)||json(coverage.previous)!==json(i?identity(blocks[i-1]!.header):null))throw Error('invalid sparse coverage');
   const selected=blocks.slice(i,candidate+1);
   if(selected[0]!.header.number!==coverage.from||selected.at(-1)!.header.number!==coverage.to||json(selected.map(b=>identity(b.header)))!==json(coverage.selected))throw Error('incomplete sparse coverage');
   let prior=expected-1n;
   for(const b of selected){const n=rawUint(b.header.number);if(n<=prior||n>rawUint(coverage.to)||!hash.test(b.header.hash)||!hash.test(b.header.parentHash??'')||rawUint(b.header.timestamp)<0n||n!==expected&&n!==rawUint(coverage.to)&&!b.logs.length)throw Error('invalid selected coverage header');prior=n;for(const log of b.logs)storedLog(log,b,scope,true);}
   adjacent(selected.map(b=>({number:BigInt(b.header.number),hash:b.header.hash as any,parentHash:b.header.parentHash as any,timestamp:BigInt(b.header.timestamp)})),blocks[i-1]);
   result.push({start:i,end:candidate,sparse:true});i=candidate+1;expected=rawUint(coverage.to)+1n;sparseStarted=true;
  }else{
   const b=blocks[i]!;if(sparseStarted||b.evidence!==undefined||b.header.number!==String(expected)||!hash.test(b.header.hash))throw Error('uncovered or invalid persisted coverage');
   rawUint(b.header.timestamp);if(i&&b.header.parentHash!==blocks[i-1]!.header.hash)throw Error('dense coverage parent mismatch');
   for(const log of b.logs)storedLog(log,b,scope,false);result.push({start:i,end:i,sparse:false});i++;expected++;
  }
 }
 return result;
}
function decode(store:Store,log:any){
 const name=Object.entries(store.deployment.addresses).find(([,a])=>a.toLowerCase()===log.address.toLowerCase())?.[0];let decoded:unknown=null;
 if(name&&contracts[name])try{decoded=decodeEventLog({abi:artifact(contracts[name]!).abi,data:log.data,topics:log.topics});}catch{/* Unknown protocol events remain raw evidence. */}
 return integers({...log,decoded});
}
export async function discoverFinalized(store:Store,rpc:any,refresh:(block:Header,logs:any[],history:StoredBlock[])=>Promise<any>){
 const deployment=rawUint(store.deployment.deploymentBlock),scope=scopeFor(store);
 const finalized=header(await rpc.getBlock({blockTag:'finalized'}));if(finalized.number<deployment)throw Error('finalized header precedes deployment');
 const anchor=(await headers([finalized.number],rpc))[0]!;if(json(anchor)!==json(finalized))throw Error('finalized anchor replaced');
 let blocks=store.data.blocks.slice();const coverage=segments(blocks,deployment,scope);
 if(blocks.length&&BigInt(blocks.at(-1)!.header.number)>finalized.number)throw Error('existing cursor is ahead of finalized; wait for finality');
 // Roll back to a complete range boundary, never an interior event record.
 while(coverage.length){const segment=coverage.at(-1)!,selected=blocks.slice(segment.start,segment.end+1),checked=await headers(selected.map(b=>BigInt(b.header.number)),rpc);
  if(checked.every((b,i)=>b.hash===selected[i]!.header.hash))break;
  blocks=blocks.slice(0,segment.start);coverage.pop();
 }
 if(blocks.length!==store.data.blocks.length)store.replace(blocks);
 let from=blocks.length?BigInt(blocks.at(-1)!.header.number)+1n:deployment;
 for(;from<=finalized.number;from+=RANGE){
  const to=from+RANGE-1n<finalized.number?from+RANGE-1n:finalized.number;
  // All requests use the caller's existing paced client. A failed child leaves no range published.
  const protocol:any[]=await rpc.getLogs({address:scope.protocol,fromBlock:from,toBlock:to});
  if(!Array.isArray(protocol))throw Error('invalid protocol log response');
  const received:any[]=[];for(const log of protocol){validLog(log,from,to,scope);received.push(log);}
  for(const endpoint of [1,2]){
   const topics=endpoint===1?[scope.topics,scope.endpoints]:[scope.topics,null,scope.endpoints];
   const response=await rpc.request({method:'eth_getLogs',params:[{address:scope.cash,fromBlock:toHex(from),toBlock:toHex(to),topics}]});
   if(!Array.isArray(response))throw Error('invalid cash log response');
   for(const rawLog of response){for(const key of ['blockNumber','logIndex','transactionIndex'])if(typeof rawLog?.[key]!=='string'||!/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(rawLog[key]))throw Error('malformed cash log quantity');const log=formatLog(rawLog);validLog(log,from,to,scope,endpoint);received.push(log);}
  }
  const seen=new Map<string,any>(),byBlock=new Map<bigint,any[]>();
  for(const log of received){const key=`${log.blockHash}:${log.logIndex}`;if(seen.has(key)){if(json(seen.get(key))!==json(log))throw Error('conflicting duplicate log');continue;}seen.set(key,log);const group=byBlock.get(log.blockNumber)??[];group.push(log);byBlock.set(log.blockNumber,group);}
  const numbers=[...new Set([from,to,...byBlock.keys()])].sort((a,b)=>a<b?-1:a>b?1:0),selected=await headers(numbers,rpc);adjacent(selected,blocks.at(-1));
  if(selected.some(b=>b.number===finalized.number&&json(b)!==json(finalized)))throw Error('selected finalized anchor replaced');
  const pending:StoredBlock[]=[];
  for(const block of selected){const received=byBlock.get(block.number)??[];if(received.some(l=>l.blockHash!==block.hash))throw Error('log block replaced');const logs=received.sort((a,b)=>a.transactionIndex-b.transactionIndex||a.logIndex-b.logIndex).map(log=>decode(store,log));const projection=await refresh(block,logs,[...blocks,...pending]);pending.push(raw({header:block,logs,projection}));}
  const previous=blocks.at(-1),checkNumbers=[...new Set([...numbers,...(previous?[BigInt(previous.header.number)]:[]),finalized.number])];
  const checked=await headers(checkNumbers,rpc),expected=new Map(selected.map(b=>[b.number,b]));expected.set(finalized.number,finalized);
  if(previous)expected.set(BigInt(previous.header.number),{number:BigInt(previous.header.number),hash:previous.header.hash as any,timestamp:BigInt(previous.header.timestamp),...(previous.header.parentHash?{parentHash:previous.header.parentHash as any}:{})});
  if(checked.some(b=>{const prior=expected.get(b.number);return !prior||b.hash!==prior.hash||b.parentHash!==prior.parentHash||b.timestamp!==prior.timestamp;}))throw Error('canonical range or finalized anchor replaced');
  const evidence:Coverage={version:1,mode:'finalized',from:String(from),to:String(to),previous:previous?identity(previous.header):null,finalized:identity(finalized),scope,selected:selected.map(identity)};
  pending.at(-1)!.evidence=[evidence];const committed=[...blocks,...pending];store.replace(committed);blocks=committed;
 }
}
