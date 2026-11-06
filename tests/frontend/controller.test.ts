import test from 'node:test';
import assert from 'node:assert/strict';
import {sample} from './fixtures.ts';
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
  c.frame={block:{number:1n,hash,timestamp:1n},state:{pool:{},book:{},claims:{'1':{owner:account,receiptId:7n,withdrawn:false,deliveryUnits:2000000000000000000n}},tokens:{stock:{paused:true}}}};
  let claim=c.renderVals().claims[0];assert.equal(claim.unitsLabel,'PENDING UNITS');assert.equal(claim.worthFmt,'2');assert.notEqual(claim.reason,'Contract delivery recorded');
  c.frame.state.tokens.stock.paused=false;assert.equal(c.renderVals().claims[0].unitsLabel,'PENDING UNITS');
  c.frame.state.claims['1'].withdrawn=true;claim=c.renderVals().claims[0];assert.equal(claim.unitsLabel,'DELIVERED UNITS');assert.equal(claim.canWithdraw,false);
});
test('review 3: durable loan selection persists independently of cover receipt IDs',()=>{
 const x=sample(),c=new Controller();c.wallet={account:x.account,verified:true} as any;c.manifest={chainId:'31337',addresses:{manager:x.manager}} as any;c.frame=x.frame;
 c.frame!.state.loans['9']={...x.p,loan:{...x.p.loan,status:1n}};
 assert.equal(c.renderVals().loanId,'9');c.renderVals().onReceipt({target:{value:'7'}});assert.equal(c.renderVals().loanId,'7');assert.deepEqual(c.renderVals().receiptOptions.map((o:any)=>o.id),['7','9']);
});
test('review 2: offer and loan displays use current coverage, never immutable capacity or global cash',()=>{
 const x=sample(),c=new Controller();c.wallet={account:x.account,verified:true} as any;c.frame=x.frame;
 x.p.currentCoverage=70000000n;x.frame.state.offerCoverage[x.ids[0]!]={currentLockedCash:70000000n};const v=c.renderVals();assert.equal(v.offers[0].escFmt,'70');assert.equal(v.offers[0].capacityFmt,'500');assert.equal(v.bell.lockFmt,'70');
});
test('controller renders absent finances as unavailable and labels separate sources of authority',()=>{
  const v=new Controller().renderVals();assert.equal(v.bell.debtFmt,'—');assert.equal(v.lend.balFmt,'—');assert.equal(v.outcome.show,false);assert.equal(v.labels.network,'UNVERIFIED');assert.equal(v.labels.clock,'BLOCK TIME');assert.equal(v.labels.authority,'CONTRACT SETTLEMENT');assert.equal(v.labels.signing,'CONNECTED WALLET');
});
test('ended cover leaves residual loan finances and does not imply claim delivery',()=>{
 const x=sample(),c=new Controller();c.wallet={account:x.account,verified:true} as any;c.frame=x.frame;
 x.frame.state.receipts['12']={receipt:{loanId:7n,status:2n,consent:{borrower:x.account}},benchmark:{finalized:false},receiptRemainingCoverage:0n};
 const v=c.renderVals();assert.equal(v.bell.badge,'ACTIVE');assert.equal(v.coverStatus,'COVER ENDED');assert.equal(v.bell.debtFmt,'399.1');assert.equal(v.bell.shFmt,'10');assert.equal(v.outcome.show,false);
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
