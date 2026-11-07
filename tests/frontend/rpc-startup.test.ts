import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../../src/state/controller.ts';

test('hosted RPC reads survive a response beyond the old ten-second browser deadline',async()=>{
 const fetcher=globalThis.fetch;let calls=0;
 globalThis.fetch=async(_input,init)=>{calls++;await new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,10_500);init?.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(init.signal!.reason);},{once:true});});return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:'0x4cef52'}),{headers:{'Content-Type':'application/json'}});};
 try{const c=new Controller();assert.equal(await (c as any).httpRpc().getChainId(),5042002);assert.equal(calls,1);}finally{globalThis.fetch=fetcher;}
});

test('slow startup cannot overwrite a newer wallet session or launch its stale refresh',async()=>{
 const prior=(globalThis as any).window;const win=new EventTarget() as any;win.innerWidth=1400;win.ethereum=undefined;(globalThis as any).window=win;
 let resolve!: (value:any)=>void;const deferred=new Promise<any>(r=>resolve=r);const c=new Controller();let refreshes=0;c.transport.manifest=()=>deferred;c.refresh=async()=>{refreshes++;};
 try{c.start();c.chooseProvider('new-wallet');const selectedRpc={selected:true};c.rpc=selectedRpc;resolve({chainId:'5042002'});await new Promise(r=>setTimeout(r,0));assert.equal(c.rpc,selectedRpc);assert.equal(refreshes,0);}finally{c.stop();(globalThis as any).window=prior;}
});
