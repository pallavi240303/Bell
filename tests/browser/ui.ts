import {type Page} from '@playwright/test';
export async function openWalletPanel(page:Page){
 const parent=page.locator('main details').first();
 if(await parent.getAttribute('open')===null)await page.getByText('WALLET & EXACT INPUTS',{exact:true}).click();
}
export async function openAdvancedInputs(page:Page){
 await openWalletPanel(page);
 const summary=page.getByText('ADVANCED EXACT INPUTS',{exact:true});
 if(await summary.locator('..').getAttribute('open')===null)await summary.click();
}
export async function connectFixtureWallet(page:Page){
 await openWalletPanel(page);
 await page.getByRole('button',{name:'CONNECT WALLET',exact:true}).click();
}
