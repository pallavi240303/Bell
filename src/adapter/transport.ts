export interface Block {number:bigint;hash:`0x${string}`;timestamp:bigint}
export interface Frame {block:Block;state:Record<string,any>}
export function uint(value:unknown,bits=256):bigint {
  if(typeof value!=='string'||! /^(0|[1-9][0-9]*)$/.test(value))throw Error('Canonical unsigned integer string required');
  const n=BigInt(value);if(n>=1n<<BigInt(bits))throw Error('Integer overflow');return n;
}
export function json(value:unknown){return JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v);}
function integers(value:any,key=''):any{
  if(typeof value==='number')throw Error('HTTP financial integers must be strings');
  if(typeof value==='string'){if(key==='symbol'||/^0x[0-9a-fA-F]+$/.test(value))return value;return uint(value);}
  if(Array.isArray(value))return value.map(v=>integers(v));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,integers(v,k)]));
  return value;
}
export function decodeFrame(value:any):Frame{
  if(!value?.block||!value.state||typeof value.state!=='object'||Array.isArray(value.state)||!/^0x[0-9a-fA-F]{64}$/.test(value.block.hash))throw Error('Coherent snapshot provenance required');
  return {block:{number:uint(value.block.number),hash:value.block.hash,timestamp:uint(value.block.timestamp)},state:integers(value.state)};
}
export class Transport{
  constructor(private base='/api',private fetcher:typeof fetch=fetch){}
  private async request(path:string,input?:unknown){
    const response=await this.fetcher.call(globalThis,`${this.base}${path}`,{method:input===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},cache:'no-store',credentials:'omit',...(input===undefined?{}:{body:json(input)})});
    if(!response.ok)throw Error(`Read/preparation failed (${response.status}); refresh required`);return response.json();
  }
  async state(account?:string){return decodeFrame(await this.request(`/state${account?`?watch=${encodeURIComponent(account)}`:''}`));}
  manifest(){return this.request('/manifest');}
  events(){return this.request('/events');}
  prepare(input:unknown){return this.request('/prepare',input);}
}
