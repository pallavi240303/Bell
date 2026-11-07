import {keccak256,toHex} from 'viem';
import {bundleSchema,configSchema,type ObservationBundle} from './schema.ts';
// Historical event identities are fixed. Runtime timestamps belong only to the
// explicitly simulated session; these originals are never claimed to be fresh.
const points={
 origination:{symbol:'GPRO',local:'2026-09-04 10:30:00',utc:'2026-09-04T14:30:00Z',interval:'1min',end:'2026-09-04 10:31:00'},
 cover:{symbol:'GPRO',local:'2026-09-04 14:30:00',utc:'2026-09-04T18:30:00Z',interval:'1min',end:'2026-09-04 14:31:00'},
 reopen:{symbol:'GPRO',local:'2026-09-08',utc:'2026-09-08T13:30:00Z',interval:'1day',end:'2026-09-09'},
} as const;
export function historicalPoint(stage:string){if(!Object.hasOwn(points,stage))throw Error('HISTORY_STAGE');return points[stage as keyof typeof points];}
function config(input:unknown){const c=configSchema.parse(input);if(c.mode!=='replay')throw Error('HISTORY_REPLAY_ONLY');if(c.dataSource!=='gpro-history'||!c.historical)throw Error('HISTORY_CONFIG');
 if(c.providers.primary.id!=='twelvedata'||c.providers.primary.url!=='https://api.twelvedata.com/time_series'||c.providers.secondary.id!=='yahoo'||c.providers.secondary.url!=='https://query2.finance.yahoo.com/v8/finance/chart/GPRO')throw Error('HISTORY_PROVIDER');return c;}
export function historicalRequest(provider:'primary'|'secondary',input:unknown,secret?:string){
 const c=config(input),p=historicalPoint(c.historical!.stage);
 if(provider==='primary'){
  if(!secret||/[\r\n]/.test(secret))throw Error('HISTORY_SECRET');
  return {url:`${c.providers.primary.url}?symbol=GPRO&interval=${p.interval}&start_date=${encodeURIComponent(p.local)}&end_date=${encodeURIComponent(p.end)}&timezone=America%2FNew_York&adjust=none&order=ASC&outputsize=10&apikey=${encodeURIComponent(secret)}`,method:'GET',timeout:'5s'};
 }
 const daily=c.historical!.stage==='reopen',start=daily?1788825600:1788480000,end=daily?1788912000:1788566400;
 return {url:`${c.providers.secondary.url}?period1=${start}&period2=${end}&interval=${daily?'1d':'60m'}&events=div%2Csplits`,method:'GET',headers:{'User-Agent':'Mozilla/5.0'},timeout:'5s'};
}
function price(value:unknown):string{
 // Yahoo JSON encodes prices as IEEE floats. Quantize only their decimal price
 // representation to the protocol's 6 decimals; this is no settlement math.
 const n=typeof value==='number'?value:typeof value==='string'&&/^\d+(\.\d+)?$/.test(value)?Number(value):NaN;
 if(!Number.isFinite(n)||n<=0||n>1000000)throw Error('HISTORY_PRICE');
 return BigInt(Math.round(n*1e6)).toString();
}
export function observeHistorical(input:unknown,get:(key:'primary'|'secondary')=>string):ObservationBundle{
 const c=config(input),point=historicalPoint(c.historical!.stage),bundle=bundleSchema.parse(c.replay);
 if(bundle.kind!==(c.historical!.stage==='reopen'?3:6)||bundle.assetId!==c.assetId)throw Error('HISTORY_BINDING');
 if(!bundle.primary||!bundle.secondary)throw Error('HISTORY_TEMPLATE');
 const primaryRaw=get('primary'),secondaryRaw=get('secondary');
 if(primaryRaw.length>32768||secondaryRaw.length>32768)throw Error('HISTORY_SIZE');
 const td=JSON.parse(primaryRaw),chart=JSON.parse(secondaryRaw).chart;
 if(td.status!=='ok'||td.meta?.symbol!=='GPRO'||td.meta?.currency!=='USD'||td.meta?.exchange_timezone!=='America/New_York'||td.meta?.interval!==point.interval)throw Error('HISTORY_IDENTITY');
 const bars=td.values?.filter((x:any)=>x.datetime===point.local);if(!Array.isArray(bars)||bars.length!==1)throw Error('HISTORY_BAR');
 const y=chart?.result?.[0];if(chart?.error||chart?.result?.length!==1||y?.meta?.symbol!=='GPRO'||y.meta.currency!=='USD'||y.meta.exchangeTimezoneName!=='America/New_York')throw Error('HISTORY_IDENTITY');
 if(Object.values(y.events??{}).some((v:any)=>Object.keys(v).length))throw Error('HISTORY_CORPORATE');
 const at=Math.floor(Date.parse(point.utc)/1000),matches=y.timestamp?.map((t:number,i:number)=>t===at?i:-1).filter((i:number)=>i>=0);
 if(!Array.isArray(matches)||matches.length!==1)throw Error('HISTORY_BAR');
 const p=price(bars[0].open),s=price(y.indicators?.quote?.[0]?.open?.[matches[0]]);
 // Source agreement is independently enforced by the unchanged CRE decision.
 return {...bundle,primary:{...bundle.primary,...c.providers.primary,providerId:c.providers.primary.id,price:p,responseHash:keccak256(toHex(primaryRaw))},secondary:{...bundle.secondary,...c.providers.secondary,providerId:c.providers.secondary.id,price:s,responseHash:keccak256(toHex(secondaryRaw))}};
}
