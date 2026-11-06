import {test,expect} from '@playwright/test';
import {encodeFunctionData} from 'viem';
import {harness} from './harness';
import {Wallet,type Intent} from '../../src/adapter/wallet';
import {hashBundle} from '../../src/adapter/actions';
import {prepareActor} from '../../services/keeper/transactions';
import {artifact} from '../../services/keeper/abi';
import {Controller} from '../../src/state/controller';
for(const mode of ['healthy','full-repayment','terminal-no-report','paused-delivery'] as const)test(`contract ${mode} remains distinct in the browser projection`,async()=>{
  const h=await harness();try{
    const wallet=async(account:any)=>{const w=new Wallet({request:async({method,params}:any)=>{if(method==='eth_accounts'||method==='eth_requestAccounts')return[account];if(method==='eth_sendTransaction'){const tx=params[0];return (await h.node.send(account,tx.to,tx.data)).transactionHash;}return h.node.request(method,params);}},h.node.client,h.d);await w.connect();return w;};
    const borrower=await wallet(h.actors.borrower);const act=async(w:Wallet,intent:Intent)=>{const block=(await h.observe()).block;const unsigned=await prepareActor(h.d,block,{...intent,chainId:h.d.chainId,from:w.account},h.node.client);return w.send(intent,unsigned,async minimum=>{expect((await h.observe()).block.number).toBeGreaterThanOrEqual(minimum);});};
    const before=await h.observe(),hashes=h.ids.map(id=>before.state.termsHashes[id]!);const hash=hashBundle(h.d.chainId,h.d.addresses.manager,h.quote,h.ids,hashes);
    await act(borrower,{contract:'manager',method:'borrowWithCover',args:[h.quote,h.ids,hashes,hash]});
    if(mode==='healthy'){
      await h.report(1);await h.report(2,200000000n);const debt=(await h.observe()).state.receipts['1'].debt;
      await h.send(h.actors.keeper!,'manager','settle',[1n]);const state=await h.observe();expect(state.state.receipts['1'].debt).toBe(debt);expect(state.state.receipts['1'].receipt.status).toBe(1n);
      await expect(h.node.client.call({account:h.actors.keeper!,to:h.d.addresses.manager,data:encodeFunctionData({abi:artifact('CoverManager').abi,functionName:'settle',args:[1n]})})).rejects.toThrow();
    }else if(mode==='full-repayment'){
      const debt=(await h.observe()).state.receipts['1'].debt;await act(borrower,{approval:'repay',amount:debt.toString()});await act(borrower,{contract:'manager',method:'repay',args:['1',debt.toString()]});expect((await h.observe()).state.receipts['1'].debt).toBe(0n);
    }else{
      if(mode==='paused-delivery')await h.send(h.actors.owner!,'stock','setPaused',[true]);
      await h.node.time(2000n);await h.send(h.actors.keeper!,'manager','terminalSettle',[1n]);let state=await h.observe();expect(state.state.receipts['1'].debt).toBe(0n);
      await expect(h.node.client.call({account:h.actors.keeper!,to:h.d.addresses.manager,data:encodeFunctionData({abi:artifact('CoverManager').abi,functionName:'terminalSettle',args:[1n]})})).rejects.toThrow();
      if(mode==='paused-delivery'){
        const [id,claim]=Object.entries(state.state.claims)[0] as [string,any];const owner=await wallet(claim.owner);
        await expect(act(owner,{contract:'vault',method:'withdrawClaim',args:[id,claim.owner]})).rejects.toThrow();expect((await h.observe()).state.claims[id].withdrawn).toBe(false);
        await h.send(h.actors.owner!,'stock','setPaused',[false]);await act(owner,{contract:'vault',method:'withdrawClaim',args:[id,claim.owner]});state=await h.observe();expect(state.state.claims[id].withdrawn).toBe(true);
      }
    }
    const controller=new Controller();controller.wallet=borrower;controller.frame=await h.observe();const v=controller.renderVals();expect(v.outcome.show).toBe(false);expect(v.bell.debtFmt).not.toBe('—');expect(v.bell.badge).toBe(mode==='healthy'?'ACTIVE':'HANDOFF_PENDING');
  }finally{await h.stop();}
});
