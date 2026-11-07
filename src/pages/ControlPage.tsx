import {RefreshCw} from 'lucide-react';
import {useBell} from '@/state/useBell';
import {Button,InfoTip,Metric,ExplorerLink,SelectField} from '@/components/ui/Controls';
import {Card} from '@/components/ui/card';
import {shortAddress} from '@/state/presentation';

/** Read-only evidence; privileged market operations stay with the operator. */
export function ControlPage(){
 const v=useBell(),c=v.controller,events=c.events.filter((e:any)=>e.decoded?.eventName==='MarketEventAccepted');
 return <main className="bell-workspace">
  <div className="workspace-heading"><div><span className="eyebrow">Source of truth</span><h1>Activity</h1></div><Button variant="secondary" disabled={v.loading||v.pending} onClick={v.workflow.onRefresh}><RefreshCw size={15}/>Refresh</Button></div>
  {v.workflow.assetOptions.length>1&&<SelectField label="Asset" value={v.workflow.assetId} onChange={value=>v.workflow.onAsset({target:{value}})} options={[{value:'',label:'Choose an asset'},...v.workflow.assetOptions.map((a:any)=>({value:a.id,label:a.label}))]}/>}
  <div className="workspace-grid"><Card className="position-card">
   <div className="card-heading"><h2>Accepted chain state</h2><InfoTip>The browser reads accepted reports. CRE simulation and report delivery run through the operator.</InfoTip></div>
   <div className="metrics three"><Metric label="Reference price" value={v.controlReferenceFmt} unit="USDC" help="Latest accepted reference for the selected asset. A dash means no report is available; it is not a zero price."/><Metric label="Stock token" value={v.stockSymbol} help="Symbol read from the selected asset’s token contract."/><Metric label="Token transfers" value={v.tokenState==='TRANSFERS ENABLED'?'Not paused':v.tokenState==='UNAVAILABLE'?'Unavailable':'Paused'} help="The token contract’s pause flag. An unpaused token can still restrict individual recipients."/></div>
   <div className="summary-row"><span>Network</span><strong>{c.manifest?.chainId==='5042002'?'Arc Testnet':c.manifest?.chainId==='31337'?'Local Anvil':'Unavailable'}</strong></div>
   <div className="summary-row"><span>Verified block</span><strong>{v.frame?.block.number?.toString()??'Unavailable'}</strong></div>
   <div className="summary-row"><span>Cover window (UTC)</span><strong>{v.workflow.coverWindow}</strong></div>
   <p className="fine-print">{v.labels.receiver}</p>
  </Card><Card className="session-card"><div className="card-heading"><h2>Contracts</h2><InfoTip>Addresses from the connected deployment manifest. Each link opens that contract on the explorer.</InfoTip></div>{Object.entries(c.manifest?.addresses??{}).map(([key,address])=><div className="summary-row" key={key}><span>{key}</span>{c.manifest?.chainId==='5042002'?<a title={address as string} href={`https://explorer.testnet.arc.io/address/${address}`} target="_blank" rel="noreferrer">{shortAddress(address as string)}</a>:<strong title={address as string}>{shortAddress(address as string)}</strong>}</div>)}</Card></div>
  <section className="activity-section"><h2>Accepted market reports</h2>{!events.length?<p className="helper">No report evidence is available in this snapshot.</p>:[...events].reverse().map((e:any)=><div className="activity-row" key={`${e.transactionHash}:${e.logIndex}`}><span>Market report accepted</span><span className="muted">Block {e.blockNumber.toString()}</span><ExplorerLink hash={e.transactionHash}/></div>)}</section>
 </main>;
}
