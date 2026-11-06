import {test,expect} from '@playwright/test';
import {fixture,offered} from './support';
test.setTimeout(180000);

test('Rahul and Meera independently configure whole lots and sign only their own escrow',async({page})=>{
  const scenario={id:'independent-lots',buyers:[{actor:'buyerA',strike:'120000000',snapshotShares:'4000000000000000000',premium:'150',nonce:'7'},{actor:'buyerB',strike:'90000000',snapshotShares:'6000000000000000000',premium:'250',nonce:'8'}]};
  const h=await fixture(page,'buyers',scenario);try{
    await offered(h);expect(h.ids).toHaveLength(2);
    const frame=await h.checkpoint('independent posted lots');expect(Object.keys(frame.state.loans)).toHaveLength(0);
    expect(frame.state.offers[h.ids[0]!]!.buyer).toBe(h.actors.buyerA);
    expect(frame.state.offers[h.ids[1]!]!.buyer).toBe(h.actors.buyerB);
    expect(frame.state.offers[h.ids[0]!]!.terms.snapshotShares).toBe(4000000000000000000n);
    expect(frame.state.offers[h.ids[1]!]!.terms.snapshotShares).toBe(6000000000000000000n);
    expect(frame.state.offers[h.ids[0]!]!.terms.premium).toBe(150n);
    expect(frame.state.offers[h.ids[1]!]!.terms.premium).toBe(250n);
    expect(frame.state.book.totalLockedCash).toBe(1020000000n);
    const posts=h.preparations.filter(p=>p.request.method==='postOffer');
    expect(posts.map(p=>p.tx.from)).toEqual([h.actors.buyerA,h.actors.buyerB]);
    expect(h.transactions.filter(t=>posts.some(p=>p.tx.data===t.data)).map(t=>t.actor)).toEqual([h.actors.buyerA,h.actors.buyerB]);
  }finally{await h.stop();}
});
