import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../../src/state/controller.ts';
import {sample} from './fixtures.ts';
import {borrowRequest,marketContext} from '../../src/adapter/actions.ts';
const addr=(n:string)=>`0x${n.repeat(40)}`;
function setup(){const x=sample(),c=new Controller();c.wallet={account:x.account,verified:true,dispose(){}} as any;c.frame=x.frame;c.manifest={chainId:'31337',addresses:{manager:x.manager,loanManager:addr('1'),pool:addr('2'),book:addr('3'),vault:addr('4'),stock:addr('c')}} as any;Object.assign(x.frame.state.balances[x.account],{cashAllowancePool:0n,cashAllowanceBook:0n,poolShares:0n});x.frame.state.balances[addr('2')]={cash:1000000000n};x.frame.state.stockTokens[addr('c')].balances[x.account].allowanceVault=10n**20n;return {...x,c};}
test('Activity token and reference follow the chosen asset instead of the connected wallet loan',()=>{
 const {c,frame,asset}=setup(),other=`0x${'e'.repeat(64)}`,token=addr('f');
 frame.state.assets[other]=structuredClone(frame.state.assets[asset]);
 frame.state.assets[other].configs['1'].config.assetToken=token;
 frame.state.assets[other].latestReference.price=73000000n;
 frame.state.stockTokens[token]={symbol:'OTHER',paused:true};
 c.page='CONTROL';c.selectedAssetId=other;
 let v=c.renderVals();assert.equal(v.stockSymbol,'OTHER');assert.equal(v.controlReferenceFmt,'73');assert.match(v.tokenState,/PAUSED/);
 frame.state.stockTokens[token].symbol='UPDATED';frame.state.stockTokens[token].paused=false;
 frame.state.assets[other].latestReference.price=42000000n;
 v=c.renderVals();assert.equal(v.stockSymbol,'UPDATED');assert.equal(v.controlReferenceFmt,'42');assert.equal(v.tokenState,'TRANSFERS ENABLED');
 delete frame.state.stockTokens[token];v=c.renderVals();assert.equal(v.stockSymbol,'shares');assert.equal(v.tokenState,'UNAVAILABLE');
});
test('available collateral value and offer escrow are actual projections, while absent inputs remain unavailable',()=>{const {c}=setup();let v=c.renderVals();assert.equal(v.bell.valFmt,'1000');assert.equal(v.fEscrowFmt,'—');c.set('fShares','1');c.set('fPct','100');c.set('fFee','0.2');v=c.renderVals();assert.equal(v.fEscrowFmt,'100');assert.equal(v.offers[0].termsHash,c.frame!.state.termsHashes[v.offers[0].id]);});
test('human borrow controls produce one ordinary borrow intent with exact decimals and fresh metadata',async()=>{const {c,asset,account}=setup();c.set('borrowAmount','4.125001');c.set('collateralAmount','0.123456789012345678');let sent:any;c.send=async i=>{sent=i;return {} as any;};assert.equal(c.renderVals().workflow.canBorrow,true);await (c as any).openOrdinaryLoan();assert.equal(sent.contract,'loanManager');assert.equal(sent.method,'borrow');assert.equal(sent.args[0].assetId,asset);assert.equal(sent.args[0].principal,'4125001');assert.equal(sent.args[0].collateralShares,'123456789012345678');assert.equal(sent.args[0].recipient,account);});
test('invalid decimals and stale session disable ordinary borrow with an actionable reason',()=>{const {c,frame,session}=setup();c.set('borrowAmount','1.0000001');c.set('collateralAmount','1');assert.equal(c.renderVals().workflow.canBorrow,false);c.set('borrowAmount','1');frame.state.sessions[session].fact.scheduledClose=frame.block.timestamp-1n;const v=c.renderVals();assert.equal(v.workflow.canBorrow,false);assert.match(v.workflow.borrowReason,/session|reference|operator/i);assert.equal(v.workflow.marketReady,false);});
test('friendly approvals are exact and separate from the financial action',async()=>{const {c}=setup();let sent:any;c.send=async i=>{sent=i;return {} as any;};c.set('supIn','2.000001');await (c as any).approveAction('deposit');assert.deepEqual(sent,{approval:'deposit',amount:'2000001'});c.set('collateralAmount','0.001');await (c as any).approveAction('collateral');assert.deepEqual(sent,{approval:'collateral',amount:'1000000000000000'});c.set('fShares','0.000000000000000001');c.set('fPct','1');await (c as any).approveAction('offer');assert.deepEqual(sent,{approval:'offer',amount:'1'});});
test('borrow draft updates changed reference metadata without losing entered raw amounts',()=>{const {c,frame,asset}=setup();c.prefill();let draft=JSON.parse(c.loanArgs);draft[0].principal='123';draft[0].collateralShares='456';c.set('loanArgs',JSON.stringify(draft));const next=`0x${'ef'.repeat(32)}`;frame.state.assets[asset].latestReference.reportHash=next;c.prefill();draft=JSON.parse(c.loanArgs);assert.equal(draft[0].referenceReportHash,next);assert.equal(draft[0].principal,'123');assert.equal(draft[0].collateralShares,'456');});
test('market selection skips an expired asset and requires explicit choice between two ready assets',()=>{const {frame,asset,session}=setup();const second=`0x${'e'.repeat(64)}`,sid=`0x${'f'.repeat(64)}`;frame.state.assets[second]=structuredClone(frame.state.assets[asset]);frame.state.assets[second].state.activeSessionId=sid;frame.state.assets[second].latestReference.assetId=second;frame.state.assets[second].latestReference.sessionId=sid;frame.state.sessions[sid]=structuredClone(frame.state.sessions[session]);frame.state.sessions[sid].fact.assetId=second;frame.state.sessions[session].fact.scheduledClose=frame.block.timestamp-1n;assert.equal(marketContext(frame).assetId,second);frame.state.sessions[session].fact.scheduledClose=100000n;assert.throws(()=>marketContext(frame),/choose|select/i);assert.equal((borrowRequest as any)(frame,addr('a'),{},second).assetId,second);});
test('new human input and consent are cleared on actor changes',()=>{const {c}=setup();c.set('borrowAmount','1');c.set('collateralAmount','2');c.set('offerExpiry','100300');c.chooseAccount(addr('b'));assert.equal((c as any).borrowAmount,'');assert.equal((c as any).collateralAmount,'');assert.equal((c as any).offerExpiry,'');assert.equal(c.quoteText,'');assert.equal(c.loanArgs,'');});
test('public observer cards can show a real loan without granting wallet signing',()=>{const {c,frame}=setup();c.wallet=undefined;c.page='REPLAY';const v=c.renderVals();assert.equal(v.ready,false);assert.equal(v.bell.debtFmt,'399.1');assert.match(v.bell.note,/observ|public/i);assert.equal(v.workflow.canBorrow,false);assert.equal(v.buyOk,false);delete frame.state.loans['7'];assert.equal(c.renderVals().bell.debtFmt,'—');});
test('settlement controls use the selected receipt, never the durable loan identifier',async()=>{const {c,frame,p}=setup();p.loan.activeCoverId=12n;frame.state.receipts['12']={receipt:{loanId:7n,status:1n,settlementDeadline:110000n,consent:{borrower:c.wallet!.account}},benchmark:{finalized:true},receiptRemainingCoverage:0n};c.selectedReceiptId='12';let sent:any;c.send=async i=>{sent=i;return {} as any;};await (c as any).settleSelected(false);assert.deepEqual(sent,{settlement:'settle',receiptId:'12'});});
test('finalized reopen valuation remains visible after the session closes without enabling new borrowing',()=>{const {c,frame,asset,session}=setup();frame.state.sessions[session].fact.phase=3n;frame.state.assets[asset].referenceCheck.ok=false;frame.state.sessions[session].benchmark={finalized:true,assetId:asset,sessionId:session,price:40000000n,multiplierNumerator:1n,multiplierDenominator:1n,reportHash:`0x${'d'.repeat(64)}`};const v=c.renderVals();assert.equal(v.bell.pxFmt,'40');assert.equal(v.bell.valFmt,'400');assert.match(v.bell.pxSrc,/BENCHMARK/);assert.equal(v.workflow.canBorrow,false);});
test('claim paid and strike come from matching accepted fill events; pause and maturity block withdrawal',()=>{const {c,frame,account,manager,ids}=setup();frame.state.claims={'5':{owner:account,receiptId:7n,snapshotShares:10n**18n,deliveryUnits:10n**18n,withdrawn:false,maturesAt:99000n}};frame.state.offers[ids[0]!].buyer=account;frame.state.receipts['12']={receipt:{loanId:7n,status:2n,consent:{}},benchmark:{finalized:false},receiptRemainingCoverage:0n};const tx=`0x${'b'.repeat(64)}`;c.events=[{address:manager,transactionHash:tx,logIndex:3n,decoded:{eventName:'ReceiptOfferExercised',args:{receiptId:12n,offerId:ids[0],claimId:5n,additionalShares:10n**18n,debtApplied:100000000n}}},{address:addr('3'),transactionHash:tx,logIndex:1n,decoded:{eventName:'OfferExercised',args:{offerId:ids[0],receiptId:12n,cashCharged:100000000n,debtApplied:100000000n}}}].map(e=>({...e,blockNumber:9n,blockTimestamp:99500n}));let row=c.renderVals().claims[0];assert.equal(row.paidFmt,'100');assert.equal(row.pxFmt,'100');assert.equal(row.canWithdraw,true);frame.state.stockTokens[addr('c')].paused=true;row=c.renderVals().claims[0];assert.equal(row.canWithdraw,false);assert.match(row.reason,/paused/i);frame.state.stockTokens[addr('c')].paused=false;frame.state.claims['5'].maturesAt=100000n;row=c.renderVals().claims[0];assert.equal(row.canWithdraw,false);assert.match(row.reason,/matur/i);c.events[1].address=addr('9');assert.equal(c.renderVals().claims[0].paidFmt,'—');});


