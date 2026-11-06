import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { encodeDeployData,encodeFunctionData, type Address } from 'viem';
import { localNode,deployLocal } from '../../../scripts/keeper-local.ts';
import { artifact } from '../../../services/keeper/abi.ts';
test('local CLI forwarder option verifies real code and preserves default operator binding',async()=>{
 const node=await localNode();try{
  const mock=JSON.parse(readFileSync(new URL('../fixtures/cli/MockKeystoneForwarder.json',import.meta.url),'utf8'));
  await assert.rejects(deployLocal(node,{forwarder:node.actors[1]!}),/local forwarder contract required/);
  const receipt=await node.send(node.actors[0]!,undefined,encodeDeployData({abi:mock.abi,bytecode:mock.bytecode.object,args:[]}));const forwarder=receipt.contractAddress! as Address;
  for(const supplied of [forwarder,undefined]){const d=(await deployLocal(node,{forwarder:supplied})).deployment;
   assert.equal((await node.client.readContract({address:d.addresses.receiver,abi:artifact('SimulationMarketEventReceiver').abi,functionName:'forwarder'})).toLowerCase(),supplied??node.actors[0]);
   if(supplied)await assert.rejects(node.client.call({account:node.actors[0],to:d.addresses.receiver,data:encodeFunctionData({abi:artifact('SimulationMarketEventReceiver').abi,functionName:'onReport',args:['0x','0x']})}));
  }
 }finally{await node.stop();}
});
