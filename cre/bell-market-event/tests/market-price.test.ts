import assert from 'node:assert/strict';
import test from 'node:test';
import { zeroHash, keccak256 } from 'viem';
import { decide, encodeReport } from '../src/core.ts';
import { marketFixture } from './market-fixtures.ts';
import { hash } from './fixtures.ts';
test('ordinary price uses active schedule and asset-level envelope independently of old target benchmark',()=>{
 const f=marketFixture();f.state.referencePrice='0';const d=decide(f.config,f.bundle,f.state,f.now);
 assert.equal(d.status,'submit');if(d.status!=='submit')throw Error(d.reason);
 assert.equal(d.report.kind,6);assert.equal(d.report.sessionId,zeroHash);assert.equal(d.report.scheduledOpen,800n);assert.equal(d.report.scheduledClose,1600n);
 assert.equal(d.report.benchmarkPrice,125000000n);assert.equal(d.report.corporateAction,0);assert.equal(d.report.actionId,zeroHash);
 assert.equal((encodeReport(d.report).length-2)/2,672);assert.equal(d.reportHash,keccak256(encodeReport(d.report)));
});
const invalid:[string,(f:any)=>void][]=[
 ['outer session',f=>f.bundle.sessionId=f.state.activeSessionId],['missing calendar session',f=>delete f.bundle.calendar.sessionId],['wrong calendar session',f=>f.bundle.calendar.sessionId=hash('wrong')],['missing calendar asset',f=>delete f.bundle.calendar.assetId],['wrong calendar config',f=>f.bundle.calendar.configHash=hash('wrong')],
 ['wrong primary session',f=>f.bundle.primary.sessionId=f.config.sessionId],['missing secondary identity',f=>delete f.bundle.secondary.assetId],['wrong active asset',f=>f.state.activeSession.assetId=hash('wrong')],['wrong active config',f=>f.state.activeSession.configHash=hash('wrong')],['no active session',f=>f.state.activeSessionId=zeroHash],['closed phase',f=>f.state.activeSession.phase=2],['unscheduled phase',f=>f.state.activeSession.phase=0],['active phase inconsistent',f=>f.state.activePhase=2],['halt',f=>f.state.halted=true],['closed calendar',f=>f.bundle.calendar.status='CLOSED'],['pre-open execution',f=>f.state.activeSession.scheduledOpen=f.bundle.calendar.scheduledOpen='1001'],['at-close execution',f=>f.state.activeSession.scheduledClose=f.bundle.calendar.scheduledClose='1000'],['wrong schedule',f=>f.bundle.calendar.scheduledClose='1601'],
 ['pre-open observation',f=>f.bundle.primary.observedAt='799'],['secondary pre-open',f=>f.bundle.secondary.observedAt='799'],['future primary',f=>f.bundle.primary.observedAt='1001'],['future secondary',f=>f.bundle.secondary.observedAt='1001'],['duplicate observation',f=>f.state.latestReference.observedAt='1000'],['older observation',f=>f.state.latestReference.observedAt='1001'],['zero price',f=>f.bundle.primary.price='0'],['price above uint96',f=>f.bundle.primary.price=(1n<<96n).toString()],['secondary above uint96',f=>f.bundle.secondary.price=(1n<<96n).toString()],['expired',f=>f.bundle.calendar.validUntil='999'],['overlong validity despite loose config',f=>{f.config.maxValiditySeconds='9999';f.bundle.calendar.validUntil='2801';}],['duplicate hash',f=>f.bundle.secondary.responseHash=f.bundle.primary.responseHash],['zero hash',f=>f.bundle.primary.responseHash=zeroHash],['same origin',f=>{f.config.providers.secondary.url='https://PRIMARY.example:443/other';f.bundle.secondary.url=f.config.providers.secondary.url;}],['disagreement',f=>f.bundle.secondary.price='130000000'],['missing corporate',f=>delete f.bundle.corporate],['wrong corporate asset',f=>f.bundle.corporate.assetId=hash('wrong')],['wrong default multiplier',f=>f.bundle.corporate.multiplierNumerator='2'],['corporate hash mismatch',f=>f.state.latestCorporateActionHash=hash('action')],['unsupported component',f=>f.bundle.corporate.multiplierNumerator=(1n<<64n).toString()],
];
for(const [name,change] of invalid)test(`ordinary price rejects ${name}`,()=>{const f=marketFixture();change(f);assert.equal(decide(f.config,f.bundle,f.state,f.now).status,'reject');});
test('ordinary freshness is bounded at1800 regardless of looser source configuration',()=>{
 const f=marketFixture();f.config.maxAgeSeconds='9999';f.config.maxValiditySeconds='9999';f.state.activeSession.scheduledClose=f.bundle.calendar.scheduledClose='5000';f.bundle.calendar.observedAt=f.bundle.corporate.observedAt='2800';f.bundle.calendar.validUntil='2800';f.now=2800n;
 assert.equal(decide(f.config,f.bundle,f.state,f.now).status,'submit');f.now=2801n;f.bundle.calendar.validUntil='2801';assert.equal(decide(f.config,f.bundle,f.state,f.now).status,'reject');
});
test('ordinary price binds current corporate hash64 components and exact action-time boundary',()=>{
 const f=marketFixture(), action=hash('split');f.state.latestCorporateActionHash=action;f.state.corporate={action:1,actionId:hash('action-id'),multiplierNumerator:'2',multiplierDenominator:'1',observedAt:'1000',reportHash:action};f.bundle.corporate={...f.bundle.corporate,...f.state.corporate,assetId:f.config.assetId};
 assert.equal(decide(f.config,f.bundle,f.state,f.now).status,'submit');f.bundle.primary.observedAt='999';assert.equal(decide(f.config,f.bundle,f.state,f.now).status,'reject');f.bundle.primary.observedAt='1000';f.bundle.secondary.observedAt='999';assert.equal(decide(f.config,f.bundle,f.state,f.now).status,'reject');
});