test('lender supply cannot approve more USDC than the connected wallet owns',()=>{
 const {c}=setup();c.supIn='1001';const v=c.renderVals();assert.equal(v.canSupply,false);assert.equal(v.workflow.canApproveSupply,false);assert.match(v.supplyReason,/Insufficient USDC/);
});
test('withdrawal uses a contract simulation for the connected address at the verified block',async()=>{
 const {c,frame,account}=setup();frame.state.balances[account].poolShares=2n*10n**18n;c.wdIn='1.000000000000000001';let call:any;
 c.rpc={simulateContract:async(args:any)=>{call=args;return {result:1234567n};}};
 assert.equal(c.renderVals().canWd,false);await c.previewWithdrawal();
 assert.equal(call.functionName,'redeem');assert.equal(call.account,account);assert.equal(call.blockNumber,frame.block.number);assert.deepEqual(call.args,[1000000000000000001n,account]);
 assert.equal(c.renderVals().canWd,true);assert.equal(c.renderVals().lend.withdrawFmt,'1.234567');
 c.wdIn='2';assert.equal(c.renderVals().canWd,false);
});
test('withdrawal rejects invalid amounts, excess shares and contract liquidity errors',async()=>{
 const {c,frame,account}=setup();frame.state.balances[account].poolShares=10n**18n;let calls=0;
 c.rpc={simulateContract:async()=>{calls++;throw Error('InsufficientLiquidity');}};
 for(const value of ['', '0','-1','1.0000000000000000001','2']){c.wdIn=value;await c.previewWithdrawal();assert.equal(c.renderVals().canWd,false);}
 assert.equal(calls,0);c.wdIn='1';await c.previewWithdrawal();assert.equal(c.renderVals().canWd,false);assert.match(c.renderVals().wdReason,/liquidity/i);
});
test('stale withdrawal responses cannot survive input, block or wallet changes',async()=>{
 const {c,frame,account}=setup();frame.state.balances[account].poolShares=2n*10n**18n;c.wdIn='1';let resolve!:(v:any)=>void;
 c.rpc={simulateContract:()=>new Promise(r=>resolve=r)};const quote=c.previewWithdrawal();c.wdIn='2';resolve({result:1000000n});await quote;assert.equal(c.renderVals().canWd,false);
 c.rpc={simulateContract:async()=>({result:2000000n})};await c.previewWithdrawal();assert.equal(c.renderVals().canWd,true);
 c.frame={...frame,block:{...frame.block,hash:`0x${'d'.repeat(64)}`}} as any;assert.equal(c.renderVals().canWd,false);
 c.frame=frame;c.wallet!.account=addr('f') as any;assert.equal(c.renderVals().canWd,false);
});
test('buyer explicitly chooses the maximum existing-loan LTV for both post and edit',()=>{
 const {c}=setup();c.prefill();c.set('fShares','5');c.set('fPct','1.7');c.set('fFee','0.01');c.set('fMaxLtv','75');c.set('offerExpiry','110000');
 assert.equal((c as any).offerTerms().maxBorrowerLtvBps,'7500');
 for(const invalid of ['','0','100.01','75.001','-1']){c.set('fMaxLtv',invalid);assert.throws(()=>(c as any).offerTerms());}
});
