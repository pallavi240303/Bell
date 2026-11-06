import {test,expect,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {formatUnits} from 'viem';
import {harness} from './harness';

async function open(page:Page,name:string){
 await page.getByRole('button',{name:'Open menu'}).click();
 await page.getByRole('dialog').getByRole('button',{name,exact:true}).click();
 await expect(page.getByText('(LOADING)').locator('..')).toHaveCSS('opacity','0');
}
async function panel(page:Page){
 const details=page.locator('main details').filter({has:page.locator('summary',{hasText:'WALLET & EXACT INPUTS'})}).first();
 if(await details.getAttribute('open')===null)await details.locator('summary').first().click();
}
async function connect(page:Page,screen:string){
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');await open(page,screen);await panel(page);
 await page.getByRole('button',{name:'CONNECT WALLET',exact:true}).click();
 await expect(page.locator('header')).toContainText('LOCAL ANVIL');
 await expect(page.getByText('No wallet connected',{exact:true})).toHaveCount(0);
}

test('header wallet opens actor and provider setup without signing',async({page})=>{
 const h=await harness(false,false);try{
  await h.attach(page);await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await page.getByRole('button',{name:/^WALLET/}).click();
  await expect(page.getByLabel('Actor',{exact:true})).toBeVisible();await expect(page.getByLabel('Wallet provider',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'CONNECT WALLET',exact:true})).toBeVisible();expect(h.sends).toHaveLength(0);
 }finally{await h.stop();}
});

test('expired market facts show an operator readiness reason and block ordinary borrowing',async({page})=>{
 const h=await harness(false,false);try{
  await h.node.time(120001n);await h.attach(page);await connect(page,'BORROW');
  await page.getByLabel('Borrow amount',{exact:true}).fill('1');await page.getByLabel('Collateral shares',{exact:true}).fill('1');
  await expect(page.getByLabel('Market readiness',{exact:true})).toContainText(/operator|expired|closed|fresh/i);await expect(page.getByRole('button',{name:'BORROW USDC',exact:true})).toBeDisabled();expect(h.sends).toHaveLength(0);
 }finally{await h.stop();}
});

