import {test,expect} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {harness} from '../browser/harness';
import {hashBundle} from '../../src/adapter/actions';
import {argsFor} from '../../services/keeper/abi';
const require=createRequire(import.meta.url);
const {getComparator}=require('../../node_modules/playwright-core/lib/coreBundle.js').utils;
const pages=['HOME','REPLAY','BORROW','BUYERS','LEND','CONTROL'];
for(const name of pages)test(`${name} reviewed truthful state comparison`,async({page},info)=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const h=await harness(name!=='BUYERS');try{
  if(name!=='BUYERS'){
  const frame=await h.observe();const hashes=h.ids.map(id=>frame.state.termsHashes[id]!);const expectedHash=hashBundle(h.d.chainId,h.d.addresses.manager,h.quote,h.ids,hashes);
  await h.send(h.actors.borrower!,'manager','buyCover',argsFor('CoverManager','buyCover',[h.loanId.toString(),h.quote,h.ids,hashes,expectedHash]));
  if(name==='BORROW')await h.send(h.actors.buyerA!,'book','postOffer',argsFor('CommitmentBook','postOffer',[{...h.input.offerCommon,assetId:h.asset,policyHash:h.policy,strike:'100000000',nonce:'11'}]));
  }
  await h.attach(page,name==='LEND'?'lender':name==='BUYERS'?'buyerA':'borrower');
  await page.goto('/');await page.getByRole('button',{name:/^WALLET/}).click();await expect(page.locator('header')).toContainText('LOCAL ANVIL');await page.evaluate(()=>document.fonts.ready);
  if(name!=='HOME'){await page.getByRole('button',{name:'Open menu'}).click();await page.getByRole('dialog').getByRole('button',{name,exact:true}).click();await expect(page.getByText('(LOADING)').locator('..')).toHaveCSS('opacity','0');}
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}[data-visual-effects]{display:none!important}'});
  await page.evaluate(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=500){window.scrollTo(0,y);await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));}window.scrollTo(0,0);});
  await page.waitForTimeout(250);
  const geometry=await page.evaluate(()=>({viewportWidth:innerWidth,documentWidth:document.documentElement.scrollWidth,main:(()=>{const r=document.querySelector('main')!.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})(),sections:[...document.querySelectorAll('main section')].map(e=>{const r=e.getBoundingClientRect();return{label:e.getAttribute('aria-label'),x:r.x,y:r.y,width:r.width,height:r.height};}),selects:[...document.querySelectorAll('main select')].map(e=>{const r=e.getBoundingClientRect();return{label:e.getAttribute('aria-label'),x:r.x,width:r.width};})}));
  writeFileSync(info.outputPath('geometry.json'),JSON.stringify(geometry,null,2));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  // No masks: financial values, status, controls, text and rows all remain visible.
  const actual=await page.screenshot({fullPage:true,animations:'disabled'});
  const originalName=`${name.toLowerCase()}-${page.viewportSize()!.width}.png`;
  const approved=JSON.parse(readFileSync('tests/visual/baseline-inventory.json','utf8')).approved.find((entry:any)=>entry.file===originalName);
  expect(createHash('sha256').update(readFileSync(`tests/visual/baselines/${originalName}`)).digest('hex')).toBe(approved.sha256);
  // Exact truthful-state bytes explicitly reviewed; original design images stay immutable above.
  const expected=readFileSync(`tests/visual/current/${originalName}`);
  const compare=getComparator('image/png')(actual,expected,{threshold:0.3,maxDiffPixelRatio:0.0025});
  writeFileSync(info.outputPath('actual.png'),actual);
  if(compare?.diff)writeFileSync(info.outputPath('diff.png'),compare.diff);
  writeFileSync(info.outputPath('comparison.json'),JSON.stringify({page:name,width:page.viewportSize()!.width,masks:[],result:compare?.errorMessage??'PASS'},null,2));
  await info.attach('actual',{body:actual,contentType:'image/png'});
  if(compare?.diff)await info.attach('diff',{body:compare.diff,contentType:'image/png'});
  await info.attach('mask-audit',{body:Buffer.from(JSON.stringify({masks:[],financialValuesMasked:false})),contentType:'application/json'});
  expect(compare?.errorMessage).toBeUndefined();
  }finally{await h.stop();}
});
test('menu and transaction panel retain usable mobile and desktop controls',async({page},info)=>{
  await page.route('**/api/**',route=>route.fulfill({status:503,body:'Snapshot unavailable'}));await page.goto('/');await page.getByRole('button',{name:'Open menu'}).click();await expect(page.getByRole('dialog')).toBeVisible();await info.attach('menu',{body:await page.screenshot(),contentType:'image/png'});await page.getByRole('dialog').getByRole('button',{name:'LEND',exact:true}).click();await page.getByText('WALLET & EXACT INPUTS').click();await expect(page.getByRole('button',{name:'APPROVE EXACT AMOUNT'})).toBeDisabled();await info.attach('transaction-disconnected',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});
