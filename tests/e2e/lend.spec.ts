import {test,expect} from '@playwright/test';
import {fixture,funded} from './support';
test.setTimeout(180000);

test('clean replay accepts lender supply only through its distinct connected wallet',async({page})=>{
  const h=await fixture(page,'lender');try{
    expect((await h.observe()).state.pool.totalAssets).toBe(0n);
    await funded(h);
    const frame=await h.checkpoint('supplied');
    expect(frame.state.pool.totalAssets).toBe(10000000000n);
    expect(frame.state.balances[h.actors.lender!]!.poolShares).toBeGreaterThan(0n);
    expect(h.transactions.filter(t=>t.lane.includes('CONNECTED')).every(t=>t.actor===h.actors.lender)).toBe(true);
  }finally{await h.stop();}
});
