import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {decodeFunctionData,decodeAbiParameters,keccak256,toHex} from 'viem';
import {artifact,fn} from '../abi.ts';
const fixture=()=>JSON.parse(readFileSync(new URL('../fixtures/replay.json',import.meta.url),'utf8'));
test('report facts are explicit, strict and preserved in generated payloads',async()=>{
  const m=await import('../replay.ts') as any;assert.equal(typeof m.bindReport,'function','strict report binding required');
  const zero=`0x${'0'.repeat(64)}`,fact={reference:'explicit',kind:'3',assetId:keccak256(toHex('STOCK')),sessionId:keccak256(toHex('SESSION')),observedAt:'1501',validUntil:'1601',scheduledOpen:'1200',scheduledClose:'1500',benchmarkPrice:'50000000',corporateAction:'0',actionId:zero,multiplierNumerator:'1',multiplierDenominator:'1',halted:true,primarySourceHash:keccak256(toHex('primary')),secondarySourceHash:keccak256(toHex('secondary'))};
  const domain={chainId:'31337',oracle:'0x0000000000000000000000000000000000000001',configHash:keccak256(toHex('config')),nonce:'3',previousStateHash:zero};
  for(const key of Object.keys(fact)){const missing:any={...fact};delete missing[key];assert.throws(()=>m.bindReport(missing,domain),/report|fact|required/);}
  for(const extra of [{unknown:true},{chainId:'1'},{corporateAction:'4'},{kind:'4'},{kind:'5'},{kind:'0'},{halted:'false'},{actionId:'0x12'},{observedAt:1501},{corporateAction:'1',actionId:zero}])assert.throws(()=>m.bindReport({...fact,...extra},domain));
  const bound=m.bindReport(fact,domain);const decoded:any=decodeAbiParameters(fn('SessionOracle','acceptReport').inputs,bound.payload)[0];
  assert.equal(decoded.halted,true);for(const key of ['assetId','sessionId','actionId','primarySourceHash','secondarySourceHash'])assert.equal(decoded[key],(fact as any)[key]);
  assert.equal(decoded.benchmarkPrice,50000000n);assert.equal(decoded.corporateAction,0);
});
test('configurable replay produces three real outcomes, reproducible inputs, terminal paths and exact revert evidence',async()=>{
  const m=await import('../replay.ts').catch(()=>null);assert.ok(m,'real onchain replay implementation required');
  const result=await m.verifyReplay();
  assert.equal(result.runs.length,5);assert.equal(new Set(result.runs.slice(0,3).map((r:any)=>r.outcomeHash)).size,3);
  assert.equal(new Set(result.runs.slice(0,3).map((r:any)=>r.outcome.normal.debt)).size,3);
  assert.equal(result.runs[0]!.outcomeHash,result.runs[3]!.outcomeHash);
  for(const run of result.runs){assert.ok(run.transactions.length>0);assert.equal(run.parity,true);assert.equal(run.conservation,true);assert.ok(run.expectedReverts.some((x:any)=>x.revertData!=='0x'));assert.equal(run.terminalDebt,'0');
    for(const failed of run.expectedReverts){assert.ok(failed.revertData,'revert bytes require a distinct field');assert.equal(failed.revertData,failed.expectedRevertData);const call=decodeFunctionData({abi:artifact('CoverManager').abi,data:failed.data});assert.equal(call.functionName,failed.method);assert.deepEqual(call.args,[1n]);}
    for(const tx of run.transactions){assert.ok(tx.before.block.hash);assert.ok(tx.after.block.hash);assert.ok(tx.receipt.blockHash);assert.ok(tx.simulation);assert.ok(tx.data);}
    for(const report of run.reports){const supplied=fixture().reports.find((f:any)=>f.reference===report.reference);assert.ok(supplied);const decoded:any=decodeAbiParameters(fn('SessionOracle','acceptReport').inputs,report.payload)[0];for(const [field,value]of Object.entries(supplied)){if(field==='reference')continue;assert.equal(String(decoded[field]),String(value),`supplied report fact: ${field}`);}}
    const encoded=JSON.stringify(run,(_,v)=>typeof v==='bigint'?v.toString():v);assert.doesNotMatch(encoded,/privateKey|mnemonic|authorization|password/i);
  }
});
