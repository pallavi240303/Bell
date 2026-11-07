import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './fixtures.ts';
import {observeHistorical, historicalRequest, historicalPoint} from '../src/historical.ts';
const raw=(name:string)=>readFileSync(new URL(`../fixtures/gpro/${name}.json`,import.meta.url),'utf8');
function config(stage:string){const f=fixture();return {...f.config,dataSource:'gpro-history',historical:{stage},providers:{...f.config.providers,primary:{id:'twelvedata',url:'https://api.twelvedata.com/time_series'},secondary:{id:'yahoo',url:'https://query2.finance.yahoo.com/v8/finance/chart/GPRO'}},replay:{...f.bundle,kind:stage==='reopen'?3:6}};}
for(const [stage,price,first,second] of [['origination','1969900','twelve-origination','yahoo-hourly'],['cover','1775000','twelve-cover','yahoo-hourly'],['reopen','1565000','twelve-daily','yahoo-daily']])test(`GoPro ${stage} reads the exact historical opening field from two providers`,()=>{
 const c=config(stage!);const b=observeHistorical(c,key=>raw(key==='primary'?first!:second!));
 assert.equal(b.primary!.price,price);assert.equal(b.secondary!.price,price);assert.notEqual(b.primary!.responseHash,b.secondary!.responseHash);
 assert.equal(b.primary!.observedAt,c.replay.primary.observedAt);assert.equal(historicalPoint(stage!).symbol,'GPRO');
});
test('history cannot enter live mode or use a different symbol/timezone/absent bar',()=>{
 assert.throws(()=>observeHistorical({...config('cover'),mode:'live'},()=>raw('twelve-cover')),/HISTORY_REPLAY_ONLY/);
 for(const mutate of [(d:any)=>d.meta.symbol='NVDA',(d:any)=>d.meta.exchange_timezone='UTC',(d:any)=>d.values=[]]){
  const d=JSON.parse(raw('twelve-cover'));mutate(d);assert.throws(()=>observeHistorical(config('cover'),key=>key==='primary'?JSON.stringify(d):raw('yahoo-hourly')),/HISTORY_/);
 }
});
test('invalid/duplicate bars and unsupported corporate events fail closed',()=>{
 const d=JSON.parse(raw('twelve-cover'));d.values.push(d.values.find((v:any)=>v.datetime==='2026-09-04 14:30:00'));
 assert.throws(()=>observeHistorical(config('cover'),key=>key==='primary'?JSON.stringify(d):raw('yahoo-hourly')),/HISTORY_/);
 const y=JSON.parse(raw('yahoo-hourly'));y.chart.result[0].events={splits:{x:{}}};
 assert.throws(()=>observeHistorical(config('cover'),key=>key==='primary'?raw('twelve-cover'):JSON.stringify(y)),/HISTORY_CORPORATE/);
});
test('requests are fixed provider endpoints; keys never enter bundle metadata',()=>{
 const c=config('cover');const req=historicalRequest('primary',c,'test-secret');assert.match(req.url,/symbol=GPRO/);assert.match(req.url,/apikey=test-secret/);
 assert.equal(historicalRequest('secondary',c).url.includes('test-secret'),false);
 const b=observeHistorical(c,key=>raw(key==='primary'?'twelve-cover':'yahoo-hourly'));assert.equal(JSON.stringify(b).includes('apikey'),false);
 assert.throws(()=>historicalRequest('primary',c,''),/HISTORY_SECRET/);
});
