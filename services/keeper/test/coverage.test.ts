import test from 'node:test';
import assert from 'node:assert/strict';
import * as state from '../state.ts';
test('review 2: exact locked-cash projection distinguishes status, receipts and incomplete discovery',()=>{
  const project=(state as any).projectCoverage;assert.equal(typeof project,'function');
  const offer=(status:bigint,charged:bigint,receiptId=0n)=>({status,cashCapacity:100n,cumulativeCashCharged:charged,receiptId});
  const offers={free:offer(1n,0n),partial:offer(2n,30n,1n),other:offer(2n,20n,2n),cancelled:offer(4n,0n),released:offer(3n,40n)};
  const receipts={'1':{receipt:{offerIds:['partial','released']}},'2':{receipt:{offerIds:['other']}}};
  const coverage=project(offers,receipts,250n,true);
  assert.deepEqual(Object.values(coverage).map((o:any)=>o.currentLockedCash),[100n,70n,80n,0n,0n]);
  assert.equal('currentLockedCash' in offers.free,false,'contract offer tuples must stay separate from display metadata');
  assert.equal((receipts['1'] as any).receiptRemainingCoverage,70n);assert.equal((receipts['2'] as any).receiptRemainingCoverage,80n);
  assert.doesNotThrow(()=>project({free:offer(1n,0n)},{},250n,false));
  assert.throws(()=>project({free:offer(1n,0n)},{},250n,true),/complete/);
  assert.throws(()=>project({free:offer(1n,0n)},{},99n,false),/global/);
  assert.throws(()=>project({bad:offer(2n,101n)},{},0n,false),/underflow/);
  assert.throws(()=>project({},receipts,0n,false),/missing/);
});
