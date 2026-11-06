import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256} from 'viem';
import {Controller} from '../../src/state/controller.ts';
import {ACTORS,ProviderDiscovery,parseAnnouncement} from '../../src/adapter/providers.ts';
import {abis} from '../../src/generated/abis.ts';
const hash=`0x${'ab'.repeat(32)}` as const;
const alice=ACTORS[0].address,rahul=ACTORS[1].address,meera=ACTORS[2].address,lender=ACTORS[3].address;
const ARC='0x4cef52';
const addresses=Object.fromEntries(Object.keys(abis).map((k,i)=>[k,`0x${(i+1).toString(16).padStart(40,'0')}`]));
const manifest={chainId:'5042002',deploymentBlock:'1',addresses,codeHashes:Object.fromEntries(Object.keys(addresses).map(k=>[k,keccak256('0x01')]))};
const block={number:'0x7',hash,parentHash:hash,timestamp:'0x64',transactions:[]};
/** Controlled EIP-1193 provider. It records every request so the tests can prove what was (not) asked. */
function wallet(account:string,chain=ARC){
  const calls:string[]=[],listeners=new Map<string,Set<(...a:any[])=>void>>(),state={account,chain};
  return {state,calls,
    emit:(event:string,...args:any[])=>listeners.get(event)?.forEach(f=>f(...args)),
    listenerCount:()=>[...listeners.values()].reduce((n,s)=>n+s.size,0),
    provider:{
      request:async({method}:{method:string})=>{calls.push(method);switch(method){
        case 'eth_requestAccounts':case 'eth_accounts':return [state.account];
        case 'eth_chainId':return state.chain;
        case 'eth_getBlockByNumber':return block;
        case 'eth_getCode':return '0x01';
        case 'eth_call':return '0x';
        default:throw Object.assign(Error(`unexpected ${method}`),{code:-32601});}},
      on:(e:string,f:(...a:any[])=>void)=>{(listeners.get(e)??listeners.set(e,new Set()).get(e)!).add(f);},
      removeListener:(e:string,f:(...a:any[])=>void)=>{listeners.get(e)?.delete(f);},
    }};
}
type W=ReturnType<typeof wallet>;
/** A page's EIP-6963 bus: wallets answer a request event with an announcement event. */
function bus(wallets:Array<[string,string,string,W]>){
  const target=new EventTarget();
  target.addEventListener('eip6963:requestProvider',()=>{for(const [uuid,name,rdns,w] of wallets)target.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid,name,icon:'data:,',rdns},provider:w.provider}}));});
  return target;
}
function app(wallets:Array<[string,string,string,W]>){
  const c=new Controller();c.manifest=manifest as any;
  c.transport.manifest=async()=>manifest as any;
  c.transport.state=async()=>({block:{number:7n,hash,timestamp:100n},state:{pool:{},book:{},loans:{},receipts:{},offers:{},claims:{},balances:{},assets:{},termsHashes:{},offerCoverage:{}}}) as any;
  c.transport.events=async(b:any)=>({block:b,events:[]}) as any;
  c.discovery=new ProviderDiscovery(bus(wallets));c.discovery.start();return c;
}
const metamask=(w:W):[string,string,string,W]=>['uuid-metamask','MetaMask','io.metamask',w];
const rabby=(w:W):[string,string,string,W]=>['uuid-rabby','Rabby Wallet','io.rabby',w];
test('discovery lists announced wallets without requesting accounts or chain',()=>{
  const a=wallet(alice),b=wallet(rahul),c=app([rabby(b),metamask(a)]);
  assert.deepEqual(c.discovery!.list().map(p=>p.name),['MetaMask','Rabby Wallet']);
  assert.deepEqual(a.calls,[]);assert.deepEqual(b.calls,[]);
  const v=c.renderVals();assert.deepEqual(v.wallet.providerOptions.map((p:any)=>p.label),['MetaMask · io.metamask','Rabby Wallet · io.rabby']);assert.equal(v.wallet.providerId,'');
  assert.equal(parseAnnouncement({info:{uuid:'x',name:'Bad'},provider:{}}),undefined);assert.equal(parseAnnouncement(null),undefined);
});
test('connection needs an explicit wallet and actor choice, then requests accounts exactly once',async()=>{
  const a=wallet(alice),b=wallet(rahul),c=app([metamask(a),rabby(b)]);
  await assert.rejects(()=>c.connect(),/Choose your wallet/);
  c.chooseProvider('uuid-metamask');await assert.rejects(()=>c.connect(),/Select the actor/);
  assert.equal(a.calls.includes('eth_requestAccounts'),false);assert.deepEqual(b.calls,[]);
  c.chooseActor('alice');await c.connect();
  assert.equal(a.calls.filter(m=>m==='eth_requestAccounts').length,1);assert.deepEqual(b.calls,[]);
  const v=c.renderVals();assert.equal(v.account,alice);assert.equal(v.wallet.chainId,'5042002');assert.equal(v.wallet.connected,true);assert.equal(v.wallet.expectedAddress,alice);assert.equal(v.ready,true);
});
test('either extension can hold any actor: roles are not bound to MetaMask or Rabby',async()=>{
  for(const [metaAccount,rabbyAccount,metaActor,rabbyActor] of [[alice,rahul,'alice','rahul'],[lender,meera,'lender','meera'],[rahul,alice,'rahul','alice']] as const){
    const a=wallet(metaAccount),b=wallet(rabbyAccount),c=app([metamask(a),rabby(b)]);
    c.chooseProvider('uuid-metamask');c.chooseActor(metaActor);await c.connect();assert.equal(c.renderVals().account,metaAccount);
    c.chooseProvider('uuid-rabby');assert.equal(c.wallet,undefined);c.chooseActor(rabbyActor);await c.connect();assert.equal(c.renderVals().account,rabbyAccount);
  }
});
test('a connected account that is not the selected actor is refused and cannot sign',async()=>{
  const a=wallet(alice),c=app([metamask(a)]);c.chooseProvider('uuid-metamask');c.chooseActor('rahul');
  await assert.rejects(()=>c.connect(),/not the selected actor/);
  assert.equal(c.wallet,undefined);const v=c.renderVals();assert.equal(v.account,undefined);assert.equal(v.ready,false);
  await assert.rejects(()=>c.send({contract:'pool',method:'deposit',args:['1']}),/Connect and verify/);assert.equal(a.calls.includes('eth_sendTransaction'),false);
});
test('a wallet on the wrong chain is refused until switched to 5042002',async()=>{
  const a=wallet(alice,'0x1'),c=app([metamask(a)]);c.chooseProvider('uuid-metamask');c.chooseActor('alice');
  await assert.rejects(()=>c.connect(),/chain mismatch · switch the wallet to chain 5042002/);assert.equal(c.renderVals().ready,false);
  a.state.chain=ARC;await c.connect();assert.equal(c.renderVals().ready,true);
});
test('switching wallet or actor clears consent, previous verification and the snapshot',async()=>{
  const a=wallet(alice),b=wallet(rahul),c=app([metamask(a),rabby(b)]);
  c.chooseProvider('uuid-metamask');c.chooseActor('alice');await c.connect();assert.equal(c.renderVals().ready,true);
  const dirty=()=>{c.quoteText='{"consent":1}';c.selected=['0x01'];c.loanArgs='[1]';c.termsText='{"t":1}';c.hash='0xdead';};
  dirty();c.chooseProvider('uuid-rabby');
  assert.equal(c.wallet,undefined);assert.equal(c.quoteText,'');assert.deepEqual(c.selected,[]);assert.equal(c.loanArgs,'');assert.equal(c.termsText,'');assert.equal(c.hash,'');assert.equal(c.frame,undefined);assert.match(c.status,/reconnect required/);
  assert.equal(a.listenerCount(),0);assert.equal(c.renderVals().ready,false);
  c.chooseActor('rahul');await c.connect();assert.equal(c.renderVals().ready,true);dirty();c.chooseActor('meera');
  assert.equal(c.quoteText,'');assert.equal(c.wallet,undefined);assert.equal(c.renderVals().ready,false);assert.equal(b.listenerCount(),0);
});
test('account, chain and disconnect events invalidate the session and block signing until fresh verification',async()=>{
  for(const event of ['accountsChanged','chainChanged','disconnect']){
    const a=wallet(alice),c=app([metamask(a)]);c.chooseProvider('uuid-metamask');c.chooseActor('alice');await c.connect();
    c.quoteText='{"consent":1}';c.hash='0xdead';a.emit(event,[]);
    assert.equal(c.quoteText,'');assert.equal(c.hash,'');assert.equal(c.frame,undefined);assert.equal(c.renderVals().ready,false);assert.equal(c.renderVals().account,undefined);
    await assert.rejects(()=>c.send({contract:'pool',method:'deposit',args:['1']}),/Connect and verify/);assert.equal(a.calls.includes('eth_sendTransaction'),false);
    await c.connect();assert.equal(c.renderVals().ready,true);
  }
});
test('signing is blocked when the wallet account changes underneath a connected session',async()=>{
  const a=wallet(alice),c=app([metamask(a)]);c.chooseProvider('uuid-metamask');c.chooseActor('alice');await c.connect();
  const unsigned={chainId:'5042002',from:alice,to:addresses.pool,data:c.wallet!.expected({contract:'pool',method:'deposit',args:['1']}).data,value:'0',sourceBlock:'7',sourceBlockHash:hash} as any;
  a.state.account=rahul;await assert.rejects(()=>c.wallet!.send({contract:'pool',method:'deposit',args:['1']},unsigned,async()=>{}),/account/i);
  a.state.account=alice;await c.connect();a.state.chain='0x1';await assert.rejects(()=>c.wallet!.send({contract:'pool',method:'deposit',args:['1']},unsigned,async()=>{}),/chain/i);
  assert.equal(a.calls.includes('eth_sendTransaction'),false);
});
test('the single-provider window.ethereum fallback still works when nothing announces itself',async()=>{
  const a=wallet(alice),c=app([]);(globalThis as any).window={ethereum:a.provider};
  try{
    const v=c.renderVals();assert.equal(v.wallet.providerOptions.length,1);assert.equal(v.wallet.providerOptions[0].id,'window.ethereum');
    assert.deepEqual(a.calls,[]);c.chooseActor('alice');await c.connect();assert.equal(c.renderVals().account,alice);
  }finally{delete (globalThis as any).window;}
});

test('silently detected account and chain changes clear unsigned consent',async()=>{
 for(const change of ['account','chain'] as const){
  const a=wallet(alice),c=app([metamask(a)]);c.chooseProvider('uuid-metamask');c.chooseActor('alice');await c.connect();
  const intent={contract:'pool',method:'deposit',args:['1']},unsigned={chainId:'5042002',from:alice,to:addresses.pool,data:c.wallet!.expected(intent).data,value:'0',sourceBlock:'7',sourceBlockHash:hash} as any;
  c.quoteText='old consent';c.selected=['old'];if(change==='account')a.state.account=rahul;else a.state.chain='0x1';
  await assert.rejects(()=>c.wallet!.send(intent,unsigned,async()=>{}),/account|chain/i);
  assert.equal(c.wallet!.verified,false);assert.equal(c.quoteText,'');assert.deepEqual(c.selected,[]);assert.equal(c.frame,undefined);
 }
});

test('connecting through the legacy fallback records its provider identity',async()=>{
 const a=wallet(alice),c=app([]);(globalThis as any).window={ethereum:a.provider};
 try{c.chooseActor('alice');await c.connect();assert.equal(c.providerId,'window.ethereum');}
 finally{delete (globalThis as any).window;}
});
