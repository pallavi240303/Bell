import {test,expect} from '@playwright/test';
import {keccak256,toHex} from 'viem';
import {fixture,normal,open,rejected} from './support';
import {policyHash} from '../../engine/quote';
import {json} from '../../services/keeper/types';
import {amount} from '../../src/state/truth';
test.setTimeout(300000);
test('later session covers the same remaining loan while historical receipt and distinct loan stay isolated',async({page})=>{
 const h=await fixture(page,'identity');try{
  await normal(h);const originalLoan=h.loanId,oldReceipt=h.receiptId,original=(await h.observe()).state.loans[originalLoan.toString()];
  const next=keccak256(toHex('SESSION-NEXT'));await h.report('schedule',{sessionId:next,observedAt:'101000',scheduledOpen:'101100',scheduledClose:'105000',validUntil:'120000'});await h.report('window-price',{scheduledOpen:'101100',scheduledClose:'105000',observedAt:'104500',validUntil:'106000'});
  await h.approve('borrower','collateral','2000000000000000000');const p=await h.wallet('borrower');
  for(const principal of ['1000000','2000000']){await p.getByText('WALLET & EXACT INPUTS').click();await p.getByLabel('Loan action').selectOption('borrow');await p.getByLabel('Loan arguments').fill('');const args=JSON.parse(await p.getByLabel('Loan arguments').inputValue());args[0].principal=principal;args[0].collateralShares='1000000000000000000';await p.getByLabel('Loan arguments').fill(json(args));await h.confirmed(p,'second distinct ordinary loan',()=>p.getByRole('button',{name:'SIGN LOAN ACTION',exact:true}).click());await p.getByText('WALLET & EXACT INPUTS').click();}
  const distinct=h.loanId;expect(distinct).not.toBe(originalLoan);expect(distinct).not.toBe(oldReceipt);expect(distinct).not.toBe(2n);
  h.loanId=originalLoan;await p.getByLabel('Loan',{exact:true}).selectOption(originalLoan.toString());const before=await h.observe(),cp=before.state.coverPolicy,t=before.state.loans[originalLoan.toString()].debtRecord.terms;
  const policy=policyHash(BigInt(h.d.chainId),h.d.addresses.manager,h.asset,next,h.configHash,t.snapshotMultiplierNumerator,t.snapshotMultiplierDenominator,cp.profile,cp.coverOpensBeforeClose,cp.coverCutoffBeforeClose);
  const remaining=before.state.loans[originalLoan.toString()].remainingShares;
  for(const [i,role] of ['buyerA','buyerB'].entries()){
   await h.system(h.actors.relay!,'eligibility','setEligible',[h.asset,h.actors[role],policy,true]);await h.approve(role,'offer');const buyer=await h.wallet(role);await buyer.getByText('WALLET & EXACT INPUTS').click();await buyer.getByLabel('Offer terms').fill('');const terms=JSON.parse(await buyer.getByLabel('Offer terms').inputValue());terms.expiry='110000';terms.nonce=String(20+i);terms.maxReferenceDeviationBps='10000';await buyer.getByLabel('Offer terms').fill(json(terms));const inputs=buyer.getByRole('region',{name:'New offer'}).locator('input');await inputs.nth(0).fill(amount(i===0?remaining/2n:remaining-remaining/2n,18));await inputs.nth(1).fill(i===0?'100':'90');await inputs.nth(2).fill('0.0001');await h.confirmed(buyer,'fresh next-session lot',()=>buyer.getByRole('button',{name:'LOCK USDC · POST OFFER',exact:true}).click());await buyer.getByText('WALLET & EXACT INPUTS').click();
  }
  await p.evaluate(async()=>{const {bell}=await import('/src/state/controller.ts' as string);await bell.refresh();});await p.getByRole('button',{name:'FREE',exact:true}).first().click();await p.getByRole('button',{name:'FREE',exact:true}).last().click();await h.approve('borrower','premium','200');await h.confirmed(p,'same original loan second cover',()=>p.getByRole('button',{name:'SIGN COVER PURCHASE',exact:true}).click());
  const f=await h.checkpoint('durable identity isolation');expect(h.receiptId).not.toBe(oldReceipt);expect(f.state.receipts[h.receiptId.toString()].receipt.loanId).toBe(originalLoan);expect(f.state.loans[originalLoan.toString()].debtRecord).toEqual(original.debtRecord);expect(f.state.loans[distinct.toString()].loan.activeCoverId).toBe(0n);expect(f.state.pool.activeLoanIds).toContain(distinct);expect(Object.values(f.state.claims).every((c:any)=>c.receiptId===originalLoan)).toBe(true);await rejected(h,h.actors.keeper!,'manager','terminalSettle',[oldReceipt],'ReceiptNotActive');
  await p.getByText('WALLET & EXACT INPUTS').click();await p.getByLabel('Cover receipt').selectOption(oldReceipt.toString());await expect(p.getByLabel('Loan',{exact:true})).toHaveValue(originalLoan.toString());await expect(p.getByLabel('Cover receipt')).toHaveValue(oldReceipt.toString());
 }finally{await h.stop();}
});
