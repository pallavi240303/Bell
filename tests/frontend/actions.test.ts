import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quoteHash as referenceHash} from '../../engine/quote.ts';
import {argsFor} from '../../services/keeper/abi.ts';
const hash=(n:string)=>`0x${n.repeat(64)}`;
test('borrow bundle preserves caller selected order, exact terms hashes, and one atomic calldata intent',async()=>{
  const m=await import('../../src/adapter/actions.ts').catch(()=>null);assert.ok(m,'exact actor intents required');
  assert.throws(()=>m.borrowIntent({},[],[],hash('a')),/one to eight/);
  assert.throws(()=>m.borrowIntent({},[hash('1'),hash('2')],[hash('3')],hash('a')),/hash/);
  const quote={borrower:'caller'};const intent=m.borrowIntent(quote,[hash('2'),hash('1')],[hash('3'),hash('4')],hash('a'));
  assert.deepEqual(intent,{contract:'manager',method:'borrowWithCover',args:[quote,[hash('2'),hash('1')],[hash('3'),hash('4')],hash('a')]});
});
test('buyer edit requires FREE status, cancellation receipt, and fresh nonce before repost',async()=>{
  const m=await import('../../src/adapter/actions.ts').catch(()=>null);assert.ok(m,'edit orchestration required');const calls:any[]=[];
  await assert.rejects(()=>m.editOffer({status:2n,terms:{nonce:1n}},hash('1'),{nonce:'2'},async(i:any)=>{calls.push(i);}),/FREE/);assert.equal(calls.length,0);
  await assert.rejects(()=>m.editOffer({status:1n,terms:{nonce:1n}},hash('1'),{nonce:'1'},async()=>{}),/nonce/);
  await assert.rejects(()=>m.editOffer({status:1n,terms:{nonce:1n}},hash('1'),{nonce:'2'},async()=>{throw Error('cancel rejected');}),/cancel rejected/);
  await m.editOffer({status:1n,terms:{nonce:1n}},hash('1'),{nonce:'2'},async(i:any)=>{calls.push(i);});assert.deepEqual(calls.map(i=>i.method),['cancelOffer','postOffer']);
});
test('receipt projection separates financial closure from delivery without inventing settlement',async()=>{
  const {receiptLabel}=await import('../../src/state/truth.ts');assert.equal(receiptLabel(1n),'ACTIVE');assert.equal(receiptLabel(2n),'HANDOFF_PENDING');assert.equal(receiptLabel(3n),'CLOSED');
});
test('browser quote hashing uses the generated contract tuple and matches the exact consent domain',async()=>{
  const m=await import('../../src/adapter/actions.ts') as any;assert.equal(typeof m.hashBundle,'function','generated tuple hashing required');
  const input=JSON.parse(readFileSync('services/keeper/fixtures/replay.json','utf8'));
  const q={...input.consent,borrower:input.actors.borrower,recipient:input.actors.borrower,assetId:hash('1'),sessionId:hash('2'),configHash:hash('3'),policyHash:hash('4'),scheduledReportHash:hash('5'),corporateActionHash:hash('0'),weightedStrike:'95000000'};
  const ids=[hash('6')],terms=[hash('7')],manager=input.actors.owner;
  const parsed=argsFor('CoverManager','borrowWithCover',[q,ids,terms,hash('0')])[0];
  assert.equal(m.hashBundle('31337',manager,q,ids,terms),referenceHash(31337n,manager,parsed,ids as any,terms as any));
});
