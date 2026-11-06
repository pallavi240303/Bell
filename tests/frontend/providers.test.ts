import test from 'node:test';
import assert from 'node:assert/strict';
import {ProviderDiscovery,fallbackProvider} from '../../src/adapter/providers.ts';
function announce(target:EventTarget,provider:any,name:string,uuid='same-uuid'){const event=new Event('eip6963:announceProvider');Object.assign(event,{detail:{info:{name,uuid,rdns:'same.wallet',icon:'javascript:globalThis.compromised=true'},provider}});target.dispatchEvent(event);}
test('duplicate UUIDs do not replace provider objects and repeated objects retain their identity',()=>{
 const target=new EventTarget(),calls:string[]=[],first={isMetaMask:true,request:async()=>{calls.push('first');return[];}},second={isMetaMask:true,request:async()=>{calls.push('second');return[];}};
 const d=new ProviderDiscovery(target);d.start();announce(target,first,'MetaMask');const id=d.list()[0]!.id;
 announce(target,first,'Duplicate','different-uuid');announce(target,second,'Rabby');
 assert.equal(d.list().length,2);assert.equal(d.get(id)!.provider,first);assert.equal(new Set(d.list().map(x=>x.id)).size,2);assert.deepEqual(calls,[]);d.stop();
});
test('wallet announcement names are plain text and icons are never copied',()=>{
 const target=new EventTarget(),provider={request:async()=>[]},d=new ProviderDiscovery(target);d.start();announce(target,provider,'<img src=x onerror=alert(1)>');
 assert.equal(d.list()[0]!.name,'<img src=x onerror=alert(1)>');assert.equal('icon' in d.list()[0]!,false);assert.equal(fallbackProvider({ethereum:provider})!.provider,provider);d.stop();
});
