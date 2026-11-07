import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arcGproConfig,assertGproReport} from '../../scripts/gpro-arc.ts';
import {GOPRO_ASSET} from '../../services/keeper/gpro.ts';
import {zeroHash} from 'viem';
const address='0x1111111111111111111111111111111111111111',hash=`0x${'12'.repeat(32)}`;
const manifest:any={chainId:'5042002',addresses:{oracle:address,registry:address,receiver:address}};
const session={id:hash,reference:hash,open:1000,close:1700,reopen:1702};
test('Arc historical configuration retains real chain and historical stage with an explicit compressed clock',()=>{
 const c=arcGproConfig(manifest,address,hash,session,'cover',1500);
 assert.equal(c.chainId,'5042002');assert.equal(c.chainName,'arc-testnet');assert.equal(c.assetId,GOPRO_ASSET);assert.equal(c.mode,'replay');assert.equal(c.historical.stage,'cover');assert.equal(c.replay.sessionId,zeroHash);assert.equal(c.replay.calendar.scheduledClose,'1700');
 assert.throws(()=>arcGproConfig({...manifest,chainId:'31337'},address,hash,session,'cover',1500),/ARC_ONLY/);
});
test('accepted report must bind to the exact GoPro domain, nonce and independently known price',()=>{
 const c=arcGproConfig(manifest,address,hash,session,'cover',1500),before={nextNonce:2n,stateHash:hash};
 const r:any[]=[1,6,5042002n,address,GOPRO_ASSET,zeroHash,hash,2n,hash,1500n,3000n,1000n,1700n,1775000n];
 assert.doesNotThrow(()=>assertGproReport(c,before,r));
 for(const [i,value] of [[2,31337n],[4,zeroHash],[7,3n],[13,1700000n]] as const){const altered=[...r];altered[i]=value;assert.throws(()=>assertGproReport(c,before,altered));}
});
