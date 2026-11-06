import {test,expect} from '@playwright/test';
test('same-origin API session cookie authorizes reads while cross-origin requests stay credential-free',async({page,context,baseURL})=>{
 const origin=baseURL!,crossOrigin=origin.replace('127.0.0.1','localhost');
 await context.addCookies([{name:'bell_owned_test_session',value:'fixture-only',url:origin,httpOnly:true,sameSite:'Strict'},{name:'bell_owned_other_session',value:'other-fixture',url:crossOrigin,httpOnly:true,sameSite:'Lax'}]);
 await page.route('**/api/**',async route=>{
  const authorized=(await route.request().headerValue('cookie'))?.includes('bell_owned_test_session=fixture-only');
  await route.fulfill({status:authorized?200:403,contentType:'application/json',body:JSON.stringify(route.request().url().endsWith('/manifest')?{test:'owned-session'}:{block:{number:'1',hash:`0x${'ab'.repeat(32)}`,timestamp:'1'},state:{}})});
 });
 let crossCookie:string|null=null;await page.route(`${crossOrigin}/other/manifest`,async route=>{crossCookie=await route.request().headerValue('cookie');await route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':origin},contentType:'application/json',body:'{"test":"cross-origin"}'});});
 await page.goto('/');
 const omitted=await page.evaluate(async()=> (await fetch('/api/manifest',{credentials:'omit'})).status);expect(omitted).toBe(403);
 const result=await page.evaluate(async(crossOrigin)=>{const {Transport}=await import('/src/adapter/transport.ts' as string);const t=new Transport();return {manifest:await t.manifest(),state:await t.state(),cross:await new Transport(`${crossOrigin}/other`).manifest()};},crossOrigin);
 expect(result.manifest).toEqual({test:'owned-session'});expect(result.state.block.number).toBe(1n);expect(result.cross).toEqual({test:'cross-origin'});expect(crossCookie).toBeNull();
});
