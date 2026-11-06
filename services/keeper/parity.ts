/** Canonical read -> reviewed engine bridge. No balances or price authority comes from logs. */
import assert from 'node:assert/strict';
import {fromSnapshot,snapshot as engineSnapshot,type Snapshot} from '../../engine/cli.ts';
import {executionCash,type State} from '../../engine/state.ts';
import type {MarketFacts,Hex,Config} from '../../engine/types.ts';
import {artifact} from './abi.ts';
import {verifyDeployment} from './config.ts';
import {integers,type Deployment} from './types.ts';
export function engineInput(s:any,d:Deployment):Snapshot {
 const actors=Object.keys(s.balances).sort() as Hex[];
 const loans=Object.entries(s.loans).map(([id,p]:[string,any])=>({id:BigInt(id),position:{loan:p.loan,debt:p.debtRecord,remainingShares:p.remainingShares,backing:p.backing,outstandingUnits:p.outstandingUnits,activeCoverDeadline:p.activeCoverDeadline,opensAt:p.opensAt,cutoffAt:p.cutoffAt},debtNow:p.debt}));
 return {loans,receipts:Object.entries(s.receipts).map(([id,r]:[string,any])=>({id:BigInt(id),receipt:r.receipt})),offers:Object.keys(s.offers).sort().map(id=>({id:id as Hex,offer:s.offers[id],termsHash:s.termsHashes[id]})),claims:Object.entries(s.claims).map(([id,claim]:[string,any])=>({id:BigInt(id),claim})),counters:[BigInt(d.chainId),s.coverPolicy.profile,s.coverPolicy.coverOpensBeforeClose,s.coverPolicy.coverCutoffBeforeClose,s.nextLoanId,s.nextReceiptId,s.nextClaimId,s.book.totalLockedCash,s.book.totalPremiumCredits,s.book.totalCashCredits,s.pool.totalSupply,s.pool.totalAssets],components:[d.addresses.pool,d.addresses.book,d.addresses.vault,d.addresses.manager,d.addresses.loanManager],actors,balances:actors.map(a=>{const b=s.balances[a];return [b.cash,b.premiumCredit,b.cashCredit,b.poolShares,b.cashAllowanceLoanManager,b.cashAllowanceBook,b.borrowerNonce];}),stocks:Object.keys(s.stockTokens).sort().map(token=>({token:token as Hex,accounted:s.stockTokens[token].accountedBacking,balances:actors.map(a=>{const b=s.stockTokens[token].balances[a];return [b.balance,b.allowanceVault];})})),activeIds:s.pool.activeLoanIds};
}
export function engineState(s:any,d:Deployment):State {
 const state=fromSnapshot(engineInput(s,d));
 // Only the local MockCash profile is established; public parity uses finite approvals.
 if(d.chainId!=='31337'&&Object.values(s.balances).some((b:any)=>b.cashAllowanceLoanManager===(1n<<256n)-1n||b.cashAllowanceBook===(1n<<256n)-1n))throw Error('public infinite allowance semantics unverified');
 state.cashDecrementsInfiniteAllowance=d.chainId==='31337';return state;
}
export function compareState(predicted:State,observed:any,d:Deployment,now:bigint){const actual=engineInput(observed,d);assert.deepEqual(engineSnapshot(predicted,actual,now),actual,'exact complete engine observation parity');}
export async function marketFacts(client:any,d:Deployment,frame:any,assetId:Hex,version:bigint,offerIds:Hex[]=[]):Promise<MarketFacts>{
 await verifyDeployment(client,d,frame.block);
 const s=frame.state,a=s.assets[assetId];if(!a)throw Error('asset facts not discovered');const c=a.configs[version.toString()];
 const zero=`0x${'0'.repeat(64)}` as Hex,zeroAddress=`0x${'0'.repeat(40)}` as Hex;
 const empty:Config={assetToken:zeroAddress,stockTokenDecimals:0n,cashTokenDecimals:0n,originationLtvBps:0n,targetLtvBps:0n,triggerLtvBps:0n,rateNumerator:0n,rateDenominator:0n,maxFills:0n,maxActiveReceipts:0n,supportedCorporateActions:0n};
 const state=a.state,session=s.sessions[state.activeSessionId]?.fact??{phase:0n,scheduledOpen:0n,scheduledClose:0n,assetId:zero,configHash:zero,scheduledReportHash:zero},action=a.corporateAction;
 const eligible:boolean[]=[];for(const id of offerIds){const o=s.offers[id];if(!o)throw Error('offer facts not discovered');const policy=await client.readContract({address:d.addresses.book,abi:artifact('CommitmentBook').abi,functionName:'eligibilityPolicy',blockNumber:frame.block.number});eligible.push(await client.readContract({address:policy,abi:artifact('MockEligibilityPolicy').abi,functionName:'isEligible',args:[o.terms.assetId,o.buyer,o.terms.policyHash],blockNumber:frame.block.number}));}
 return {configFound:!!c,configAssetId:assetId,configVersion:version,config:c?.config??empty,effectiveAt:c?.effectiveAt??0n,configHash:c?.configHash??zero,tokenDecimals:c?s.stockTokens[c.config.assetToken].decimals:0n,cashDecimals:s.tokens.cash.decimals,bindingsMatch:true,halted:state.halted,phase:session.phase,scheduledOpen:session.scheduledOpen,scheduledClose:session.scheduledClose,sessionAssetId:session.assetId,activeSessionId:state.activeSessionId,sessionConfigHash:session.configHash,stateConfigHash:state.configHash,scheduledReportHash:session.scheduledReportHash,actionHash:state.latestCorporateActionHash,actionN:action.multiplierNumerator,actionD:action.multiplierDenominator,referenceInvalidated:a.referenceCheck.referenceInvalidated,referenceFact:a.latestReference,eligible};
}
/** Conservative public lane: isolate one transaction so parent/end-of-block reads are exact. */
export async function verifyNativeExecution(client:any,d:{chainId:string;addresses:{cash:string}},hash:Hex,caller:Hex,protocolCashDelta:bigint){
 const canonical='0x3600000000000000000000000000000000000000';if(d.chainId!=='5042002'||d.addresses.cash.toLowerCase()!==canonical||await client.getChainId()!==5042002)throw Error('canonical Arc cash identity required');
 const tx=await client.getTransaction({hash}),r=await client.getTransactionReceipt({hash});
 if(!['success','reverted'].includes(r.status)||r.status==='reverted'&&protocolCashDelta!==0n)throw Error('reverted execution has nonzero protocol cash delta');
 if(tx.hash!==hash||r.transactionHash!==hash||tx.from.toLowerCase()!==caller.toLowerCase()||r.from.toLowerCase()!==caller.toLowerCase()||tx.chainId!==5042002||tx.blockHash!==r.blockHash||tx.blockNumber!==r.blockNumber)throw Error('execution identity mismatch');
 const block=await client.getBlock({blockNumber:r.blockNumber}),parent=await client.getBlock({blockNumber:r.blockNumber-1n});
 if(block.hash!==r.blockHash||block.parentHash!==parent.hash||parent.number+1n!==block.number)throw Error('execution canonical provenance mismatch');
 if(block.transactions.length!==1||String(block.transactions[0]?.hash??block.transactions[0])!==hash||r.transactionIndex!==0||tx.transactionIndex!==0)throw Error('cannot isolate intermediate transaction mutations');
 const gasUsed=r.gasUsed,price=r.effectiveGasPrice;if(typeof gasUsed!=='bigint'||typeof price!=='bigint'||gasUsed<0n||price<0n||gasUsed>tx.gas)throw Error('invalid receipt gas');
 const expectedPrice=tx.maxFeePerGas!==undefined?(tx.maxFeePerGas<(block.baseFeePerGas+tx.maxPriorityFeePerGas)?tx.maxFeePerGas:block.baseFeePerGas+tx.maxPriorityFeePerGas):tx.gasPrice;
 if(expectedPrice!==price)throw Error('receipt gas price mismatch');
 const readCash=(n:bigint)=>client.readContract({address:d.addresses.cash,abi:artifact('MockCashToken').abi,functionName:'balanceOf',args:[caller],blockNumber:n});
 const [preNative,preCash,afterNative,afterCash]=await Promise.all([client.getBalance({address:caller,blockNumber:parent.number}),readCash(parent.number),client.getBalance({address:caller,blockNumber:block.number}),readCash(block.number)]);
 const result=executionCash(preNative,preCash,protocolCashDelta,gasUsed*price);if(result.native!==afterNative||result.cash!==afterCash||afterNative/1000000000000n!==afterCash)throw Error('execution native/cash provenance mismatch');
 if((await client.getBlock({blockNumber:parent.number})).hash!==parent.hash||(await client.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('execution block replaced');
 return {...result,gasCost:gasUsed*price,gasUsed,effectiveGasPrice:price,preNative,preCash,afterNative,afterCash,parent,block};
}
