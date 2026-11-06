import {encodeFunctionData} from 'viem';
import {artifact,argsFor,contracts} from './abi.ts';
import {exactKeys,rawUint,type Deployment,type Header,type Address,type Hex} from './types.ts';
import {verifyDeployment} from './config.ts';
const allowed:Record<string,string[]>={pool:['deposit','redeem'],book:['postOffer','cancelOffer','withdrawPremium','withdrawCashCredit'],manager:['borrowWithCover','repay','addCollateral','withdrawCollateral','topUpBacking','finalizeHandoff'],vault:['withdrawClaim']};
const approvals:Record<string,[string,string]>={deposit:['cash','pool'],offer:['cash','book'],premium:['cash','book'],repay:['cash','manager'],collateral:['stock','vault'],backing:['stock','vault']};
export interface Unsigned {chainId:string;from:Address;to:Address;data:Hex;value:'0';sourceBlock:string;sourceBlockHash:Hex}
export async function prepareActor(d:Deployment,source:Header,input:Record<string,any>,client:any):Promise<Unsigned> {
  await verifyDeployment(client,d,source);
  const approval=input.approval!==undefined;
  exactKeys(input,approval?['chainId','from','approval','amount']:['chainId','from','contract','method','args']);
  if(input.chainId!==d.chainId)throw Error('deployment chain mismatch');rawUint(input.chainId);
  if(typeof input.from!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(input.from))throw Error('explicit caller required');
  let contract=input.contract,method=input.method,args=input.args;
  if(approval){const pair=approvals[input.approval];if(!pair)throw Error('approval purpose not allowed');contract=pair[0];method='approve';args=[d.addresses[pair[1]],input.amount];}
  else if(!allowed[contract]?.includes(method))throw Error('actor method not allowed');
  const name=contracts[contract],to=d.addresses[contract];if(!name||!to)throw Error('deployment destination absent');
  return {chainId:d.chainId,from:input.from.toLowerCase() as Address,to,data:encodeFunctionData({abi:artifact(name).abi,functionName:method,args:argsFor(name,method,args)}),value:'0',sourceBlock:source.number.toString(),sourceBlockHash:source.hash};
}
/** Separate permissionless lane; never accepts actor amounts, claim withdrawals or backing. */
export async function prepareSettlement(d:Deployment,source:Header,from:Address,id:bigint,method:'settle'|'terminalSettle',client:any):Promise<Unsigned> {
  await verifyDeployment(client,d,source);
  if(method!=='settle'&&method!=='terminalSettle')throw Error('permissionless method not allowed');
  return {chainId:d.chainId,from,to:d.addresses.manager!,data:encodeFunctionData({abi:artifact('CoverManager').abi,functionName:method,args:[id]}),value:'0',sourceBlock:source.number.toString(),sourceBlockHash:source.hash};
}
