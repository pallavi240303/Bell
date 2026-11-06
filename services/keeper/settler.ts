import type {Header} from './types.ts';
const zero=`0x${'0'.repeat(64)}`;
export function classify(receipt:any,benchmark:any,now:bigint):'settle'|'terminalSettle'|null {
  if(receipt.status!==1n)return null;
  if(now>=receipt.settlementDeadline)return 'terminalSettle';
  if(receipt.benchmarkReportHash!==zero||!benchmark.finalized||!benchmark.reportHash||benchmark.reportHash===zero)return null;
  for(const field of ['assetId','sessionId','configHash'])if(benchmark[field]!==receipt.consent[field])return null;
  return 'settle';
}
type Observation={receipt:any;benchmark:any;block:Header};
/** Every race, successful inclusion, or replacement causes a new contract read. No retries using stale plans. */
export async function monitor(read:()=>Promise<Observation>,submit:(method:'settle'|'terminalSettle',source:Header)=>Promise<unknown>){
  const current=await read(),method=classify(current.receipt,current.benchmark,current.block.timestamp);
  if(!method)return {status:'idle',next:null};
  let status='submitted';try{await submit(method,current.block);}catch{status='refresh';}
  const latest=await read();return {status,next:classify(latest.receipt,latest.benchmark,latest.block.timestamp),source:latest.block};
}
