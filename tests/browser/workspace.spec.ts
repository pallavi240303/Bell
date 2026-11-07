import {test,expect,type Page} from '@playwright/test';
import {formatUnits} from 'viem';
import {writeFile} from 'node:fs/promises';
import {harness} from './harness';

async function connect(page:Page){
 await page.goto('/');await page.getByRole('button',{name:'Borrow USDC',exact:true}).click();
 await page.locator('header').getByRole('button',{name:'Connect wallet',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Connect wallet',exact:true}).click();
 await expect(page.locator('header .connection-dot')).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function task(page:Page,name:string){await page.locator('.action-card .segmented').getByRole('button',{name,exact:true}).click();}
async function readableText(page:Page){
 const tooSmall=await page.evaluate(()=>Array.from(document.querySelectorAll<HTMLElement>('body *')).filter(el=>{
  const style=getComputedStyle(el),box=el.getBoundingClientRect();
  return box.width>1&&box.height>1&&style.visibility!=='hidden'&&Array.from(el.childNodes).some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent?.trim())&&parseFloat(style.fontSize)<12;
 }).map(el=>({text:el.textContent?.trim().slice(0,60),size:getComputedStyle(el).fontSize})));
 expect(tooSmall).toEqual([]);
}

test('lender walkthrough connects any address and supplies then withdraws real local USDC',async({page},info)=>{
 test.setTimeout(120000);
 const h=await harness(false,false);try{
  await h.send(h.actors.lender!,'cash','approve',[h.d.addresses.pool,0n]);
  await page.emulateMedia({reducedMotion:'reduce'});await h.attach(page,'lender');await page.goto('/');
  if(info.project.name==='mobile')await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.getByRole('button',{name:'Guided demo',exact:true}).click();
  await page.locator('header').getByRole('button',{name:'Connect wallet',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByRole('combobox',{name:'Actor'})).toHaveCount(0);
  await dialog.getByRole('button',{name:'Connect wallet',exact:true}).click();
  await expect(page.locator('header .connection-dot')).toBeVisible();await expect(dialog).toHaveCount(0);
  await expect(page.locator('.wallet-trigger')).toContainText(h.actors.lender!.slice(0,6));
  await expect(page.locator('.participants')).toHaveCount(0);await expect(page.locator('.offers-card')).toHaveCount(0);
  const beforeCash=await h.read('cash','balanceOf',[h.actors.lender!]) as bigint,beforeShares=await h.read('pool','balanceOf',[h.actors.lender!]) as bigint;
  const action=async(label:string)=>{
   const count=h.sends.length;await page.locator('.action-card').getByRole('button',{name:label,exact:true}).click();
   await expect(dialog).toContainText(h.actors.lender!.slice(0,6));
   await dialog.getByRole('button',{name:label,exact:true}).click();
   await expect.poll(()=>h.sends.length).toBe(count+1);
   await expect(page.locator('[data-sonner-toast]')).toContainText('Transaction confirmed',{timeout:20000});
  };
  await page.getByLabel('Supply amount',{exact:true}).fill('2.000001');
  if(await page.locator('.action-card').getByRole('button',{name:'Approve USDC',exact:true}).count())await action('Approve USDC');
  await action('Supply USDC');
  const minted=(await h.read('pool','balanceOf',[h.actors.lender!]) as bigint)-beforeShares;
  expect(minted).toBeGreaterThan(0n);expect(await h.read('cash','balanceOf',[h.actors.lender!])).toBe(beforeCash-2000001n);
  await h.report(1);await page.getByRole('button',{name:'Refresh balances',exact:true}).click();
  await expect(page.locator('.lender-summary .helper')).toContainText('Review your updated balances');
  await page.getByRole('button',{name:'Withdraw',exact:true}).click();
  await page.getByLabel('Pool shares to redeem',{exact:true}).fill(formatUnits(beforeShares+minted+1n,18));
  await expect(page.locator('.action-card')).toContainText('exceeds your pool shares');
  await expect(page.locator('.action-card').getByRole('button',{name:'Withdraw USDC',exact:true})).toBeDisabled();
  await page.getByLabel('Pool shares to redeem',{exact:true}).fill(formatUnits(minted,18));
  await expect(page.locator('.action-card')).toContainText('2.000001 USDC');
  await action('Withdraw USDC');
  expect(await h.read('pool','balanceOf',[h.actors.lender!])).toBe(beforeShares);
  expect(await h.read('cash','balanceOf',[h.actors.lender!])).toBe(beforeCash);
  await expect(page.locator('.lender-summary')).toContainText('Transaction confirmed');
  await expect(page.locator('.lender-summary .helper')).toContainText('Review your updated balances');
  await expect(page.locator('.account-balances .metric').nth(1)).not.toContainText('—');
  expect(h.sends).toHaveLength(3);
  await expect(page.getByLabel('Pool shares to redeem',{exact:true})).toHaveValue('');
  await expect(page.getByRole('list',{name:'Demo progress'})).toContainText('Review result');
  await page.screenshot({path:info.outputPath('lender-roundtrip.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await h.stop();}
});

test('lender cannot redeem illiquid pool shares and sees an actionable reason',async({page},info)=>{
 test.skip(info.project.name==='mobile','Same contract guard; mobile round-trip above covers the form.');
 const h=await harness(false,true);try{
  await page.emulateMedia({reducedMotion:'reduce'});await h.attach(page,'lender');await page.goto('/');
  await page.getByRole('button',{name:'Guided demo',exact:true}).click();
  await page.locator('header').getByRole('button',{name:'Connect wallet',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Connect wallet',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Withdraw',exact:true}).click();await page.getByRole('button',{name:'All shares',exact:true}).click();
  await expect(page.locator('.action-card')).toContainText('Not enough available pool liquidity',{timeout:15000});
  await expect(page.locator('.action-card').getByRole('button',{name:'Withdraw USDC',exact:true})).toBeDisabled();expect(h.sends).toHaveLength(0);
 }finally{await h.stop();}
});

test('light workspace is readable, wallet is modal, and details are keyboard accessible',async({page},info)=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 const h=await harness();try{
  await h.attach(page);await page.goto('/');await expect(page.getByRole('heading',{name:'Backed before the bell.'})).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  await expect(page.locator('.home-footer .footer-wordmark')).toContainText('BELL');
  await page.locator('.home-footer').scrollIntoViewIfNeeded();
  await expect(page.locator('.footer-statement').locator('..')).toHaveCSS('opacity','1');
  await page.screenshot({path:info.outputPath('restored-footer.png')});
  const faq=page.locator('.home-faq [data-slot=accordion-trigger]').first();
  await faq.focus();await page.keyboard.press('Enter');await expect(faq).toHaveAttribute('aria-expanded','true');await page.keyboard.press('Enter');
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:info.outputPath('home.png'),fullPage:true});
  await readableText(page);await expect(page.locator('[data-visual-effects=cursor]')).toHaveCount(0);await expect(page.getByRole('button',{name:'Borrow USDC',exact:true})).toHaveCSS('cursor','pointer');
  await connect(page);await expect(page.getByText('Available USDC',{exact:true})).toBeVisible();
  await expect(page.locator('.position-card')).toContainText('Debt');await expect(page.locator('.offers-card')).toContainText('Funded offers');
  await expect(page.locator('body')).toHaveCSS('background-color','rgb(247, 247, 250)');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const tip=page.getByRole('button',{name:'About available usdc',exact:true});await tip.focus();await expect(page.getByRole('tooltip')).toContainText('wallet balance');await page.keyboard.press('Escape');
  await page.screenshot({path:info.outputPath('workspace.png'),fullPage:true});
  await readableText(page);
  if(info.project.name==='desktop'){
   await page.setViewportSize({width:1366,height:768});const sizes=[];
   for(const name of ['Borrow','Offer','Lend','Claims','Add cover']){await task(page,name);await expect(page.locator('.action-card .segmented').getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed','true');await page.evaluate(()=>scrollTo(0,0));const box=(await page.locator('.action-card').boundingBox())!;sizes.push({task:name,x:Math.round(box.x),width:Math.round(box.width),bottom:Math.round(box.y+box.height)});if(name==='Claims')await page.screenshot({path:info.outputPath('claims-laptop.png')});}
   console.log(JSON.stringify({viewport:768,cards:sizes}));expect(sizes.every(card=>card.bottom<=768)).toBe(true);expect(new Set(sizes.map(card=>`${card.x}:${card.width}`)).size).toBe(1);await page.setViewportSize({width:1440,height:1000});
  }
  await page.locator('header .wallet-trigger').click();await expect(page.getByRole('dialog',{name:'Your wallet'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  if(info.project.name==='mobile'){await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Guided demo',exact:true}).click();}else await page.getByRole('button',{name:'Guided demo',exact:true}).click();await expect(page.getByRole('list',{name:'Demo progress'})).toBeVisible();
  await page.screenshot({path:info.outputPath('demo.png'),fullPage:true});expect(h.sends).toHaveLength(0);
  if(info.project.name==='mobile')await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Activity',exact:true}).click();await expect(page.getByRole('heading',{name:'Activity',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Refresh',exact:true})).toHaveCount(1);await page.screenshot({path:info.outputPath('evidence.png'),fullPage:true});await readableText(page);
 }finally{await h.stop();}
});

test('review dialogs submit real local supply, loan, offers, cover, settlement and claim transactions',async({page,context},info)=>{
 test.skip(info.project.name==='mobile','Full transaction sequence runs once on desktop; mobile uses the same components.');
 test.setTimeout(180000);
 const h=await harness(false,false),lender=await context.newPage(),rahul=await context.newPage(),meera=await context.newPage();
 try{
  for(const actor of [h.actors.buyerA!,h.actors.buyerB!])await h.send(h.actors.owner!,'eligibility','setEligible',[h.asset,actor,h.policy,true]);
  await h.send(h.actors.lender!,'cash','approve',[h.d.addresses.pool,0n]);
  await h.attach(page,'borrower');await h.attach(lender,'lender');await h.attach(rahul,'buyerA');await h.attach(meera,'buyerB');
  const step=async(p:Page,label:string)=>{
   const count=h.sends.length;await p.locator('.action-card').getByRole('button',{name:label,exact:true}).click({timeout:15000});
   await expect(p.getByRole('dialog')).toContainText('Network');
   await p.getByRole('dialog').getByRole('button',{name:label,exact:true}).click();
   await expect.poll(()=>h.sends.length).toBe(count+1);
   await expect(p.locator('.latest-transaction')).toContainText('Confirmed');
   await expect(p.locator('[data-sonner-toast]').last()).toContainText('Transaction confirmed');
   const entry=h.f.transactions.at(-1)!;const receipt=await h.node.client.getTransactionReceipt({hash:entry.transactionHash});expect(receipt.status).toBe('success');
   expect((await h.node.client.getBlock({blockNumber:receipt.blockNumber})).hash).toBe(receipt.blockHash);
  };
  await connect(lender);await task(lender,'Lend');await lender.getByLabel('Supply amount',{exact:true}).fill('1');
  const assets=(await h.observe()).state.pool.totalAssets;await step(lender,'Approve USDC');await step(lender,'Supply USDC');expect((await h.observe()).state.pool.totalAssets).toBe(assets+1000000n);
  await connect(page);await page.getByLabel('Collateral',{exact:true}).fill('10');await page.getByLabel('You borrow',{exact:true}).fill('499.999999');
  await step(page,'Approve collateral');await step(page,'Borrow USDC');const loanId=Object.keys((await h.observe()).state.loans)[0]!;
  for(const [p,strike,premium] of [[rahul,'100','0.0001'],[meera,'90','0.0002']] as const){
   await connect(p);await task(p,'Offer');await p.getByLabel('Maximum shares',{exact:true}).fill('5');await p.getByLabel('Purchase price',{exact:true}).fill(strike);await p.getByLabel('Total premium',{exact:true}).fill(premium);await p.getByLabel('Offer expiry (UTC)',{exact:true}).fill('1970-01-02T06:33');
   await step(p,'Approve USDC');await step(p,'Post funded offer');
  }
  await page.getByRole('button',{name:'Refresh balances',exact:true}).click();await task(page,'Add cover');await expect(page.getByRole('button',{name:'Select offer',exact:true})).toHaveCount(2);
  await page.getByRole('button',{name:'Select offer',exact:true}).first().click();await page.getByRole('button',{name:'Select offer',exact:true}).click();
  await step(page,'Approve premium');await step(page,'Buy cover');const receiptId=(await h.observe()).state.loans[loanId]!.loan.activeCoverId;expect(receiptId).toBeGreaterThan(0n);
  await h.report(1);await h.report(2);await page.getByRole('button',{name:'Refresh balances',exact:true}).click();await expect(page.getByRole('button',{name:'Settle cover',exact:true})).toBeEnabled();await step(page,'Settle cover');
  expect((await h.observe()).state.receipts[receiptId.toString()]!.receipt.status).toBe(2n);await expect(page.getByRole('heading',{name:'What happened',exact:true})).toBeVisible();
  await rahul.getByRole('button',{name:'Refresh balances',exact:true}).click();await task(rahul,'Claims');await expect(rahul.getByRole('button',{name:'Collect shares',exact:true})).toBeEnabled();await step(rahul,'Collect shares');
  expect(h.sends).toHaveLength(12);await page.screenshot({path:info.outputPath('settled.png'),fullPage:true});
  await writeFile(info.outputPath('local-transactions.json'),JSON.stringify({authority:'Owned Anvil test wallets only',loanId,receiptId:String(receiptId),transactions:h.f.transactions.map(t=>t.transactionHash)},null,2));
 }finally{await h.stop();await Promise.all([lender.close(),rahul.close(),meera.close()]);}
});
