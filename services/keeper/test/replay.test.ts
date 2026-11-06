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
  const market={...fact,kind:'6',sessionId:zero};assert.equal(m.bindReport(market,domain).input.kind,'6');
  const bound=m.bindReport(fact,domain);const decoded:any=decodeAbiParameters(fn('SessionOracle','acceptReport').inputs,bound.payload)[0];
  assert.equal(decoded.halted,true);for(const key of ['assetId','sessionId','actionId','primarySourceHash','secondarySourceHash'])assert.equal(decoded[key],(fact as any)[key]);
  assert.equal(decoded.benchmarkPrice,50000000n);assert.equal(decoded.corporateAction,0);
});
test('configurable durable replay has exact transitions, distinct input outcomes, detached debt and independent terminal branches',async()=>{
 const m=await import('../replay.ts');const result=await m.verifyReplay();
 assert.equal(result.runs.length,9);assert.equal(new Set(result.runs.slice(0,3).map(r=>r.outcomeHash)).size,3);assert.equal(result.runs[0]!.outcomeHash,result.runs[3]!.outcomeHash);
 for(const run of result.runs){assert.equal(run.parity,true);assert.equal(run.interactiveConsentVerified,false);assert.ok(run.transactions.some((t:any)=>t.label==='borrow'&&t.parity));assert.ok(run.transactions.some((t:any)=>t.label==='buyCover'&&t.parity));
  for(const t of run.transactions){assert.ok(t.receipt.blockHash);assert.equal(t.evidenceHash,m.transactionSeal(t),'final evidence seal');}
  for(const f of run.expectedReverts){assert.equal(f.revertData,f.expectedRevertData);assert.ok(f.revertData.length>2);}
  assert.ok(run.reports.some((r:any)=>r.input.kind==='6'&&r.input.sessionId===`0x${'0'.repeat(64)}`));
  assert.doesNotMatch(JSON.stringify(run),/privateKey|mnemonic|authorization|password/i);
 }
 const partial=result.runs[0]!;assert.ok(BigInt(partial.outcome.normal.debt)>0n);assert.equal(partial.outcome.normal.receiptStatus,'2');assert.equal(partial.outcome.normal.activeCoverId,'0');assert.ok(BigInt(partial.outcome.accruedDebt)>BigInt(partial.outcome.normal.debt));
 const terminal=result.runs.find(r=>r.id==='terminal-no-reopen')!;assert.ok(!terminal.reports.some((r:any)=>r.input.kind==='3'));assert.equal(terminal.outcome.finalDebt,'0');assert.equal(terminal.transactions.find((t:any)=>t.label==='terminal')!.before.state.tokens.stock.paused,true);
 const full=result.runs.find(r=>r.id==='full-normal-close')!;assert.equal(full.outcome.normal.debt,'0');assert.equal(full.outcome.normal.receiptStatus,'2');
 const later=result.runs.find(r=>r.id==='second-session')!;assert.equal(later.outcome.secondReceiptId,'2');assert.equal(later.outcome.distinctLoanId,'3');assert.ok(later.transactions.some((t:any)=>t.label==='paused-claim-rejected')===false);assert.ok(later.expectedReverts.some((t:any)=>t.label==='paused-claim-rejected'));
});
