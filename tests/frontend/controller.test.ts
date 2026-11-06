import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../../src/state/controller.ts';
const hash=`0x${'ab'.repeat(32)}` as const;
test('controller renders absent finances as unavailable and labels separate sources of authority',()=>{
  const v=new Controller().renderVals();assert.equal(v.bell.debtFmt,'—');assert.equal(v.lend.balFmt,'—');assert.equal(v.outcome.show,false);assert.equal(v.labels.network,'UNVERIFIED');assert.equal(v.labels.clock,'BLOCK TIME');assert.equal(v.labels.authority,'CONTRACT SETTLEMENT');assert.equal(v.labels.signing,'CONNECTED WALLET');
});
test('receipt status is independent of debt and keeps residual collateral after partial settlement',()=>{
  const c=new Controller();const account=`0x${'ab'.repeat(20)}`;c.wallet={account} as any;
  c.frame={block:{number:1n,hash,timestamp:1n},state:{receipts:{'1':{receipt:{status:2n,consent:{borrower:account},debtCeiling:500n},remainingShares:2000000000000000000n,debt:0n,benchmark:{finalized:false}}},book:{totalLockedCash:10n},pool:{totalAssets:0n},balances:{}}};
  let v=c.renderVals();assert.equal(v.bell.badge,'HANDOFF_PENDING');assert.equal(v.bell.debtFmt,'0');assert.equal(v.bell.shFmt,'2');assert.equal(v.outcome.show,false);
  c.frame.state.receipts['1'].receipt.status=1n;c.frame.state.receipts['1'].debt=123n;v=c.renderVals();assert.equal(v.bell.debtFmt,'0.000123');assert.equal(v.bell.shFmt,'2');
});
test('failed or superseded refresh cannot leave a confirmed stale financial frame',async()=>{
  const c=new Controller();c.frame={block:{number:1n,hash,timestamp:1n},state:{}};c.transport.state=async()=>{throw Error('reorg');};
  await assert.rejects(()=>c.refresh(),/reorg/);assert.equal(c.frame,undefined);
});
test('receipt refresh refuses an earlier indexed block',async()=>{
  const c=new Controller();c.transport.state=async()=>({block:{number:1n,hash,timestamp:1n},state:{}});await assert.rejects(()=>c.refresh(2n),/receipt block/);assert.equal(c.frame,undefined);
});
test('page defaults preserve four FAQ rows and a collapsed evidence log',()=>{
  const c=new Controller();let v=c.renderVals();assert.equal(v.faqs.length,4);assert.equal(v.showLog,false);v.toggleLog();v=c.renderVals();assert.equal(v.showLog,true);
});
test('late snapshot completion cannot overwrite a newer coherent frame',async()=>{
  const c=new Controller();c.manifest={} as any;c.rpc={};c.wallet={account:'0x01',verify:async()=>{}} as any;
  let resolve!:(v:any)=>void;const first=new Promise<any>(r=>resolve=r);let count=0;c.transport.state=()=>++count===1?first:Promise.resolve({block:{number:2n,hash,timestamp:2n},state:{}});c.transport.events=async()=>[];
  const stale=c.refresh();await c.refresh();resolve({block:{number:1n,hash,timestamp:1n},state:{}});await assert.rejects(()=>stale,/superseded/);assert.equal(c.frame?.block.number,2n);
});
test('displayed stock ticker comes from the same contract snapshot',()=>{
  const c=new Controller();c.frame={block:{number:1n,hash,timestamp:1n},state:{tokens:{stock:{symbol:'mSTOCK',paused:false}},book:{},pool:{}}};assert.equal(c.renderVals().stockSymbol,'mSTOCK');
});
test('unsubmitted offer never claims contract validation or a computed escrow outcome',()=>{
  assert.equal(new Controller().renderVals().fEscrowFmt,'—');
});
