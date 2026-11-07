import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gproInput,verifyGpro} from '../gpro.ts';
test('GoPro scenarios share historical observations and differ only in proposed principal',()=>{
 const healthy=gproInput('healthy'),unsafe=gproInput('unhealthy');
 assert.deepEqual(healthy.reports,unsafe.reports);assert.equal(healthy.borrow.principal,'10000000');assert.equal(unsafe.borrow.principal,'11800000');
 assert.equal(healthy.borrow.collateralShares,'10000000000000000000');
 assert.equal(healthy.reports.find((r:any)=>r.role==='origination-price').benchmarkPrice,'1969900');
 assert.equal(healthy.reports.find((r:any)=>r.role==='window-price').benchmarkPrice,'1775000');
 assert.equal(healthy.reports.find((r:any)=>r.role==='reopen').benchmarkPrice,'1565000');
 assert.throws(()=>gproInput('invalid' as any));
});
test('real local contracts keep the low-debt GoPro loan healthy and exercise the higher-debt loan', {timeout:120000},async()=>{
 const proof=await verifyGpro();assert.equal(proof.runs.length,2);
 assert.equal(proof.runs[0]!.buyerCash,0n);assert.ok(proof.runs[1]!.buyerCash>0n);
 for(const run of proof.runs){assert.ok(run.transactions.length>10);assert.equal(run.parity,true);assert.equal(run.coverDetached,true);}
});
