import {test,expect} from '@playwright/test';
import {encodeAbiParameters,keccak256,toHex} from 'viem';
import {fixture,ordinary} from './support';
import {argsFor,fn} from '../../services/keeper/abi';
import {json} from '../../services/keeper/types';
import {policyHash} from '../../engine/quote';
test.setTimeout(180000);
test('pre-split ordinary loan receives original-basis buyer prefill and valid cover after authenticated split',async({page})=>{
 const h=await fixture(page,'split');try{
  await ordinary(h);const loan=h.loanId,original=(await h.observe()).state.loans[loan.toString()].debtRecord,zero=`0x${'0'.repeat(64)}`;await h.node.time(20001n);const state=await h.read('oracle','assetState',[h.asset]);
  const report={schemaVersion:'1',kind:'4',assetId:h.asset,sessionId:zero,chainId:h.d.chainId,oracle:h.d.addresses.oracle,configHash:h.configHash,nonce:state.nextNonce.toString(),previousStateHash:state.stateHash,observedAt:'20001',validUntil:'21801',scheduledOpen:'0',scheduledClose:'0',benchmarkPrice:'0',corporateAction:'1',actionId:keccak256(toHex('two-for-one-split')),multiplierNumerator:'2',multiplierDenominator:'1',halted:false,primarySourceHash:keccak256(toHex('issuer-split')),secondarySourceHash:zero};
  const payload=encodeAbiParameters(fn('SessionOracle','acceptReport').inputs,argsFor('SessionOracle','acceptReport',[report]));await h.system(h.actors.relay!,'receiver','onReport',['0x',payload]);await h.report('window-price',{benchmarkPrice:'50000000',multiplierNumerator:'2',multiplierDenominator:'1'});await h.node.time(BigInt(h.input.coverAt));
  const frame=await h.observe(),cp=frame.state.coverPolicy,policy=policyHash(BigInt(h.d.chainId),h.d.addresses.manager,h.asset,h.session,h.configHash,1n,1n,cp.profile,cp.coverOpensBeforeClose,cp.coverCutoffBeforeClose);
  for(const [i,role]of ['buyerA','buyerB'].entries()){
   await h.approve(role,'offer');const p=await h.wallet(role);await p.getByLabel('Offer share basis').selectOption(loan.toString());await p.getByText('WALLET & EXACT INPUTS').click();const terms=JSON.parse(await p.getByLabel('Offer terms').inputValue());expect(terms.policyHash).toBe(policy);expect(terms.referencePrice).toBe('100000000');terms.expiry='110000';terms.nonce=String(20+i);await p.getByLabel('Offer terms').fill(json(terms));const inputs=p.getByRole('region',{name:'New offer'}).locator('input');await inputs.nth(0).fill('5');await inputs.nth(1).fill(i===0?'100':'90');await inputs.nth(2).fill('0.0001');await h.confirmed(p,'buyer original-basis offer after split',()=>p.getByRole('button',{name:'LOCK USDC · POST OFFER',exact:true}).click());await p.getByText('WALLET & EXACT INPUTS').click();
  }
  const p=await h.wallet('borrower');await p.evaluate(async()=>{const {bell}=await import('/src/state/controller.ts' as string);await bell.refresh();});await p.getByRole('button',{name:'FREE',exact:true}).first().click();await p.getByRole('button',{name:'FREE',exact:true}).last().click();await p.getByText('WALLET & EXACT INPUTS').click();const q=JSON.parse(await p.getByLabel('Cover consent').inputValue());expect(q.referencePrice).toBe('100000000');expect(q.snapshotMultiplierNumerator).toBe('1');expect(q.snapshotMultiplierDenominator).toBe('1');expect(q.policyHash).toBe(policy);await p.getByText('WALLET & EXACT INPUTS').click();await h.approve('borrower','premium','200');await h.confirmed(p,'existing pre-split loan covered after split',()=>p.getByRole('button',{name:'SIGN COVER PURCHASE',exact:true}).click());const after=await h.checkpoint('split original basis exact');expect(after.state.loans[loan.toString()].debtRecord).toEqual(original);expect(after.state.loans[loan.toString()].loan.activeCoverId).toBe(h.receiptId);
 }finally{await h.stop();}
});
