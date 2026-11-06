import {useState} from 'react';
import {useBell} from '@/state/useBell';
import {abis} from '@/generated/abis';
import {json} from '@/adapter/transport';
import {amount} from '@/state/truth';
import {hashBundle} from '@/adapter/actions';
const button="[font-family:inherit] text-[11px] tracking-[0.14em] py-2.25 px-3 border border-line rounded-[10px] cursor-pointer hover:border-ink bg-transparent text-ink";
const input="w-full [font-family:inherit] text-[12px] text-ink bg-transparent border border-line rounded-[10px] p-3";
/** Exact actor inputs stay inside the established panel geometry. */
export function ActorTools({role}:{role:'borrower'|'buyer'|'lender'}){
  const v=useBell(),c=v.controller;
  const [purpose,setPurpose]=useState(role==='lender'?'deposit':role==='buyer'?'offer':'premium');
  const [approval,setApproval]=useState(''),[method,setMethod]=useState('repay'),[args,setArgs]=useState('');
  const fn=abis[role==='buyer'?'book':'manager'].find(x=>x.type==='function'&&x.name===(role==='buyer'?'postOffer':'borrowWithCover')) as any;
  const fields=fn.inputs[0].components.map((x:any)=>`${x.name}: ${x.type}`).join('\n');
  let review='Complete consent and select whole lots to review the exact transaction hash.';
  if(role==='borrower'&&v.quoteText&&v.selected.length&&c.manifest)try{review=hashBundle(c.manifest.chainId,c.manifest.addresses.manager,JSON.parse(v.quoteText),v.selected,v.selected.map((id:string)=>v.frame?.state.termsHashes[id]));}catch{review='Consent is incomplete or malformed. No transaction is ready.';}
  return <details className="text-[10px] tracking-[0.16em] text-muted">
    <summary className="cursor-pointer tracking-[0.12em]">WALLET & EXACT INPUTS</summary>
    <div className="flex flex-col gap-3 pt-3">
      <span>{v.labels.network} · {v.labels.source} · {v.labels.clock}</span>
      <span>{v.labels.preparation} · {v.labels.authority}</span>
      <span>{v.labels.receiver}</span>
      <span>{c.manifest?.chainId==='31337'?'LOCAL MOCK STOCK · TEST CASH':'STOCK CLASSIFICATION UNVERIFIED'}{c.manifest?.chainId==='5042002'&&c.manifest.addresses.cash?.toLowerCase()==='0x3600000000000000000000000000000000000000'?' · ARC TESTNET USDC':''}</span>
      <span>NATIVE GAS (18 DECIMALS) · {amount(v.frame?.state.balances?.[v.account]?.nativeGas,18)}</span>
      <button className={button} onClick={()=>void c.run(()=>c.connect())}>{v.account?'RECONNECT WALLET':'CONNECT WALLET'}</button>
      <span data-provenance="address">{v.account??'No wallet connected'}</span>
      <label>APPROVAL PURPOSE<select className={input} aria-label="Approval purpose" value={purpose} onChange={e=>setPurpose(e.target.value)}>{(role==='lender'?['deposit']:role==='buyer'?['offer']:['premium','repay','collateral','backing']).map(p=><option key={p}>{p}</option>)}</select></label>
      <label>EXACT TOKEN UNITS<input className={input} aria-label="Approval amount raw" inputMode="numeric" value={approval} onChange={e=>setApproval(e.target.value)}/></label>
      <button className={button} disabled={!v.ready} onClick={()=>void c.run(()=>c.send({approval:purpose,amount:approval}))}>APPROVE EXACT AMOUNT</button>
      {role==='buyer'&&<>
        <label>COMPLETE OFFER TERMS · RAW INTEGER STRINGS<textarea className={input} aria-label="Offer terms" rows={8} value={v.termsText} onChange={e=>c.set('termsText',e.target.value)}/></label>
        <pre className="whitespace-pre-wrap wrap-anywhere">{fields}</pre>
        <span>The three amount fields above set shares, strike and total premium. Cancel + repost requires a fresh nonce. Reserved lots cannot change.</span>
        <button className={button} disabled={!v.ready} onClick={()=>void c.run(()=>c.send({contract:'book',method:'withdrawPremium',args:[v.frame.state.balances[v.account].premiumCredit.toString(),v.account]}))}>WITHDRAW PREMIUM</button>
        <button className={button} disabled={!v.ready} onClick={()=>void c.run(()=>c.send({contract:'book',method:'withdrawCashCredit',args:[v.frame.state.balances[v.account].cashCredit.toString(),v.account]}))}>WITHDRAW CASH CREDIT</button>
      </>}
      {role==='borrower'&&<>
        <label>EXACT BORROW CONSENT · RAW INTEGER STRINGS<textarea className={input} aria-label="Borrow consent" rows={8} value={v.quoteText} onChange={e=>c.set('quoteText',e.target.value)}/></label>
        <pre className="whitespace-pre-wrap wrap-anywhere">{fields}</pre>
        <span>Select one to eight FREE whole lots in required order. The contract validates totals, limits, deadline, nonce and the complete atomic bundle. Supplied consent is not a confirmed loan.</span>
        <pre className="whitespace-pre-wrap wrap-anywhere">{json({selected:v.selected,termsHashes:v.selected.map((id:string)=>v.frame?.state.termsHashes[id])})}</pre>
        <output className="wrap-anywhere" aria-label="Exact borrow quote hash">{review}</output>
        <label>RECEIPT ACTION<select className={input} aria-label="Receipt action" value={method} onChange={e=>setMethod(e.target.value)}>{['repay','addCollateral','withdrawCollateral','topUpBacking','finalizeHandoff'].map(m=><option key={m}>{m}</option>)}</select></label>
        <label>EXACT ARGUMENT ARRAY<textarea className={input} aria-label="Receipt arguments" rows={3} value={args} onChange={e=>setArgs(e.target.value)}/></label>
        <span>{(abis.manager.find(x=>x.type==='function'&&x.name===method) as any)?.inputs.map((p:any)=>`${p.name}: ${p.type}`).join(' · ')}</span>
        <button className={button} disabled={!v.ready} onClick={()=>void c.run(()=>c.send({contract:'manager',method,args:JSON.parse(args)}))}>SIGN RECEIPT ACTION</button>
      </>}
    </div>
  </details>;
}
