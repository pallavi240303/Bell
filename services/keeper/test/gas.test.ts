import assert from 'node:assert/strict';
import test from 'node:test';
const addr=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as const;
const h=(n:number)=>`0x${n.toString(16).padStart(64,'0')}` as const;
test('Arc receipt gas envelope retains native dust and rejects forged cost/provenance',async()=>{
 const m=await import('../parity.ts').catch(()=>null);assert.ok(m,'trusted Arc parity helper required');
 const who=addr(1),cash='0x3600000000000000000000000000000000000000';
 const tx={hash:h(1),from:who,chainId:5042002,gas:30000n,gasPrice:7n,blockHash:h(3),blockNumber:3n,transactionIndex:0};
 const receipt={transactionHash:h(1),from:who,blockNumber:3n,blockHash:h(3),transactionIndex:0,gasUsed:21000n,effectiveGasPrice:7n,status:'success'};
 let before=2000000000001n,after=before+1000000000000n-147000n;
 const parent={number:2n,hash:h(2),timestamp:20n},block={number:3n,hash:h(3),parentHash:h(2),timestamp:21n,transactions:[h(1)]};
 const rpc={getChainId:async()=>5042002,getTransaction:async()=>tx,getTransactionReceipt:async()=>receipt,getBlock:async({blockNumber}:any)=>blockNumber===2n?parent:block,getBalance:async({blockNumber}:any)=>blockNumber===2n?before:after,readContract:async({blockNumber}:any)=>blockNumber===2n?before/1000000000000n:after/1000000000000n};
 const d={chainId:'5042002',addresses:{cash}};
 const good=await m.verifyNativeExecution(rpc,d,h(1),who,1n);assert.equal(good.gasCost,147000n);assert.equal(good.cash,2n);assert.equal(good.remainder,999999853001n);
 receipt.effectiveGasPrice=8n;await assert.rejects(m.verifyNativeExecution(rpc,d,h(1),who,1n),/price|gas/i);receipt.effectiveGasPrice=7n;
 tx.from=addr(2);await assert.rejects(m.verifyNativeExecution(rpc,d,h(1),who,1n),/identity/i);tx.from=who;
 block.transactions.push(h(4));await assert.rejects(m.verifyNativeExecution(rpc,d,h(1),who,1n),/intermediate|isolat/i);block.transactions.pop();
 await assert.rejects(m.verifyNativeExecution(rpc,{...d,addresses:{cash:addr(9)}},h(1),who,1n),/canonical/i);
 await assert.rejects(m.verifyNativeExecution({...rpc,readContract:async()=>9n},d,h(1),who,1n),/provenance/i);
 receipt.transactionHash=h(9);await assert.rejects(m.verifyNativeExecution(rpc,d,h(1),who,1n),/identity/i);receipt.transactionHash=h(1);
 receipt.status='reverted';await assert.rejects(m.verifyNativeExecution(rpc,d,h(1),who,1n),/reverted/i);after=before-147000n;const reverted=await m.verifyNativeExecution(rpc,d,h(1),who,0n);assert.equal(reverted.native,after);assert.equal(reverted.cash,1n);
 receipt.status='success';before=(1n<<200n)+11n;after=before+1000000000000n-147000n;const huge=await m.verifyNativeExecution(rpc,d,h(1),who,1n);assert.equal(huge.native,after);assert.equal(huge.cash,after/1000000000000n);

});
