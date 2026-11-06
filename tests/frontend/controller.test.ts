import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../../src/state/controller.ts';
const hash=`0x${'ab'.repeat(32)}` as const;
test('review 4: refresh binds event boundary, keeps historical time, and clears evidence on failure',async()=>{
  const c=new Controller(),block={number:2n,hash,timestamp:20n},oldHash=`0x${'cd'.repeat(32)}` as const;
  c.manifest={} as any;c.wallet={account:'0x01',verify:async()=>{}} as any;
  c.rpc={getBlock:async({blockNumber}:any)=>blockNumber===1n?{number:1n,hash:oldHash,timestamp:10n}:block};
  c.transport.state=async()=>({block,state:{pool:{},book:{}}});
  c.transport.events=async()=>({block:{...block,number:3n},events:[]}) as any;
  await assert.rejects(()=>c.refresh(),/boundary/);assert.equal(c.frame,undefined);assert.deepEqual(c.events,[]);
  let requested:any;c.transport.events=async(b:any)=>{requested=b;return {block,events:[{blockNumber:1n,blockHash:oldHash,blockTimestamp:10n,decoded:{eventName:'Transfer'}}]};};
  await c.refresh();assert.deepEqual(requested,block);assert.equal(c.renderVals().evClock,'10');
  c.transport.state=async()=>{throw Error('reorg');};await assert.rejects(()=>c.refresh(),/reorg/);assert.equal(c.frame,undefined);assert.deepEqual(c.events,[]);
});
test('review 5: claim units remain pending while recorded or paused and become delivered only after withdrawal',()=>{
  const c=new Controller(),account=`0x${'ab'.repeat(20)}`;c.wallet={account} as any;
  c.frame={block:{number:1n,hash,timestamp:1n},state:{pool:{},book:{},claims:{'1':{owner:account,withdrawn:false,deliveryUnits:2000000000000000000n}},tokens:{stock:{paused:true}}}};
  let claim=c.renderVals().claims[0];assert.equal(claim.unitsLabel,'PENDING UNITS');assert.equal(claim.worthFmt,'2');assert.notEqual(claim.reason,'Contract delivery recorded');
  c.frame.state.tokens.stock.paused=false;assert.equal(c.renderVals().claims[0].unitsLabel,'PENDING UNITS');
  c.frame.state.claims['1'].withdrawn=true;claim=c.renderVals().claims[0];assert.equal(claim.unitsLabel,'DELIVERED UNITS');assert.equal(claim.canWithdraw,false);
});
test('review 3: latest active receipt is visible, selection persists, and a confirmed new borrow selects its receipt',async()=>{
  const c=new Controller(),account=`0x${'ab'.repeat(20)}`;
  const position=(status:bigint)=>({receipt:{status,consent:{borrower:account}},benchmark:{finalized:false}});
  c.wallet={account,verified:true,send:async(_i:any,_u:any,refresh:any)=>{await refresh(2n);return {transactionHash:hash};}} as any;
  c.manifest={chainId:'31337'} as any;c.transport.prepare=async()=>({} as any);
  c.frame={block:{number:1n,hash,timestamp:1n},state:{receipts:{'1':position(3n),'2':position(1n)},pool:{},book:{}}};
  assert.equal(c.renderVals().receiptId,'2');
  c.renderVals().onReceipt({target:{value:'1'}});assert.equal(c.renderVals().receiptId,'1');
  c.refresh=async()=>{c.frame!.state.receipts['3']={...position(1n),receipt:{...position(1n).receipt,quoteHash:hash}};};
  await c.send({contract:'manager',method:'borrowWithCover',args:[{},[],[],hash]});assert.equal(c.renderVals().receiptId,'3');
  assert.deepEqual(c.renderVals().receiptOptions.map((x:any)=>x.id),['1','2','3']);
});
test('review 2: offer and receipt displays use current server coverage, never immutable capacity or global cash',()=>{
  const c=new Controller(),account=`0x${'ab'.repeat(20)}`;c.wallet={account} as any;
  c.frame={block:{number:1n,hash,timestamp:1n},state:{offers:{lot:{buyer:account,status:2n,receiptId:1n,terms:{expiry:2n},cashCapacity:100000000n,currentLockedCash:70000000n}},receipts:{'1':{receipt:{status:1n,consent:{borrower:account}},benchmark:{finalized:false},receiptRemainingCoverage:70000000n}},book:{totalLockedCash:999000000n}}};
  c.frame.state.offerCoverage={lot:{currentLockedCash:70000000n}};c.frame.state.pool={};const v=c.renderVals();assert.equal(v.offers[0].escFmt,'70');assert.equal(v.offers[0].capacityFmt,'100');assert.equal(v.bell.lockFmt,'70');
});
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
  let resolve!:(v:any)=>void;const first=new Promise<any>(r=>resolve=r);let count=0;c.transport.state=()=>++count===1?first:Promise.resolve({block:{number:2n,hash,timestamp:2n},state:{}});
  c.transport.events=async(block:any)=>({block,events:[]});
  const stale=c.refresh();await c.refresh();resolve({block:{number:1n,hash,timestamp:1n},state:{}});await assert.rejects(()=>stale,/superseded/);assert.equal(c.frame?.block.number,2n);
});
test('displayed stock ticker comes from the same contract snapshot',()=>{
  const c=new Controller();c.frame={block:{number:1n,hash,timestamp:1n},state:{tokens:{stock:{symbol:'mSTOCK',paused:false}},book:{},pool:{}}};assert.equal(c.renderVals().stockSymbol,'mSTOCK');
});
test('unsubmitted offer never claims contract validation or a computed escrow outcome',()=>{
  assert.equal(new Controller().renderVals().fEscrowFmt,'—');
});
