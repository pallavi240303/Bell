import {test,expect,type Page} from '@playwright/test';
import {decodeFunctionData} from 'viem';
import {harness} from './harness';
import {openAdvancedInputs} from './ui';
import {hashBundle} from '../../src/adapter/actions';
import {artifact} from '../../services/keeper/abi';
import {transition} from '../../engine/state';
import {engineState,compareState} from '../../services/keeper/parity';
async function open(page:Page,name:string){await page.getByRole('button',{name:'Open menu'}).click();await page.getByRole('dialog').getByRole('button',{name,exact:true}).click();await expect(page.getByText('(LOADING)').locator('..')).toHaveCSS('opacity','0');}
test('provider choices are plain text, discovery is passive, and only the selected object connects',async({page})=>{
 const h=await harness();try{
  await h.attach(page);await page.addInitScript(()=>{
   const requests:string[]=[];(window as any).providerRequests=requests;
   const legacy=(window as any).ethereum;
   const a={...legacy,isMetaMask:true,request:(args:any)=>{requests.push('first:'+args.method);throw Error('wrong provider object');}};
   const b={...legacy,isMetaMask:true,request:(args:any)=>{requests.push('second:'+args.method);return legacy.request(args);}};
   window.addEventListener('eip6963:requestProvider',()=>{for(const [name,provider]of [['<img src=x onerror=window.compromised=true>',a],['Rabby',b]])window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{name,uuid:'duplicate',rdns:'same.wallet',icon:'javascript:window.compromised=true'},provider}}));});
  });
  await page.goto('/');await open(page,'BORROW');await page.getByText('WALLET & EXACT INPUTS',{exact:true}).click();
  await expect(page.getByLabel('Wallet provider')).toHaveValue('');expect(await page.evaluate(()=>(window as any).providerRequests)).toEqual([]);
  await expect(page.getByLabel('Wallet provider').getByRole('option',{name:'<img src=x onerror=window.compromised=true> · same.wallet',exact:true})).toHaveCount(1);expect(await page.evaluate(()=>(window as any).compromised)).toBeUndefined();
  await page.getByLabel('Wallet provider').selectOption({label:'Rabby · same.wallet'});await page.getByRole('button',{name:'CONNECT WALLET',exact:true}).click();await expect(page.locator('header')).toContainText('LOCAL ANVIL');
  const requests=await page.evaluate(()=>(window as any).providerRequests as string[]);expect(requests).toContain('second:eth_requestAccounts');expect(requests.some(x=>x.startsWith('first:'))).toBe(false);
  await expect(page.locator('main details [data-provenance="address"]')).toContainText(h.actors.borrower!);
  await openAdvancedInputs(page);await page.getByLabel('Approval amount raw').fill('12345');await page.getByLabel('Wallet provider').selectOption({label:'<img src=x onerror=window.compromised=true> · same.wallet'});await expect(page.getByLabel('Approval amount raw')).toHaveValue('');await expect(page.getByText('No wallet connected',{exact:true})).toBeVisible();await expect(page.getByText('Wallet changed · reconnect required',{exact:true})).toBeVisible();
 }finally{await h.stop();}
});
for(const settlement of ['settle','terminalSettle'] as const)test(`connected browser signs ${settlement} for an explicit receipt and matches the engine`,async({page})=>{
 const h=await harness();try{
  const beforeCover=await h.observe(),hashes=h.ids.map(id=>beforeCover.state.termsHashes[id]!);const hash=hashBundle(h.d.chainId,h.d.addresses.manager,h.quote,h.ids,hashes);
  await h.send(h.actors.borrower!,'manager','buyCover',[h.loanId,h.quote,h.ids,hashes,hash]);
  if(settlement==='settle'){await h.report(1);await h.report(2);}else await h.node.time(110000n);
  await h.attach(page);await page.goto('/');await open(page,'BORROW');await page.getByText('WALLET & EXACT INPUTS',{exact:true}).click();await page.getByRole('button',{name:'CONNECT WALLET',exact:true}).click();await expect(page.locator('header')).toContainText('LOCAL ANVIL');
  await openAdvancedInputs(page);await page.getByLabel('Loan action').selectOption(settlement);await page.getByLabel('Loan arguments').fill('["1"]');
  const before=await h.observe(),market=await h.f.market();await page.getByRole('button',{name:'SIGN LOAN ACTION',exact:true}).click();await expect(page.getByText('CONFIRMED · canonical snapshot refreshed')).toBeVisible();
  expect(h.sends).toHaveLength(1);expect(h.sends[0].from).toBe(h.actors.borrower);expect(h.sends[0].to.toLowerCase()).toBe(h.d.addresses.manager);expect(h.sends[0].value).toBe('0x0');
  const call=decodeFunctionData({abi:artifact('CoverManager').abi,data:h.sends[0].data});expect(call.functionName).toBe(settlement);expect(call.args).toEqual([1n]);
  const entry=h.f.transactions.at(-1)!,after=await h.observe();const predicted=transition(engineState(before.state,h.d),{kind:settlement==='settle'?'settle':'terminal',caller:h.actors.borrower!,now:entry.block.timestamp,receiptId:1n,market,benchmark:before.state.receipts['1'].benchmark});compareState(predicted,after.state,h.d,after.block.timestamp);
  expect(after.state.receipts['1'].receipt.status).toBe(2n);await expect(page.getByText(settlement==='settle'?'ACTIVE':'HANDOFF_PENDING',{exact:true})).toBeVisible();
 }finally{await h.stop();}
});
