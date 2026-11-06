import {test,expect,type Page} from '@playwright/test';
import {harness} from './harness';
import {openAdvancedInputs,connectFixtureWallet} from './ui';
import {hashBundle} from '../../src/adapter/actions';
import {argsFor} from '../../services/keeper/abi';
import {amount} from '../../src/state/truth';
async function open(page:Page,name:string){await page.getByRole('button',{name:'Open menu'}).click();await page.getByRole('dialog').getByRole('button',{name,exact:true}).click();await expect(page.locator('main > div').first()).toContainText(name);await expect(page.getByText('(LOADING)').locator('..')).toHaveCSS('opacity','0');}
async function connect(page:Page){await page.goto('/');await open(page,'BORROW');await connectFixtureWallet(page);await expect(page.locator('header')).toContainText('LOCAL ANVIL');}
async function borrow(h:Awaited<ReturnType<typeof harness>>){const frame=await h.observe(),hashes=h.ids.map(id=>frame.state.termsHashes[id]!);await h.send(h.actors.borrower!,'manager','buyCover',argsFor('CoverManager','buyCover',[h.loanId.toString(),h.quote,h.ids,hashes,hashBundle(h.d.chainId,h.d.addresses.manager,h.quote,h.ids,hashes)]));}

test('review buyer edit signs visible amounts in the fresh-nonce repost',async({page})=>{
  const h=await harness();try{
    await h.attach(page,'buyerA');await connect(page);await open(page,'BUYERS');await openAdvancedInputs(page);
    await page.getByLabel('Offer terms').fill(JSON.stringify({...h.input.offerCommon,assetId:h.asset,policyHash:h.policy,strike:'100000000',nonce:'10'}));
    const inputs=page.locator('main input');await inputs.nth(0).fill('3');await inputs.nth(1).fill('120');await inputs.nth(2).fill('1.2');
    await page.getByRole('button',{name:'CANCEL + REPOST',exact:true}).click();await expect.poll(()=>h.sends.length).toBe(2);await expect(page.getByText('CONFIRMED · canonical snapshot refreshed')).toBeVisible();
    const offer=await h.read('book','getOffer',[h.ids.at(-1)]);expect(offer.terms.snapshotShares).toBe(3000000000000000000n);expect(offer.terms.strike).toBe(120000000n);expect(offer.terms.premium).toBe(1200000n);expect(offer.terms.nonce).toBe(10n);
    expect((await h.read('book','getOffer',[h.ids[0]])).status).toBe(4n);
  }finally{await h.stop();}
});

test('review new ordinary loan is selected while an older covered loan remains selectable',async({page},info)=>{
 const h=await harness();try{await borrow(h);await h.attach(page);await connect(page);await open(page,'BORROW');await openAdvancedInputs(page);await page.getByLabel('Loan action').selectOption('borrow');const args=JSON.parse(await page.getByLabel('Loan arguments').inputValue());args[0].principal='1000000';args[0].collateralShares='1000000000000000000';await page.getByLabel('Loan arguments').fill(JSON.stringify(args));await page.getByRole('button',{name:'SIGN LOAN ACTION',exact:true}).click();await expect(page.getByText('CONFIRMED · canonical snapshot refreshed')).toBeVisible();await expect(page.getByLabel('Loan',{exact:true})).toHaveValue('2');await page.getByLabel('Loan',{exact:true}).selectOption('1');await expect(page.getByLabel('Loan',{exact:true})).toHaveValue('1');await page.getByText('WALLET & EXACT INPUTS',{exact:true}).click();await info.attach('loan-selection',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});}finally{await h.stop();}
});

test('review partial locked cash and pending claim remain truthful through paused then confirmed delivery',async({page},info)=>{
  const h=await harness();try{
    await borrow(h);await h.report(1);await h.report(2);await h.send(h.actors.keeper!,'manager','settle',[1n]);await h.send(h.actors.owner!,'stock','setPaused',[true]);
    const frame=await h.observe(),offer={...frame.state.offers[h.ids[0]!]!,...frame.state.offerCoverage[h.ids[0]!]!};expect(offer.currentLockedCash).toBeLessThan(offer.cashCapacity);
    await h.attach(page,'buyerA');await connect(page);await open(page,'BUYERS');
    await expect(page.locator(`[title="Immutable capacity ${amount(offer.cashCapacity,6)} · current locked cash ${amount(offer.currentLockedCash,6)}"]`)).toHaveText(amount(offer.currentLockedCash,6));
    await expect(page.getByText(/PENDING UNITS/)).toBeVisible();await expect(page.getByText(/DELIVERED UNITS/)).toHaveCount(0);
    await expect(page.getByRole('button',{name:'PAUSED',exact:true})).toBeDisabled();await expect(page.getByText('Token transfers are paused; the claim remains owed.',{exact:true})).toBeVisible();await expect.poll(()=>h.sends.length).toBe(0);await expect(page.getByText(/PENDING UNITS/)).toBeVisible();
    await info.attach('pending-claim',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
    await h.send(h.actors.owner!,'stock','setPaused',[false]);await open(page,'CONTROL');await page.getByRole('button',{name:'REFRESH',exact:true}).first().click();await expect(page.locator('header')).toContainText('LOCAL ANVIL');await open(page,'BUYERS');
    await page.getByRole('button',{name:'WITHDRAW SHARES',exact:true}).click();await expect(page.getByText('CONFIRMED · canonical snapshot refreshed')).toBeVisible();await expect(page.getByText(/DELIVERED UNITS/)).toBeVisible();await expect(page.getByText(/PENDING UNITS/)).toHaveCount(0);
  }finally{await h.stop();}
});

test('review mismatched event boundary cannot leave a ready financial frame',async({page})=>{
  const h=await harness();try{
    await h.attach(page);await page.route('**/api/events?**',async route=>{const frame=await h.observe();await route.fulfill({contentType:'application/json',body:JSON.stringify({block:{number:(frame.block.number+1n).toString(),hash:frame.block.hash,timestamp:frame.block.timestamp.toString()},events:[]})});});
    await page.goto('/');await open(page,'LEND');await connectFixtureWallet(page);await expect(page.getByRole('button',{name:'SUPPLY USDC',exact:true})).toBeDisabled();await expect(page.locator('header')).toContainText('UNVERIFIED');expect(h.sends.length).toBe(0);
  }finally{await h.stop();}
});
