import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../../src/state/controller.ts';
const account='0x'+'1'.repeat(40),pool='0x'+'2'.repeat(40),cash='0x'+'3'.repeat(40);
function app(){
 const c=new Controller(), hash='0x'+'a'.repeat(64),block={number:7n,hash,timestamp:10n};
 c.manifest={chainId:'5042002',addresses:{pool,cash}} as any;
 c.wallet={verified:true,account,verify:async()=>block,dispose:()=>{}} as any;
 let indexed=0,allowance=0n;
 c.transport.state=async()=>{indexed++;throw Error('index is cold');};
 c.rpc={getBlock:async()=>block,readContract:async(q:any)=>{assert.equal(q.blockNumber,7n);return q.functionName==='allowance'?allowance:q.functionName==='totalAssets'?4n:q.args[0]===account&&q.address===cash?100000000n:0n;}};
 return {c,indexed:()=>indexed,approve:()=>{allowance=30000000n;}};
}
test('lender approves then supplies from pinned Arc reads while the market index is cold',async()=>{
 const {c,indexed,approve}=app();c.lenderMode=true;c.supIn='30';await c.refresh();
 assert.equal(c.frame,undefined);assert.equal(c.renderVals().lend.walletFmt,'100');assert.equal(c.renderVals().workflow.canApproveSupply,true);assert.equal(c.renderVals().canSupply,false);
 approve();await c.refresh(7n);assert.equal(c.renderVals().canSupply,true);assert.equal(c.renderVals().workflow.canBorrow,false);assert.equal(indexed(),0);
 await assert.rejects(c.refresh(8n));assert.equal(c.renderVals().canSupply,false);
});
test('replaced block or changed account cannot unlock the lender action',async()=>{
 for(const reorg of [true,false]){const {c}=app();c.lenderMode=true;c.supIn='30';c.rpc.getBlock=async()=>{if(!reorg)c.chooseAccount('0x'+'4'.repeat(40));return {hash:'0x'+'b'.repeat(64)};};await assert.rejects(c.refresh());assert.equal(c.renderVals().workflow.canApproveSupply,false);}
});
