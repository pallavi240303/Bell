import {encodeFunctionData,keccak256,type Abi,type AbiParameter,type Address,type Hex} from 'viem';
import {abis} from '../generated/abis.ts';
import {uint} from './transport.ts';
export interface Provider {request(args:{method:string;params?:unknown[]}):Promise<any>;on?(event:string,listener:(...args:any[])=>void):void;removeListener?(event:string,listener:(...args:any[])=>void):void}
export interface Manifest {chainId:string;deploymentBlock:string;addresses:Record<string,Address>;codeHashes:Record<string,Hex>}
export type Intent={approval:string;amount:string}|{contract:string;method:string;args:unknown[]};
export interface Unsigned {chainId:string;from:Address;to:Address;data:Hex;value:string;sourceBlock:string;sourceBlockHash:Hex}
const lanes:Record<string,string[]>={pool:['deposit','redeem'],book:['postOffer','cancelOffer','withdrawPremium','withdrawCashCredit'],loanManager:['borrow','repay','addCollateral','withdrawCollateral','liquidate','topUpBacking','finalizeHandoff'],manager:['buyCover'],vault:['withdrawClaim']};
const approvals:Record<string,[string,string]>={deposit:['cash','pool'],offer:['cash','book'],premium:['cash','book'],repay:['cash','loanManager'],collateral:['stock','vault'],backing:['stock','vault']};
export function argument(p:AbiParameter,value:any):any{
  if(p.type.endsWith('[]')){if(!Array.isArray(value))throw Error('Array required');return value.map(v=>argument({...p,type:p.type.slice(0,-2)} as AbiParameter,v));}
  if(p.type==='tuple'){const components=(p as any).components as AbiParameter[];if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!components.some(p=>p.name===k)))throw Error('Exact tuple required');return Object.fromEntries(components.map(p=>[p.name,argument(p,value[p.name!])]));}
  if(p.type.startsWith('uint'))return uint(value,Number(p.type.slice(4)||256));
  if(p.type==='address'&&typeof value==='string'&&/^0x[0-9a-fA-F]{40}$/.test(value))return value.toLowerCase();
  if(/^bytes\d+$/.test(p.type)&&typeof value==='string'&&new RegExp(`^0x[0-9a-fA-F]{${Number(p.type.slice(5))*2}}$`).test(value))return value.toLowerCase();
  if(p.type==='bool'&&typeof value==='boolean')return value;
  throw Error(`Invalid ${p.type}`);
}
export function encode(contract:string,method:string,args:unknown[]):Hex{
  const abi=(abis as Record<string,Abi>)[contract];const fn=abi?.find(x=>x.type==='function'&&x.name===method);
  if(!fn||fn.type!=='function'||!Array.isArray(args)||args.length!==fn.inputs.length)throw Error('Exact ABI arguments required');
  return encodeFunctionData({abi:abi!,functionName:method,args:fn.inputs.map((p,i)=>argument(p,args[i]))});
}
export class Wallet{
  account:Address|undefined;verified=false;private generation=0;private busy=false;
  private changed=()=>{this.account=undefined;this.verified=false;this.generation++;this.onChange();};
  constructor(private provider:Provider,private rpc:any,readonly manifest:Manifest,private onChange=()=>{}){for(const event of ['accountsChanged','chainChanged','disconnect'])provider.on?.(event,this.changed);}
  dispose(){for(const event of ['accountsChanged','chainChanged','disconnect'])this.provider.removeListener?.(event,this.changed);this.changed();}
  async connect(){const accounts=await this.provider.request({method:'eth_requestAccounts'});if(!accounts[0]||!/^0x[0-9a-fA-F]{40}$/.test(accounts[0]))throw Error('Connect a wallet account');this.account=accounts[0].toLowerCase();await this.identity();await this.verify();this.verified=true;return this.account;}
  private async identity(){if(!this.account)throw Error('Connect wallet after account or chain changed');const [accounts,chain]=await Promise.all([this.provider.request({method:'eth_accounts'}),this.provider.request({method:'eth_chainId'})]);if(accounts[0]?.toLowerCase()!==this.account)throw Error('Wallet account changed');if(BigInt(chain)!==uint(this.manifest.chainId))throw Error('Wallet chain mismatch');}
  async verify(at?:bigint,hash?:Hex){
    const m=this.manifest;if(uint(m.chainId)===0n||BigInt(await this.rpc.getChainId())!==uint(m.chainId))throw Error('Manifest chain mismatch');
    const block=await this.rpc.getBlock(at===undefined?{blockTag:'latest'}:{blockNumber:at});if(!block?.hash||hash&&block.hash!==hash||block.number<uint(m.deploymentBlock))throw Error('Source block is not canonical');
    for(const name of Object.keys(abis))if(!m.addresses[name]||!m.codeHashes[name])throw Error('Incomplete manifest');
    const seen=new Set<string>();for(const [name,address]of Object.entries(m.addresses)){if(!/^0x[0-9a-fA-F]{40}$/.test(address)||/^0x0{40}$/i.test(address)||seen.has(address.toLowerCase()))throw Error('Invalid manifest address');seen.add(address.toLowerCase());const code=await this.rpc.getCode({address,blockNumber:block.number});if(!code||code==='0x'||keccak256(code)!==m.codeHashes[name]?.toLowerCase())throw Error('Manifest code mismatch');}
    if((await this.rpc.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Source block is not canonical');return block;
  }
  expected(intent:Intent){
    let contract:string,method:string,args:unknown[];
    if('approval'in intent){const pair=approvals[intent.approval];if(!pair)throw Error('Approval purpose unavailable');contract=pair[0];method='approve';args=[this.manifest.addresses[pair[1]],intent.amount];}
    else{({contract,method,args}=intent);if(!lanes[contract]?.includes(method))throw Error('Actor method unavailable');}
    return {to:this.manifest.addresses[contract]!,data:encode(contract,method,args)};
  }
  async send(intent:Intent,unsigned:Unsigned,refresh:(minimum:bigint)=>Promise<void>){
    if(this.busy)throw Error('Transaction already pending');this.busy=true;const generation=this.generation;
    try{
      await this.identity();const expected=this.expected(intent);
      if(unsigned.chainId!==this.manifest.chainId||unsigned.from.toLowerCase()!==this.account||unsigned.to.toLowerCase()!==expected.to.toLowerCase()||unsigned.value!=='0'||unsigned.data.toLowerCase()!==expected.data.toLowerCase())throw Error('Unsigned transaction mismatch');
      await this.verify(uint(unsigned.sourceBlock),unsigned.sourceBlockHash);
      await this.rpc.call({account:this.account,to:expected.to,data:expected.data,value:0n});
      await this.identity();if(generation!==this.generation)throw Error('Wallet changed');
      const hash:Hex=await this.provider.request({method:'eth_sendTransaction',params:[{from:this.account,to:expected.to,data:expected.data,value:'0x0',chainId:`0x${uint(this.manifest.chainId).toString(16)}`}]});
      let replacementError=false;
      const receipt=await this.rpc.waitForTransactionReceipt({hash,onReplaced:(replacement:any)=>{const tx=replacement.transaction;replacementError ||= replacement.reason==='cancelled'||tx.from?.toLowerCase()!==this.account||tx.to?.toLowerCase()!==expected.to.toLowerCase()||tx.input?.toLowerCase()!==expected.data.toLowerCase()||tx.value!==0n;}});
      if(replacementError)throw Error('Transaction cancelled or replaced with different intent');if(receipt.status!=='success')throw Error('Transaction reverted');
      if((await this.rpc.getBlock({blockNumber:receipt.blockNumber})).hash!==receipt.blockHash)throw Error('Receipt no longer canonical');
      await this.identity();if(generation!==this.generation)throw Error('Wallet changed while pending');await refresh(receipt.blockNumber);return receipt;
    }finally{this.busy=false;}
  }
}
