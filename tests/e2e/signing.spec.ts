import {test,expect} from '@playwright/test';
import {fixture,open} from './support';
import {raw} from '../../services/keeper/types';
test.setTimeout(180000);

test('a substituted unsigned caller cannot reach the wallet and Control cannot impersonate report or buyer actors',async({page})=>{
  const h=await fixture(page,'signing');try{
    await h.configure();const before=await h.observe(),count=h.transactions.length;
    await page.route('**/api/prepare',async route=>{
      const response=await route.fetch({url:h.apiUrl+'/prepare'}),tx=await response.json();
      await route.fulfill({json:{...tx,from:h.actors.buyerA}});
    });
    await page.getByText('WALLET & EXACT INPUTS').click();await page.getByLabel('Approval amount raw').fill('200');
    await page.getByRole('button',{name:'APPROVE EXACT AMOUNT',exact:true}).click();
    await expect(page.getByText('Unsigned transaction mismatch',{exact:true})).toBeVisible();
    expect(h.transactions).toHaveLength(count);expect(raw(await h.observe())).toEqual(raw(before));
    h.rejections.push({kind:'substituted-unsigned-caller',before:raw(before),after:raw(await h.observe()),walletSends:0});
    await open(page,'CONTROL');
    await expect(page.getByText('CONTROL · READ-ONLY EVIDENCE',{exact:true})).toBeVisible();
    await expect(page.getByText('CONNECTED WALLET · NO REPORT OR TOKEN AUTHORITY',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'REFRESH PRICE',exact:true}).click();await page.getByRole('button',{name:'REFRESH STATE',exact:true}).click();
    await page.getByRole('button',{name:'REFRESH',exact:true}).first().click();
    expect(h.transactions).toHaveLength(count);expect(raw(await h.observe())).toEqual(raw(before));
    for(const [contract,method,args]of [['manager','settle',['1']],['receiver','onReport',['0x','0x']],['stock','setPaused',[true]]] as const){
      const response=await fetch(h.apiUrl+'/prepare',{method:'POST',body:JSON.stringify({chainId:h.d.chainId,from:h.actors.borrower,contract,method,args})});expect(response.status).toBe(400);
    }
    await open(page,'BORROW');await h.checkpoint('unsigned substitution and read-only Control');
  }finally{await h.stop();}
});
