import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {keccak256,toHex} from 'viem';
import {json} from './types.ts';
export function canonical(value:any):any {
  if(typeof value==='bigint')return value.toString();if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;
}
export function digest(value:unknown){return keccak256(toHex(JSON.stringify(canonical(value))));}
export function assertSafe(value:any):void {
  if(Array.isArray(value)){value.forEach(assertSafe);return;}
  if(value&&typeof value==='object')for(const [key,v]of Object.entries(value)){if(/private.?key|mnemonic|secret|authorization|password|credential/i.test(key))throw Error('secret field forbidden in evidence');assertSafe(v);}
  if(typeof value==='string'&&/-----BEGIN .*PRIVATE KEY-----|Bearer\s+[a-z0-9]/i.test(value))throw Error('secret material forbidden');
}
export function writeEvidence(name:string,value:unknown){
  if(!/^[a-zA-Z0-9_-]+$/.test(name))throw Error('invalid evidence name');assertSafe(value);mkdirSync('evidence/runs',{recursive:true});const path=`evidence/runs/${name}.json`;writeFileSync(path,json(canonical(value))+'\n',{mode:0o600});return path;
}
export function conservation(before:{timestamp:bigint;pool:bigint;book:bigint;debt:bigint},after:typeof before){
  assert.equal(before.timestamp,after.timestamp,'same timestamp required');assert.equal(before.pool+before.book,after.pool+after.book,'custody conservation');assert.equal(before.pool+before.debt,after.pool+after.debt,'NAV conservation');return {cash:after.pool+after.book,nav:after.pool+after.debt};
}
