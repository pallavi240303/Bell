// Test-only FFI. Actual Solidity supplies domain, nonce, clock and scheduled facts.
// No network, environment, wallet or credential access.
import { execute } from '../src/core.ts';
import { fixture } from '../tests/fixtures.ts';
import { zeroHash } from 'viem';
const [kind,chainId,oracle,receiver,forwarder,registry,assetId,sessionId,activeSessionId,configHash,nonce,stateHash,now,price,open,close,closeObservedAt,previousObservedAt]=process.argv.slice(2);
if(!previousObservedAt || !['3','6'].includes(kind!))throw Error('FFI_ARGUMENTS');
const f=fixture();
const config={...f.config,chainId,oracle,simulationReceiver:receiver,simulationForwarder:forwarder,registry,assetId,sessionId};
const bundle={...f.bundle,kind:Number(kind),assetId,sessionId:kind==='6'?zeroHash:sessionId,configHash,
 calendar:{...f.bundle.calendar,assetId,sessionId:activeSessionId,configHash,observedAt:now,validUntil:(BigInt(now!)+100n).toString(),scheduledOpen:open,scheduledClose:close,scheduledReopen:(BigInt(close!)+1n).toString()},
 primary:{...f.bundle.primary,assetId,sessionId:activeSessionId,observedAt:now,price},secondary:{...f.bundle.secondary,assetId,sessionId:activeSessionId,observedAt:now,price},corporate:{...f.bundle.corporate,assetId,observedAt:now}};
const session={assetId,configHash,scheduledOpen:open,scheduledClose:close,closeObservedAt,phase:kind==='6'?1:2};
const state={...f.state,chainId,oracle,receiver,forwarder,assetId,registryConfigHash:configHash,configEffectiveAt:'1001',nextNonce:nonce,stateHash,configHash,activeSessionId,activePhase:session.phase,referencePrice:'100000000',session,activeSession:session,latestReference:{...f.state.latestReference,observedAt:previousObservedAt}};
let payload='';const result=execute(config,{now:()=>BigInt(now!),readState:()=>state,observe:()=>bundle,submit:(_target,bytes)=>{payload=bytes;return {status:'success'};},log:()=>{}});
if(result.status!=='submitted')throw Error(`FFI_${result.status}_${result.reason}`);
process.stdout.write(payload);
