import {useEffect,useState} from 'react';
import {useBell} from '@/state/useBell';
import {abis} from '@/generated/abis';
import {json} from '@/adapter/transport';
import {amount} from '@/state/truth';
import {hashBundle} from '@/adapter/actions';
const button="[font-family:inherit] text-[12px] tracking-[0.14em] py-2.25 px-3 border border-line rounded-[10px] cursor-pointer hover:border-ink bg-transparent text-ink";
const input="w-full [font-family:inherit] text-[12px] text-ink bg-transparent border border-line rounded-[10px] p-3";
/** Exact actor inputs stay inside the established panel geometry. */
export function ActorTools({role}:{role:'borrower'|'buyer'|'lender'}){
  const v=useBell(),c=v.controller;
  const [purpose,setPurpose]=useState(role==='lender'?'deposit':role==='buyer'?'offer':'collateral');
  const [approval,setApproval]=useState('');const method=v.loanMethod,args=v.loanArgs;
  useEffect(()=>{setApproval('');},[v.wallet.session]);
  const fn=(role==='buyer'?abis.book:abis.manager).find(x=>x.type==='function'&&x.name===(role==='buyer'?'postOffer':'buyCover')) as any;
  const fields=(fn?.inputs[role==='buyer'?0:1]?.components??[]).map((x:any)=>`${x.name}: ${x.type}`).join('\n');
  let review='Complete consent and select whole lots to review the exact transaction hash.';
  if(role==='borrower'&&v.quoteText&&v.selected.length&&c.manifest)try{review=hashBundle(c.manifest.chainId,c.manifest.addresses.manager,JSON.parse(v.quoteText),v.selected,v.selected.map((id:string)=>v.frame?.state.termsHashes[id]));}catch{review='Consent is incomplete or malformed. No transaction is ready.';}
  return <details className="text-[12px] tracking-[0.16em] text-muted" open={v.workflow.walletPanelOpen} onToggle={e=>{const open=e.currentTarget.open;if(open!==v.workflow.walletPanelOpen)v.workflow.onWalletPanel(open);}}>
    <summary className="cursor-pointer tracking-[0.12em]">WALLET & EXACT INPUTS</summary>
    <div className="flex flex-col gap-3 pt-3">
      <span>{v.labels.network} · {v.labels.source} · {v.labels.clock}</span>
      <span>{v.labels.preparation} · {v.labels.authority}</span>
      <span>{v.labels.receiver}</span>
      <span>{c.manifest?.chainId==='31337'?'LOCAL MOCK STOCK · TEST CASH':'STOCK CLASSIFICATION UNVERIFIED'}{c.manifest?.chainId==='5042002'&&c.manifest.addresses.cash?.toLowerCase()==='0x3600000000000000000000000000000000000000'?' · ARC TESTNET USDC':''}</span>
      <span>NATIVE GAS (18 DECIMALS) · {amount(v.frame?.state.balances?.[v.account]?.nativeGas,18)}</span>
      <span data-provenance="expected-address">{v.wallet.expectedAddress?`EXPECTED ACCOUNT · ${v.wallet.expectedAddress}`:'ACCOUNT · CONNECT YOUR WALLET'}</span>
      <label>WALLET<select className={input} aria-label="Wallet provider" value={v.wallet.providerId} onChange={e=>c.chooseProvider(e.target.value)}><option value="">SELECT WALLET</option>{v.wallet.providerOptions.map((p:any)=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      {v.wallet.providerOptions.length===0&&<span>NO WALLET DISCOVERED · INSTALL OR UNLOCK METAMASK OR RABBY</span>}
      <button className={button} onClick={()=>void c.run(()=>c.connect())}>{v.account?'RECONNECT WALLET':'CONNECT WALLET'}</button>
      <span data-provenance="address">{v.account??'No wallet connected'}</span>
      <span data-provenance="network">{v.wallet.connected?`WALLET NETWORK · CHAIN ${v.wallet.chainId}`:`EXPECTED NETWORK · CHAIN ${v.wallet.expectedChainId??'—'} · NOT CONNECTED`}</span>
      <button className={button} onClick={v.workflow.onRefresh}>REFRESH CONTRACT STATE</button>
      <label>ASSET<select className={input} aria-label="Asset" value={v.workflow.assetId} onChange={v.workflow.onAsset}><option value="">SELECT ASSET</option>{v.workflow.assetOptions.map((asset:{id:string;label:string})=><option key={asset.id} value={asset.id}>{asset.label}</option>)}</select></label>
      <span aria-label="Market readiness">{v.workflow.marketReady?'MARKET READY':v.workflow.marketReason}</span>
      <span>SESSION CLOSE · {v.workflow.sessionClose}</span>
      <span>COVER WINDOW · {v.workflow.coverWindow}</span>
      <span>REFERENCE OBSERVED · {v.workflow.referenceObserved}</span>
      {role==='borrower'&&(v.coverOptions.length>0||v.showCoverPreview)&&<label>SESSION RECEIPT<select className={input} aria-label="Cover receipt" value={v.receiptId??''} onChange={v.onCover}>{v.quoteText&&v.selected.length>0&&<option value="">UNCONFIRMED PREVIEW</option>}{v.coverOptions.map((r:any)=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label>}
      {role==='buyer'&&<>
        <button className={button} disabled={!v.ready||!v.frame?.state.balances[v.account]?.premiumCredit} onClick={()=>void c.run(()=>c.send({contract:'book',method:'withdrawPremium',args:[v.frame.state.balances[v.account].premiumCredit.toString(),v.account]}))}>WITHDRAW PREMIUM</button>
        <button className={button} disabled={!v.ready||!v.frame?.state.balances[v.account]?.cashCredit} onClick={()=>void c.run(()=>c.send({contract:'book',method:'withdrawCashCredit',args:[v.frame.state.balances[v.account].cashCredit.toString(),v.account]}))}>WITHDRAW CASH CREDIT</button>
      </>}
      <details>
        <summary className="cursor-pointer tracking-[0.12em]">ADVANCED EXACT INPUTS</summary>
        <div className="flex flex-col gap-3 pt-3">
      <label>APPROVAL PURPOSE<select className={input} aria-label="Approval purpose" value={purpose} onChange={e=>setPurpose(e.target.value)}>{(role==='lender'?['deposit']:role==='buyer'?['offer']:['premium','repay','collateral','backing']).map(p=><option key={p}>{p}</option>)}</select></label>
      <label>EXACT TOKEN UNITS<input className={input} aria-label="Approval amount raw" inputMode="numeric" value={approval} onChange={e=>setApproval(e.target.value)}/></label>
      <button className={button} disabled={!v.ready} onClick={()=>void c.run(()=>c.send({approval:purpose,amount:approval}))}>APPROVE EXACT AMOUNT</button>
      {role==='buyer'&&<>
        <label>COMPLETE OFFER TERMS · RAW INTEGER STRINGS<textarea className={input} aria-label="Offer terms" rows={8} value={v.termsText} onChange={e=>c.set('termsText',e.target.value)}/></label>
        <pre className="whitespace-pre-wrap wrap-anywhere">{fields}</pre>
        <span>The three amount fields above set shares, strike and total premium. Cancel + repost requires a fresh nonce. Reserved lots cannot change.</span>
      </>}
      {role==='borrower'&&<>
        <label>COVER CONSENT PREVIEW · RAW INTEGER STRINGS<textarea className={input} aria-label="Cover consent" rows={8} value={v.quoteText} onChange={e=>c.set('quoteText',e.target.value)}/></label>
        <pre className="whitespace-pre-wrap wrap-anywhere">{fields}</pre>
        <span>Select one to eight FREE whole lots in required order. The contract validates totals, limits, deadline, nonce and this cover agreement. Preview metadata is unconfirmed; retain your debt and fee bounds.</span>
        <pre className="whitespace-pre-wrap wrap-anywhere">{json({loanId:v.loanId,receiptId:v.receiptId,coverStatus:v.coverStatus,selected:v.selected,termsHashes:v.selected.map((id:string)=>v.frame?.state.termsHashes[id])})}</pre>
        <output className="wrap-anywhere" aria-label="Exact cover quote hash">{review}</output>
        <label>LOAN ACTION<select className={input} aria-label="Loan action" value={method} onChange={e=>c.set('loanMethod',e.target.value)}>{['borrow','repay','addCollateral','withdrawCollateral','liquidate','topUpBacking','finalizeHandoff','settle','terminalSettle'].map(m=><option key={m}>{m}</option>)}</select></label>
        <label>EXACT ARGUMENT ARRAY · ENTER PRINCIPAL AND COLLATERAL FOR BORROW<textarea className={input} aria-label="Loan arguments" rows={3} value={args} onChange={e=>c.set('loanArgs',e.target.value)}/></label>
        <span>{((method==='settle'||method==='terminalSettle'?abis.manager:abis.loanManager).find(x=>x.type==='function'&&x.name===method) as any)?.inputs.map((p:any)=>`${p.name}: ${p.type}${p.components?' · '+p.components.map((x:any)=>x.name+': '+x.type).join(' · '):''}`).join(' · ')}</span>
        <button className={button} disabled={!v.ready} onClick={()=>void c.run(()=>c.loanAction())}>SIGN LOAN ACTION</button>
      </>}
        </div>
      </details>
    </div>
  </details>;
}
