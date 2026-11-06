import assert from 'node:assert/strict';
import test from 'node:test';
test('configurable replay produces three real outcomes, reproducible inputs, terminal paths and exact revert evidence',async()=>{
  const m=await import('../replay.ts').catch(()=>null);assert.ok(m,'real onchain replay implementation required');
  const result=await m.verifyReplay();
  assert.equal(result.runs.length,5);assert.equal(new Set(result.runs.slice(0,3).map((r:any)=>r.outcomeHash)).size,3);
  assert.equal(new Set(result.runs.slice(0,3).map((r:any)=>r.outcome.normal.debt)).size,3);
  assert.equal(result.runs[0]!.outcomeHash,result.runs[3]!.outcomeHash);
  for(const run of result.runs){assert.ok(run.transactions.length>0);assert.equal(run.parity,true);assert.equal(run.conservation,true);assert.ok(run.expectedReverts.some((x:any)=>x.data!=='0x'));assert.equal(run.terminalDebt,'0');
    for(const tx of run.transactions){assert.ok(tx.before.block.hash);assert.ok(tx.after.block.hash);assert.ok(tx.receipt.blockHash);assert.ok(tx.simulation);assert.ok(tx.data);}
    const encoded=JSON.stringify(run,(_,v)=>typeof v==='bigint'?v.toString():v);assert.doesNotMatch(encoded,/privateKey|mnemonic|authorization|password/i);
  }
});
