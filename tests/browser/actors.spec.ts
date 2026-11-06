import {test,expect,type Page} from '@playwright/test';
import {harness} from './harness';
async function open(page:Page,name:string){await page.getByRole('button',{name:'Open menu'}).click();await page.getByRole('dialog').getByRole('button',{name,exact:true}).click();await expect(page.getByText('(LOADING)').locator('..')).toHaveCSS('opacity','0');}
async function connect(page:Page){await open(page,'LEND');await page.getByRole('button',{name:/^WALLET/}).click();await expect(page.locator('header')).toContainText('LOCAL ANVIL');}
test('connected lender approves exact cash, deposits and redeems actual shares',async({page})=>{
  const h=await harness();try{await h.attach(page,'lender');await page.goto('/');await connect(page);await open(page,'LEND');await page.getByText('WALLET & EXACT INPUTS').click();await page.getByLabel('Approval amount raw').fill('1000000');await page.getByRole('button',{name:'APPROVE EXACT AMOUNT'}).click();await expect(page.getByText('CONFIRMED · canonical snapshot refreshed')).toBeVisible();
    await page.getByRole('region',{name:'Supply',exact:true}).getByRole('textbox').first().fill('1');await page.getByRole('button',{name:'SUPPLY USDC',exact:true}).click();await expect.poll(()=>h.sends.length).toBe(2);await expect(page.getByText('CONFIRMED · canonical snapshot refreshed')).toBeVisible();
    await page.getByRole('region',{name:'Redeem',exact:true}).getByRole('textbox').fill('1');await page.getByRole('button',{name:'REDEEM SHARES',exact:true}).click();await expect.poll(()=>h.sends.length).toBe(3);await expect(page.getByText('CONFIRMED · canonical snapshot refreshed')).toBeVisible();
    expect(await h.read('cash','allowance',[h.actors.lender,h.d.addresses.pool])).toBe(0n);
  }finally{await h.stop();}
});
test('connected buyer posts complete terms, cancels FREE lot and withdraws cash credit',async({page})=>{
  const h=await harness();try{await h.attach(page,'buyerA');await page.goto('/');await connect(page);await open(page,'BUYERS');await page.getByText('WALLET & EXACT INPUTS').click();
    await page.getByLabel('Offer terms').fill(JSON.stringify({...h.input.offerCommon,assetId:h.asset,policyHash:h.policy,strike:'100000000',nonce:'10'}));
    const inputs=page.locator('main input');await inputs.nth(0).fill('5');await inputs.nth(1).fill('100');await inputs.nth(2).fill('0.0001');await page.getByRole('button',{name:'LOCK USDC · POST OFFER',exact:true}).click();await expect.poll(()=>h.sends.length).toBe(1);await expect(page.getByText('CONFIRMED · canonical snapshot refreshed')).toBeVisible();
    await page.getByRole('button',{name:'CANCEL',exact:true}).last().click();await expect.poll(()=>h.sends.length).toBe(2);await expect(page.getByText('CONFIRMED · canonical snapshot refreshed')).toBeVisible();
    await page.getByRole('button',{name:'WITHDRAW CASH CREDIT',exact:true}).click();await expect.poll(()=>h.sends.length).toBe(3);await expect(page.getByText('CONFIRMED · canonical snapshot refreshed')).toBeVisible();expect(await h.read('book','cashCredit',[h.actors.buyerA])).toBe(0n);
  }finally{await h.stop();}
});
test('borrower signs one exact atomic bundle then reads partial and terminal settlement truth',async({page})=>{
  const h=await harness();try{await h.attach(page,'borrower');await page.goto('/');await connect(page);await open(page,'BORROW');await page.getByText('WALLET & EXACT INPUTS').click();await page.getByLabel('Borrow consent').fill(JSON.stringify(h.quote));
    await page.getByRole('button',{name:'FREE',exact:true}).first().click();await page.getByRole('button',{name:'FREE',exact:true}).last().click();await page.getByRole('button',{name:'SIGN ATOMIC BORROW',exact:true}).click();await expect.poll(()=>h.sends.length).toBe(1);await expect(page.getByText('CONFIRMED · canonical snapshot refreshed')).toBeVisible();expect(await h.read('manager','nextReceiptId')).toBe(2n);
    await h.report(1);await h.report(2);await h.send(h.actors.keeper!,'manager','settle',[1n]);const partial=await h.observe();expect(partial.state.receipts['1'].debt).toBeGreaterThan(0n);
    await open(page,'CONTROL');await page.getByRole('button',{name:'REFRESH SNAPSHOT',exact:true}).first().click();await open(page,'BORROW');await expect(page.getByText('ACTIVE',{exact:true})).toBeVisible();
    await h.node.time(2000n);await h.send(h.actors.keeper!,'manager','terminalSettle',[1n]);await open(page,'CONTROL');await page.getByRole('button',{name:'REFRESH SNAPSHOT',exact:true}).first().click();await open(page,'BORROW');await expect(page.getByText('HANDOFF_PENDING',{exact:true})).toBeVisible();expect((await h.observe()).state.receipts['1'].debt).toBe(0n);
    await open(page,'REPLAY');expect(h.sends.length).toBe(1);
  }finally{await h.stop();}
});
