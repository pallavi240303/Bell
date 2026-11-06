import {test,expect} from '@playwright/test';
test('reduced-motion navigation never activates the frosted staircase overlay',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.route('**/api/**',r=>r.fulfill({status:503,body:'{}'}));await page.goto('/');
  expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  const layer=page.locator('[style*="clip-path"]').first();const resting=await layer.getAttribute('style');
  await page.getByRole('button',{name:'Open menu'}).click();await page.getByRole('dialog').getByRole('button',{name:'BUYERS',exact:true}).click();
  expect(await layer.getAttribute('style')).toBe(resting);
  await expect(page.getByRole('heading',{name:/Lock USDC/})).toBeVisible();
});
