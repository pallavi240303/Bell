import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {decodeErrorResult,type Abi,type AbiFunction,type AbiParameter,type Hex} from 'viem';
import {rawUint,exactKeys} from './types.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
export function artifact(name:string):{abi:Abi;bytecode:{object:Hex}} {
  if(!/^[A-Za-z][A-Za-z0-9]*$/.test(name))throw Error('invalid artifact name');
  try{return JSON.parse(readFileSync(`${root}out/${name}.sol/${name}.json`,'utf8'));}
  catch{throw Error(`Missing generated artifact ${name}; run forge build from the repository root`);}
}
export function fn(name:string,method:string):AbiFunction {
  const found=artifact(name).abi.find(x=>x.type==='function'&&x.name===method);
  if(!found||found.type!=='function')throw Error(`unknown ABI method ${method}`);return found;
}
export const contracts:Record<string,string>={manager:'CoverManager',loanManager:'LoanManager',book:'CommitmentBook',pool:'ProtectedPool',vault:'LoanVault',cash:'MockCashToken',stock:'MockStockToken',oracle:'SessionOracle',registry:'AssetRegistry',receiver:'SimulationMarketEventReceiver',eligibility:'MockEligibilityPolicy'};
export function argument(p:AbiParameter,v:unknown):any {
  if(p.type.endsWith('[]')){if(!Array.isArray(v))throw Error('array required');return v.map(x=>argument({...p,type:p.type.slice(0,-2)} as AbiParameter,x));}
  if(p.type==='tuple'){
    if(!v||typeof v!=='object'||Array.isArray(v))throw Error('tuple object required');
    const fields=(p as AbiParameter&{components:readonly AbiParameter[]}).components;exactKeys(v as Record<string,unknown>,fields.map(x=>x.name!));
    return Object.fromEntries(fields.map(x=>[x.name,argument(x,(v as any)[x.name!])]));
  }
  if(p.type.startsWith('uint'))return rawUint(v,Number(p.type.slice(4)||256));
  if(p.type==='bool'){if(typeof v!=='boolean')throw Error('bool required');return v;}
  if(p.type==='address'){if(typeof v!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(v))throw Error('address required');return v.toLowerCase();}
  const size=p.type.match(/^bytes(\d+)$/);if(size){if(typeof v!=='string'||!new RegExp(`^0x[0-9a-fA-F]{${Number(size[1])*2}}$`).test(v))throw Error(`${p.type} required`);return v.toLowerCase();}
  if(p.type==='bytes'&&typeof v==='string'&&/^0x(?:[0-9a-fA-F]{2})*$/.test(v))return v;
  throw Error(`unsupported ABI argument ${p.type}`);
}
export function argsFor(name:string,method:string,args:unknown):any[] {const f=fn(name,method);if(!Array.isArray(args)||args.length!==f.inputs.length)throw Error('exact ABI arguments required');return f.inputs.map((p,i)=>argument(p,args[i]));}

/** Decode bridge/token failures by selector using the actual generated cross-contract union. */
export function protocolError(data:Hex){
 const names=['LoanManager','CoverManager','LoanVault','CommitmentBook','ProtectedPool','SessionOracle','AssetRegistry','MockCashToken','MockStockToken'];
 const abi=names.flatMap(name=>artifact(name).abi.filter(item=>item.type==='error'));
 return decodeErrorResult({abi,data});
}
