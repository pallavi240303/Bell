import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../../src/state/controller.ts';
import {sample} from './fixtures.ts';
// Catches a /prepare response being sent through a newly selected extension.
test('provider selection drops consent and rejects a late unsigned prepare response before signing',async()=>{
 const target=new EventTarget() as any,provider={request:async()=>[]};target.ethereum=provider;
 const previous=globalThis.window;globalThis.window=target;
 try{
  const x=sample(),c=new Controller();let sent=0,finish!:(v:any)=>void;
  c.manifest={chainId:'31337'} as any;c.frame=x.frame;c.quoteText='old consent';c.quoteLocked=true;c.selected=['old'];c.loanArgs='["7"]';
  const wallet:any={account:x.account,verified:true,dispose(){this.account=undefined;this.verified=false;},send:async()=>{sent++;throw Error('must not sign');}};c.wallet=wallet;
  c.transport.prepare=()=>new Promise(resolve=>finish=resolve);
  const pending=c.send({settlement:'settle',receiptId:'12'} as any);
  c.chooseProvider('window.ethereum');assert.equal(c.frame,undefined);assert.equal(c.quoteText,'');assert.equal(c.quoteLocked,false);assert.deepEqual(c.selected,[]);assert.equal(c.loanArgs,'');assert.equal(c.wallet,undefined);
  finish({});await assert.rejects(()=>pending,/wallet changed/i);assert.equal(sent,0);assert.equal(c.pending,false);
 }finally{globalThis.window=previous;}
});
test('settlement uses one explicit canonical receipt argument and never derives it from the loan',async()=>{
 const c=new Controller();let intent:any;c.send=async(value:any)=>{intent=value;return {} as any;};
 c.loanMethod='settle';c.loanArgs='["12"]';c.selectedLoanId='7';await c.loanAction();assert.deepEqual(intent,{settlement:'settle',receiptId:'12'});
 c.loanMethod='terminalSettle';await c.loanAction();assert.deepEqual(intent,{settlement:'terminalSettle',receiptId:'12'});
 for(const args of ['[]','["12","7"]','[12]','["01"]','{"receiptId":"12"}']){c.loanArgs=args;await assert.rejects(()=>c.loanAction());}
});

test('late preparation cannot move to a different wallet for the same account',async()=>{
 const c=new Controller(),x=sample();let finish!:(v:any)=>void,signatures=0;
 c.manifest={chainId:'31337'} as any;
 c.wallet={account:x.account,verified:true,dispose(){},send:async()=>{throw Error('old wallet must not sign');}} as any;
 c.transport.prepare=()=>new Promise(resolve=>finish=resolve);
 const pending=c.send({contract:'pool',method:'deposit',args:['1']});
 c.chooseProvider('other');
 c.wallet={account:x.account,verified:true,send:async()=>{signatures++;return {transactionHash:'late'};}} as any;
 finish({});await assert.rejects(()=>pending,/wallet changed/i);assert.equal(signatures,0);
});
