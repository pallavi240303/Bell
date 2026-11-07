import {useState} from 'react';
import {formatUnits,keccak256,toHex} from 'viem';
import {LenderDemo,Workspace} from '@/components/ui/Workspace';
import {SelectField,Button} from '@/components/ui/Controls';
import {tabChoice,rememberTab} from '@/state/workflow';
import {useBell} from '@/state/useBell';
const asset=keccak256(toHex('GPRO-HISTORICAL-REPLAY'));
export function ReplayPage(){
 const [role,setRole]=useState<string>(()=>tabChoice('replay.role',['lender','borrower','buyer'],'lender')),[scenario,setScenario]=useState<string>(()=>tabChoice('replay.scenario',['healthy','unhealthy'],'healthy')),v=useBell();
 const available=!!v.frame?.state.assets?.[asset];
 const stock=v.controller.manifest?.addresses.stock?.toLowerCase();
 const held=stock&&v.account?v.frame?.state.stockTokens?.[stock]?.balances?.[v.account]?.balance:undefined;
 const replayAsset=v.frame?.state.assets?.[asset];
 const session=v.frame?.state.sessions?.[replayAsset?.state.activeSessionId]?.fact;
 const open=session?.phase===1n&&v.frame.block.timestamp<session.scheduledClose;
 const navigation=<div className="guidance"><div>
  <div className="field-pair"><SelectField label="Your role" value={role} onChange={value=>{rememberTab('replay.role',value);setRole(value);}} options={[{value:'lender',label:'Lender — supply / withdraw'},{value:'borrower',label:'Borrower — loan / cover'},{value:'buyer',label:'Buyer — offer / collect'}]}/><SelectField label="GoPro replay inputs" value={scenario} onChange={value=>{rememberTab('replay.scenario',value);setScenario(value);}} options={[{value:'healthy',label:'Lower debt · 10 USDC'},{value:'unhealthy',label:'Higher debt · 11.80 USDC'}]}/></div>
  <p>Historical GPRO · 10 whole mock shares. Same price path: $1.9699 at origination → $1.775 inside the cover window → $1.565 at reopening. Contracts determine the outcome.</p>
  <p className="fine-print">{available?'Historical replay asset is registered. The token remains mSTOCK; prices and the compressed clock are explicitly simulated historical observations.':v.frame?'The operator must register GoPro on the connected network before using these inputs.':'The replay asset is checked when market state loads.'} CRE runs on the operator’s laptop. On Arc Testnet, your wallet transactions are public testnet transactions. Connect the address performing the selected role; no named accounts are required.</p>
  {role==='borrower'&&<p className="fine-print">{typeof held==='bigint'?`Your wallet holds ${formatUnits(held,18)} mSTOCK. `:''}Filling the inputs does not mint shares. For this replay the operator issues mock stock to your borrower address; you approve the vault to use 10 shares.</p>}
  {role==='borrower'&&<Button variant="secondary" disabled={!available||v.pending} onClick={()=>{v.controller.set('selectedAssetId',asset);v.controller.set('collateralAmount','10');v.controller.set('borrowAmount',scenario==='healthy'?'10':'11.8');}}>Fill proposed loan inputs</Button>}
  {role==='buyer'&&open&&<Button variant="secondary" disabled={v.pending} onClick={()=>{if(v.workflow.assetId!==asset)v.controller.set('selectedAssetId',asset);v.controller.set('offerExpiry',(session.scheduledClose+900n).toString());}}>Use replay offer expiry (UTC)</Button>}
  {role==='buyer'&&<p className="fine-print">Choose your own strike, premium and maximum borrower LTV. A limit of 75% admits the proposed higher-debt loan at the verified cover reference. Existing offers remain unchanged.</p>}
 </div></div>;
 return role==='lender'?<LenderDemo navigation={navigation}/>:<Workspace key={role} initial={role==='buyer'?'offer':'borrow'} demo navigation={navigation}/>;
}
