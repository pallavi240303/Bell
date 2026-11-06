import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quoteHash as referenceHash} from '../../engine/quote.ts';
import {argsFor} from '../../services/keeper/abi.ts';
import {Controller} from '../../src/state/controller.ts';
const hash=(n:string)=>`0x${n.repeat(64)}`;
test('review 1: post and edit validate the same complete visible terms before any cancellation',async()=>{
  const input=JSON.parse(readFileSync('services/keeper/fixtures/replay.json','utf8'));
  const c=new Controller(),calls:any[]=[];
  c.send=async(i:any)=>{calls.push(i);return {} as any;};
  c.frame={block:{number:1n,hash:hash('1') as any,timestamp:1n},state:{offers:{lot:{status:1n,terms:{nonce:1n}}}}};
  c.termsText=JSON.stringify({...input.offerCommon,assetId:hash('1'),policyHash:hash('2'),snapshotShares:'1000000000000000000',strike:'100000000',premium:'1000000',nonce:'2'});
  c.fShares='5';c.fPct='120';c.fFee='3';await c.post();await c.edit('lot');
  assert.deepEqual(calls[0].args,calls[2].args);
  assert.equal(calls[2].args[0].snapshotShares,'5000000000000000000');assert.equal(calls[2].args[0].strike,'120000000');assert.equal(calls[2].args[0].premium,'3000000');
  for(const bad of [{...JSON.parse(c.termsText),expiry:true},{...JSON.parse(c.termsText),assetId:'0x12'},{nonce:'3'}]){
    c.termsText=JSON.stringify(bad);calls.length=0;await assert.rejects(()=>c.edit('lot'));assert.equal(calls.length,0);
  }
});
test('cover bundle preserves explicit loan, caller selected order and exact terms hashes',async()=>{
  const m=await import('../../src/adapter/actions.ts').catch(()=>null);assert.ok(m,'exact actor intents required');
  assert.throws(()=>m.coverIntent('7',{},[],[],hash('a')),/one to eight/);
  assert.throws(()=>m.coverIntent('7',{},[hash('1'),hash('2')],[hash('3')],hash('a')),/hash/);
  const quote={borrower:'caller'};const intent=m.coverIntent('7',quote,[hash('2'),hash('1')],[hash('3'),hash('4')],hash('a'));
  assert.deepEqual(intent,{contract:'manager',method:'buyCover',args:['7',quote,[hash('2'),hash('1')],[hash('3'),hash('4')],hash('a')]});
});
test('buyer edit requires FREE status, cancellation receipt, and fresh nonce before repost',async()=>{
  const m=await import('../../src/adapter/actions.ts').catch(()=>null);assert.ok(m,'edit orchestration required');const calls:any[]=[];
  await assert.rejects(()=>m.editOffer({status:2n,terms:{nonce:1n}},hash('1'),{nonce:'2'},async(i:any)=>{calls.push(i);}),/FREE/);assert.equal(calls.length,0);
  await assert.rejects(()=>m.editOffer({status:1n,terms:{nonce:1n}},hash('1'),{nonce:'1'},async()=>{}),/nonce/);
  await assert.rejects(()=>m.editOffer({status:1n,terms:{nonce:1n}},hash('1'),{nonce:'2'},async()=>{throw Error('cancel rejected');}),/cancel rejected/);
  await m.editOffer({status:1n,terms:{nonce:1n}},hash('1'),{nonce:'2'},async(i:any)=>{calls.push(i);});assert.deepEqual(calls.map(i=>i.method),['cancelOffer','postOffer']);
});
test('receipt projection separates financial closure from delivery without inventing settlement',async()=>{
  const {receiptLabel}=await import('../../src/state/truth.ts');assert.equal(receiptLabel(1n),'ACTIVE');assert.equal(receiptLabel(2n),'ENDED');assert.equal(receiptLabel(3n),'UNKNOWN');
});
test('browser quote hashing uses the generated contract tuple and matches the exact consent domain',async()=>{
  const m=await import('../../src/adapter/actions.ts') as any;assert.equal(typeof m.hashBundle,'function','generated tuple hashing required');
  const input=JSON.parse(readFileSync('services/keeper/fixtures/replay.json','utf8'));
  const q={...input.consent,borrower:input.actors.borrower,recipient:input.actors.borrower,assetId:hash('1'),sessionId:hash('2'),configHash:hash('3'),policyHash:hash('4'),scheduledReportHash:hash('5'),corporateActionHash:hash('0'),weightedStrike:'95000000',loanId:'7',referenceReportHash:hash('8')};
  const ids=[hash('6')],terms=[hash('7')],manager=input.actors.owner;
  const parsed=argsFor('CoverManager','buyCover',['7',q,ids,terms,hash('0')])[1];
  assert.equal(m.hashBundle('31337',manager,q,ids,terms),referenceHash(31337n,manager,parsed,ids as any,terms as any));
});