test('four owned wallets supply, borrow, post, cover, settle and deliver through human inputs',async({page,context},info)=>{
 const h=await harness(false,false),lender=await context.newPage(),rahul=await context.newPage(),meera=await context.newPage();
 try{
  // Eligibility is explicit operator fixture setup, never a buyer financial action.
  for(const actor of [h.actors.buyerA!,h.actors.buyerB!])await h.send(h.actors.owner!,'eligibility','setEligible',[h.asset,actor,h.policy,true]);
  await h.attach(lender,'lender');await h.attach(page,'borrower');await h.attach(rahul,'buyerA');await h.attach(meera,'buyerB');
  const step=async(p:Page,name:string)=>{
   const count=h.sends.length;await p.getByRole('button',{name,exact:true}).click();
   await expect.poll(()=>h.sends.length).toBe(count+1);
   await expect(p.getByRole('status')).toContainText('CONFIRMED · canonical snapshot refreshed');
   const entry=h.f.transactions.at(-1)!;
   const receipt=await h.node.client.getTransactionReceipt({hash:entry.transactionHash});
   expect(receipt.status).toBe('success');expect((await h.node.client.getBlock({blockNumber:receipt.blockNumber})).hash).toBe(receipt.blockHash);await expect(p.getByRole('status')).toContainText(receipt.transactionHash);
   return receipt;
  };
  await connect(lender,'LEND');
  const supply=lender.getByRole('region',{name:'Supply',exact:true});await supply.getByRole('textbox').first().fill('1');
  const assetsBefore=(await h.observe()).state.pool.totalAssets,cashBefore=await h.read('cash','balanceOf',[h.actors.lender]);
  await step(lender,'APPROVE SUPPLY USDC');expect(await h.read('cash','allowance',[h.actors.lender,h.d.addresses.pool])).toBe(1000000n);
  await step(lender,'SUPPLY USDC');expect((await h.observe()).state.pool.totalAssets).toBe(assetsBefore+1000000n);expect(await h.read('cash','balanceOf',[h.actors.lender])).toBe(cashBefore-1000000n);expect(await h.read('cash','allowance',[h.actors.lender,h.d.addresses.pool])).toBe(0n);

  await connect(page,'BORROW');await page.getByLabel('Borrow amount',{exact:true}).fill('499.999999');await page.getByLabel('Collateral shares',{exact:true}).fill('10');
  await step(page,'APPROVE COLLATERAL');expect(await h.read('stock','allowance',[h.actors.borrower,h.d.addresses.vault])).toBe(10000000000000000000n);
  const borrowerBefore=await h.read('cash','balanceOf',[h.actors.borrower]);await step(page,'BORROW USDC');
  const originated=await h.observe(),loanId=Object.keys(originated.state.loans)[0]!;
  expect(originated.state.loans[loanId]!.loan.activeCoverId).toBe(0n);expect(originated.state.loans[loanId]!.debtRecord.terms.originalPrincipal).toBe(499999999n);expect(originated.state.loans[loanId]!.remainingShares).toBe(10000000000000000000n);expect(await h.read('cash','balanceOf',[h.actors.borrower])).toBe(borrowerBefore+499999999n);
  expect(await h.read('stock','allowance',[h.actors.borrower,h.d.addresses.vault])).toBe(0n);

  for(const [p,actor,strike,premium,escrow]of [[rahul,h.actors.buyerA!,'100','0.0001',500000000n],[meera,h.actors.buyerB!,'90','0.0002',450000000n]] as const){
   await connect(p,'BUYERS');const form=p.getByRole('region',{name:'New offer',exact:true}),inputs=form.locator('input');
   await inputs.nth(0).fill('5');await inputs.nth(1).fill(strike);await inputs.nth(2).fill(premium);await p.getByLabel('Offer expiry (UTC)',{exact:true}).fill('1970-01-02T06:33');
   await step(p,'APPROVE OFFER CASH');expect(await h.read('cash','allowance',[actor,h.d.addresses.book])).toBe(escrow);
   const before=await h.read('cash','balanceOf',[actor]);await step(p,'LOCK USDC · POST OFFER');
   const id=h.ids.at(-1)!,offer=await h.read('book','getOffer',[id]);expect(offer.buyer).toBe(actor);expect(offer.cashCapacity).toBe(escrow);expect(offer.terms.snapshotShares).toBe(5000000000000000000n);expect(await h.read('cash','balanceOf',[actor])).toBe(before-escrow);expect(await h.read('cash','allowance',[actor,h.d.addresses.book])).toBe(0n);
  }
  expect(h.ids).toHaveLength(2);await page.getByRole('button',{name:'REFRESH CONTRACT STATE',exact:true}).click();await expect(page.getByRole('button',{name:'FREE',exact:true})).toHaveCount(2);
  await page.getByRole('button',{name:'FREE',exact:true}).first().click();await page.getByRole('button',{name:'FREE',exact:true}).last().click();
  await step(page,'APPROVE COVER PREMIUM');expect(await h.read('cash','allowance',[h.actors.borrower,h.d.addresses.book])).toBe(300n);
  const beforeCover=await h.observe(),premiumCash=await h.read('cash','balanceOf',[h.actors.borrower]);await step(page,'SIGN COVER PURCHASE');const covered=await h.observe(),receiptId=covered.state.loans[loanId]!.loan.activeCoverId;
  expect(receiptId).toBeGreaterThan(0n);expect(covered.state.nextLoanId).toBe(beforeCover.state.nextLoanId);expect(covered.state.loans[loanId]!.debtRecord).toEqual(beforeCover.state.loans[loanId]!.debtRecord);expect(await h.read('cash','balanceOf',[h.actors.borrower])).toBe(premiumCash-300n);expect(covered.state.receipts[receiptId.toString()]!.receipt.loanId).toBe(BigInt(loanId));

  await h.report(1);await h.report(2);await page.getByRole('button',{name:'REFRESH CONTRACT STATE',exact:true}).click();await expect(page.getByRole('button',{name:'SETTLE COVER',exact:true})).toBeEnabled();await step(page,'SETTLE COVER');
  const settled=await h.observe();expect(settled.state.receipts[receiptId.toString()]!.receipt.status).toBe(2n);expect(settled.state.loans[loanId]!.loan.activeCoverId).toBe(0n);expect(settled.state.loans[loanId]!.debt).toBeGreaterThan(0n);
  const benchmark=settled.state.receipts[receiptId.toString()]!.benchmark,symbol=settled.state.tokens.stock.symbol;
  await expect(page.getByRole('region',{name:'Your position',exact:true}).getByText(`${symbol} PRICE · FINALIZED REOPEN BENCHMARK`,{exact:true}).locator('..').locator('span').last()).toHaveText(formatUnits(benchmark.price,6));
  const owned=Object.entries(settled.state.claims).find(([,claim]:any)=>claim.owner===h.actors.buyerA&&!claim.withdrawn);expect(owned).toBeTruthy();const [claimId,claim]=owned as [string,any],stockBefore=await h.read('stock','balanceOf',[h.actors.buyerA]);
  await rahul.getByRole('button',{name:'REFRESH CONTRACT STATE',exact:true}).click();await expect(rahul.getByRole('button',{name:'WITHDRAW SHARES',exact:true})).toBeVisible();
  const exercised=settled.state.offers[h.ids[0]!]!;await expect(rahul.getByText(/^PAID /)).toHaveText(`PAID ${formatUnits(exercised.cumulativeCashCharged,6)} @ ${formatUnits(exercised.terms.strike,6)}`);
  await step(rahul,'WITHDRAW SHARES');expect((await h.read('vault','getClaim',[BigInt(claimId)])).withdrawn).toBe(true);expect(await h.read('stock','balanceOf',[h.actors.buyerA])).toBe(stockBefore+claim.deliveryUnits);
  // This flow never opens the advanced JSON editor.
  for(const p of [page,lender,rahul,meera])expect(await p.getByLabel('Loan arguments').isVisible().catch(()=>false)).toBe(false);
  expect(h.sends).toHaveLength(12);const hashes=h.f.transactions.filter(t=>h.sends.some(s=>s.from===t.actor&&s.to.toLowerCase()===t.to.toLowerCase()&&s.data===t.data)).map(t=>t.transactionHash);expect(hashes).toHaveLength(12);
  const proof=info.outputPath('owned-wallet-canonical-transactions.json');await writeFile(proof,JSON.stringify({authority:'OWNED ANVIL TEST WALLETS ONLY',loanId,receiptId:receiptId.toString(),hashes},null,2));await info.attach('owned-wallet-canonical-transactions',{path:proof,contentType:'application/json'});
 }finally{await h.stop();await Promise.all([lender.close(),rahul.close(),meera.close()]);}
});
