import assert from 'node:assert/strict';
import test from 'node:test';
import { InvocationBudget, checkedObservation, consensusObservationSize, CONSENSUS_OBSERVATION_LIMIT } from '../src/budget.ts';
import { normalizeQuote } from '../src/quotes.ts';
import { hash } from './fixtures.ts';
test('default cumulative capability budgets reject before dispatch and never reset on retry',()=>{
 for(const [kind,limit] of [['chain',15],['http',15],['consensus',50],['secret',5],['write',1]] as const){const b=new InvocationBudget();for(let i=0;i<limit;i++)b.take(kind);assert.throws(()=>b.take(kind),/^Error: RESOURCE_BUDGET$/);assert.throws(()=>b.take(kind),/^Error: RESOURCE_BUDGET$/);}
});
test('consensus checks actual SDK protobuf size with escape and multibyte headroom',()=>{
 for(const unit of ['a','\\u0000','😀','\\"']){let lo=0,hi=24001;while(lo+1<hi){const mid=Math.floor((lo+hi)/2);if(consensusObservationSize(unit.repeat(mid))<=CONSENSUS_OBSERVATION_LIMIT)lo=mid;else hi=mid;}const s=unit.repeat(lo);assert.equal(checkedObservation(s),s);assert.throws(()=>checkedObservation(s+unit),/^Error: CONSENSUS_OBSERVATION_SIZE$/);assert.ok(consensusObservationSize(s)<25000);}
});
test('workflow observation cap does not shrink the independent quote parser',()=>{
 const raw=JSON.stringify({c:140,t:1000,padding:'x'.repeat(25000)});assert.throws(()=>checkedObservation(raw));assert.equal(normalizeQuote('finnhub',raw,{symbol:'NVDA',assetId:hash('asset'),sessionId:hash('session')}).price,'140000000');
});
