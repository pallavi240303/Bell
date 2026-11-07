import {useEffect,useState,type ReactNode,type ButtonHTMLAttributes} from 'react';
import {Button as ShadcnButton} from './button';
import {Input} from './input';
import {TickNumber} from './TickNumber';
import {Dialog,DialogContent,DialogTitle,DialogClose} from './dialog';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from './select';
import {Tooltip,TooltipTrigger,TooltipContent} from './tooltip';
import {Alert,AlertTitle,AlertDescription} from './alert';
import {RadioGroup,RadioGroupItem} from './radio-group';
import {Toaster,toast} from 'sonner';
import {Info, X, ArrowUpRight, LoaderCircle, Wallet as WalletIcon, Copy} from 'lucide-react';
import {useBell} from '@/state/useBell';
import {displayAmount,shortAddress} from '@/state/presentation';
import {amount} from '@/state/truth';

export function Button({children,variant='primary',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'ghost'}){return <ShadcnButton type="button" variant={variant==='primary'?'default':variant==='secondary'?'outline':'ghost'} {...props} className={`bell-button ${variant} ${props.className??''}`}>{children}</ShadcnButton>;}
export function InfoTip({children,label='More information'}:{children:ReactNode;label?:string}){return <Tooltip><TooltipTrigger asChild><button type="button" className="info-button" aria-label={label}><Info size={14}/></button></TooltipTrigger><TooltipContent className="info-tip" sideOffset={7} collisionPadding={16}>{children}</TooltipContent></Tooltip>;}
export function Metric({label,value,unit,help}:{label:string;value:unknown;unit?:string;help?:string}){return <div className="metric"><span className="metric-label">{label}{help&&<InfoTip label={`About ${label.toLowerCase()}`}>{help}</InfoTip>}</span><span className="metric-value" title={value===undefined?undefined:String(value)}><TickNumber value={displayAmount(value)}/>{unit&&<small>{unit}</small>}</span></div>;}
export function Field({label,unit,value,onChange,help,type='text'}:{label:string;unit?:string;value:string;onChange:(e:any)=>void;help?:string;type?:string}){return <label className="amount-field"><span>{label}{help&&<InfoTip label={`About ${label.toLowerCase()}`}>{help}</InfoTip>}</span><div><Input aria-label={label} type={type} step={type==='datetime-local'?'1':undefined} inputMode={type==='text'?'decimal':undefined} placeholder={type==='text'?'0.00':undefined} value={value} onChange={onChange}/>{unit&&<strong>{unit}</strong>}</div></label>;}
export function SelectField({label,ariaLabel=label,value,onChange,options,placeholder='Choose an option',help,compact=false,disabled=false}:{label:string;ariaLabel?:string;value:string;onChange:(value:string)=>void;options:{value:string;label:string}[];placeholder?:string;help?:string;compact?:boolean;disabled?:boolean}){
 const empty='__bell_empty__',selected=options.some(option=>option.value===value)?value||empty:'';
 return <div className={`select-field ${compact?'compact':''}`}><span>{label}{help&&<InfoTip label={`About ${label.toLowerCase()}`}>{help}</InfoTip>}</span>
  <Select value={selected} onValueChange={next=>onChange(next===empty?'':next)} disabled={disabled}>
   <SelectTrigger className="select-trigger" aria-label={ariaLabel}><SelectValue placeholder={placeholder}/></SelectTrigger>
   <SelectContent className="select-content" position="popper" sideOffset={6} collisionPadding={12}>
    {options.map(option=><SelectItem className="select-option" key={option.value||empty} value={option.value||empty} title={option.label}>{option.label}</SelectItem>)}
   </SelectContent>
  </Select>
 </div>;
}
export function Modal({open,onClose,title,children,wide=false}:{open:boolean;onClose:()=>void;title:string;children:ReactNode;wide?:boolean}){return <Dialog open={open} onOpenChange={value=>{if(!value)onClose();}}><DialogContent className={`bell-dialog ${wide?'wide':''}`} aria-describedby={undefined} showCloseButton={false}><div className="dialog-heading"><DialogTitle>{title}</DialogTitle><DialogClose asChild><button className="icon-button" aria-label="Close dialog"><X size={20}/></button></DialogClose></div>{children}</DialogContent></Dialog>;}
export function ExplorerLink({hash,children='View transaction'}:{hash:string;children?:ReactNode}){const v=useBell();return v.controller.manifest?.chainId==='5042002'?<a className="explorer-link" href={`https://explorer.testnet.arc.io/tx/${hash}`} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={14}/></a>:<span className="mono" title={hash}>{shortAddress(hash)}</span>;}
export function TransactionToast(){
 const v=useBell();
 useEffect(()=>{if((v.workflow.walletPanelOpen&&!v.wallet.connected&&!v.pending&&!v.actionHash)||!v.actionStatus||v.actionStatus==='Newer refresh superseded this snapshot'){toast.dismiss('bell-status');return;}const message=v.actionStatus==='CONFIRMED · canonical snapshot refreshed'?'Transaction confirmed':v.actionStatus;const options={id:'bell-status',duration:v.pending||v.noticeTone==='error'?Infinity:7000,description:v.actionHash?<ExplorerLink hash={v.actionHash}/>:undefined};
 if(v.pending)toast.loading(message,options);else if(v.noticeTone==='error')toast.error(message,options);else if(v.noticeTone==='success')toast.success(message,options);else toast.info(message,options);
 },[v.actionStatus,v.actionHash,v.pending,v.noticeTone,v.workflow.walletPanelOpen,v.wallet.connected]);
 return <Toaster className="bell-toaster" theme="light" position="top-right" offset={{top:84,right:24}} mobileOffset={{top:82,right:16,left:16}} closeButton toastOptions={{className:'bell-toast',style:{fontFamily:'inherit',fontSize:12}}}/>;
}
export function WalletDialog(){
 const v=useBell(),c=v.controller;const [connecting,setConnecting]=useState(false);const close=()=>{if(!v.wallet.connected&&!v.pending)c.dismissNotice();v.workflow.onWalletPanel(false);};
 const provider=v.wallet.providerOptions.find((p:any)=>p.id===v.wallet.providerId);
 const connect=async()=>{setConnecting(true);try{await c.run(()=>c.connect());}finally{setConnecting(false);}};
 const issue=c.connectionIssue;
 return <Modal open={v.workflow.walletPanelOpen} onClose={close} title={v.wallet.connected?'Your wallet':'Connect your wallet'}>
 {v.wallet.connected&&v.loading&&<p className="helper" role="status">Wallet verified. Loading balances and contract state…</p>}
 {v.wallet.connected?<><div className="wallet-identity"><WalletIcon size={26}/><div><strong>{shortAddress(v.account)}</strong><span>{provider?.label?.split(' · ')[0]??'Browser wallet'} · {v.wallet.chainId==='5042002'?'Arc Testnet':'Local Anvil'}</span></div><button className="icon-button" aria-label="Copy wallet address" onClick={()=>void c.run(async()=>{await navigator.clipboard.writeText(v.account);c.noticeTone='success';c.status='Address copied';c.emit();})}><Copy size={17}/></button></div><div className="metrics two"><Metric label="Available USDC" value={amount(v.frame?.state.balances?.[v.account]?.cash,6)}/><Metric label="Stock holdings" value={amount(v.frame?.state.balances?.[v.account]?.stock,18)} unit={v.stockSymbol}/></div><p className="helper">On Arc, USDC also pays network fees.</p><div className="dialog-actions"><Button variant="secondary" onClick={()=>{c.disconnect();close();}}>Disconnect</Button>{v.wallet.chainId==='5042002'&&<a className="bell-button secondary" target="_blank" rel="noreferrer" href={`https://explorer.testnet.arc.io/address/${v.account}`}>View account <ArrowUpRight size={15}/></a>}</div></>:<>
 <p className="helper">Choose your wallet. You approve each transaction there.</p>
 <RadioGroup className="provider-list" aria-label="Wallet extension" value={v.wallet.providerId??''} onValueChange={id=>c.chooseProvider(id)} disabled={connecting||v.pending}>{v.wallet.providerOptions.map((p:any,i:number)=><label key={p.id} className={`provider-choice ${v.wallet.providerId===p.id?'selected':''}`} htmlFor={`wallet-provider-${i}`}><WalletIcon size={20}/><span>{p.label.split(' · ')[0]}</span><RadioGroupItem id={`wallet-provider-${i}`} value={p.id}/></label>)}</RadioGroup>
 {v.wallet.expectedAddress&&<p className="helper wallet-account-hint">Expected <span className="mono" title={v.wallet.expectedAddress}>{shortAddress(v.wallet.expectedAddress)}</span>. Select this account in your wallet to manage its position.</p>}
 {!v.wallet.providerOptions.length&&<div className="inline-notice"><Info size={17}/><span>Open BELL in a browser with MetaMask or Rabby installed and unlocked.</span></div>}
 {issue?<Alert className="wallet-alert"><Info/><AlertTitle>Connect the position owner</AlertTitle><AlertDescription>Selected {shortAddress(issue.actualAddress)}. Switch to {shortAddress(issue.expectedAddress)} in your wallet and reconnect.</AlertDescription></Alert>:v.actionStatus&&v.noticeTone==='error'&&<Alert className="wallet-alert"><Info/><AlertTitle>Connection needs attention</AlertTitle><AlertDescription>{v.actionStatus}</AlertDescription></Alert>}
 {/chain mismatch/i.test(v.actionStatus)&&<Button className="full" variant="secondary" onClick={()=>void c.run(()=>c.switchNetwork())}>Switch to {c.manifest?.chainId==='5042002'?'Arc Testnet':'the required network'}</Button>}
 <Button className="full" disabled={connecting||v.pending||!v.wallet.providerOptions.length} onClick={()=>void connect()}>{connecting?<><LoaderCircle size={16} className="spin"/> Connecting…</>:issue?'Reconnect wallet':'Connect wallet'}</Button>
 <p className="fine-print">{c.manifest?.chainId==='5042002'?'Arc Testnet':c.manifest?.chainId==='31337'?'Local Anvil':'Network loading'} · Your keys stay in your wallet.</p>
 </>}
 </Modal>;
}
