import {sample} from './fixtures.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as actions from '../../src/adapter/actions.ts';
import {decodeFrame,json} from '../../src/adapter/transport.ts';
import {Controller} from '../../src/state/controller.ts';
import {quoteHash} from '../../engine/quote.ts';
const h=(n:string)=>`0x${n.repeat(64)}` as `0x${string}`,a=(n:string)=>`0x${n.repeat(40)}` as `0x${string}`;
test('optional: canonical durable loans and references decode independently of receipts',()=>{
 const {frame}=sample();const parsed=decodeFrame(JSON.parse(json(frame)));assert.equal(parsed.state.loans['7'].debt,399100000n);assert.deepEqual(parsed.state.pool.activeLoanIds,[7n]);
 assert.throws(()=>decodeFrame(JSON.parse(json({...frame,state:{...frame.state,loans:{'7':{...frame.state.loans['7'],loan:{borrower:a('a')}}}}}))),/Missing tuple/);
});
test('optional: verified metadata builds borrow and V2 cover preview without handcrafted hashes',()=>{
 const x=sample(),m=actions as any;assert.equal(typeof m.borrowRequest,'function');assert.equal(typeof m.coverPreview,'function');
 const request=m.borrowRequest(x.frame,x.account,{principal:'400000000',collateralShares:'10000000000000000000'});assert.equal(request.configHash,h('3'));assert.equal(request.referenceReportHash,h('6'));assert.equal(request.recipient,x.account);
 const q=m.coverPreview(x.frame,'31337',x.manager,x.account,'7',x.ids);assert.equal(q.loanId,'7');assert.equal(q.principal,'400000000');assert.equal(q.totalPremium,'100');assert.equal(q.weightedStrike,'100000000');assert.equal(q.minSettlementDeadline,q.maxSettlementDeadline);
 const parsed=Object.fromEntries(Object.entries(q).map(([k,v])=>[k,typeof v==='string'&&/^[0-9]+$/.test(v)?BigInt(v):v]));assert.equal(m.hashBundle('31337',x.manager,q,x.ids,x.hashes),quoteHash(31337n,x.manager,parsed as any,x.ids,x.hashes));
 assert.equal(m.coverPreview(x.frame,'31337',x.manager,x.account,'7',x.ids,{maxDebtAtAcceptance:'1'}).maxDebtAtAcceptance,'1');
});
test('optional: uncovered loan displays debt independently of receipt identity',()=>{
 const x=sample(),c=new Controller();c.wallet={account:x.account,verified:true} as any;c.frame=x.frame;c.manifest={chainId:'31337',addresses:{manager:x.manager}} as any;
 const v=c.renderVals();assert.equal(v.loanId,'7');assert.equal(v.bell.debtFmt,'399.1');assert.match(v.bell.badge,/ACTIVE/);assert.equal(v.coverStatus,'UNCOVERED');assert.equal(v.buyOk,false);
});
test('optional: stale reference or nonce clears reviewed consent; manual caps are never widened',()=>{
 const x=sample(),c=new Controller();c.wallet={account:x.account,verified:true} as any;c.frame=x.frame;c.manifest={chainId:'31337',addresses:{manager:x.manager}} as any;c.selected=x.ids;c.previewCover();assert.ok(c.quoteText);const q=JSON.parse(c.quoteText);q.maxDebtAtAcceptance='1';c.set('quoteText',JSON.stringify(q));c.previewCover();assert.equal(JSON.parse(c.quoteText).maxDebtAtAcceptance,'1');c.quoteLocked=true;x.frame.state.balances[x.account].borrowerNonce=1n;c.prefill();assert.equal(c.quoteText,'');assert.equal(c.quoteLocked,false);assert.deepEqual(c.selected,[]);
});
test('optional: cover interval and reference invalidation cannot produce a ready preview',()=>{
 const x=sample(),m=actions as any;x.frame.state.assets[x.asset].latestReference.observedAt=99390n;
 for(const now of [99399n,99940n]){x.frame.block.timestamp=now;assert.throws(()=>m.coverPreview(x.frame,'31337',x.manager,x.account,'7',x.ids),/window/);}
 x.frame.block.timestamp=99400n;assert.ok(m.coverPreview(x.frame,'31337',x.manager,x.account,'7',x.ids));x.frame.state.assets[x.asset].referenceCheck.referenceInvalidated=true;assert.throws(()=>m.coverPreview(x.frame,'31337',x.manager,x.account,'7',x.ids),/reference/);
});
