import { MAX_UINT, MAX_SHARES, ZERO, ZERO_ADDRESS } from './params.ts';
import { min, mulDivDown, checked } from './math.ts';
import { debt } from './interest.ts';
import { convertedUnits } from './claims.ts';
import { exercise, requireOfferStatus } from './offers.ts';
import { isAtOrBelowTarget, planNormal } from './settle.ts';
import { fail, type Hex, type Receipt, type Offer, type DebtRecord, type Claim, type SolidityError } from './types.ts';
export interface State {
  receiptId: bigint; receipt: Receipt; debt: DebtRecord; offers: Offer[]; claims: Claim[]; firstClaimId: bigint; nextClaimId: bigint;
  remainingShares: bigint; backing: bigint; accountedBacking: bigint; outstandingUnits: bigint;
  totalLockedCash: bigint; totalPremiumCredits: bigint; totalCashCredits: bigint;
  premiumCredits: Record<Hex,bigint>; cashCredits: Record<Hex,bigint>; cashBalances: Record<Hex,bigint>; stockBalances: Record<Hex,bigint>;
  pool: Hex; book: Hex; vault: Hex; activeReceiptIds: bigint[];
  cashAllowanceManager: Record<Hex,bigint>; stockAllowanceVault: Record<Hex,bigint>; cashDecrementsInfiniteAllowance: boolean;
}
export interface Benchmark { finalized: boolean; assetId: Hex; sessionId: Hex; configHash: Hex; price: bigint; multiplierNumerator: bigint; multiplierDenominator: bigint; reportHash: Hex }
export interface Action { kind: 'repay'|'addCollateral'|'withdrawCollateral'|'settle'|'terminal'|'topUp'|'finalize'|'withdrawClaim'|'withdrawPremium'|'withdrawCredit'; now: bigint; caller: Hex; amount?: bigint; claimId?: bigint; to?: Hex; benchmark?: Benchmark; stockFailure?: SolidityError; cashFailure?: SolidityError }
const balance = (map: Record<Hex,bigint>, who: Hex) => map[who] ?? 0n;
function credit(map: Record<Hex,bigint>, who: Hex, amount: bigint): void { map[who] = checked(balance(map,who) + amount); }
function transfer(map: Record<Hex,bigint>, from: Hex, to: Hex, amount: bigint, failure?: SolidityError): void {
  if (to === ZERO_ADDRESS) fail('ZeroAddress');
  if (from === to) fail('InvalidTokenBalanceDelta', amount, 0n);
  if (failure) throw failure;
  const available = balance(map,from); if (available < amount) fail('ERC20InsufficientBalance',from,available,amount);
  map[from] = available - amount; credit(map,to,amount);
}
export function initialState(id: bigint, receipt: Receipt, offers: Offer[], pool: Hex, book: Hex, vault: Hex): State {
  const q = receipt.consent, c = receipt.config;
  const state: State = { cashAllowanceManager:{},stockAllowanceVault:{},cashDecrementsInfiniteAllowance:false,receiptId:id, receipt:structuredClone(receipt), debt:{ terms:{ borrower:q.borrower,assetId:q.assetId,assetToken:c.assetToken,originalPrincipal:q.principal,rateNumerator:c.rateNumerator,rateDenominator:c.rateDenominator,startTime:receipt.startTime,settlementDeadline:receipt.settlementDeadline,snapshotCollateral:q.collateralShares,snapshotMultiplierNumerator:q.snapshotMultiplierNumerator,snapshotMultiplierDenominator:q.snapshotMultiplierDenominator },cumulativeDebtReduction:0n,closed:false },offers:structuredClone(offers),claims:[],firstClaimId:1n,nextClaimId:1n,remainingShares:q.collateralShares,backing:q.collateralShares,accountedBacking:q.collateralShares,outstandingUnits:0n,totalLockedCash:0n,totalPremiumCredits:0n,totalCashCredits:0n,premiumCredits:{},cashCredits:{},cashBalances:{},stockBalances:{},pool,book,vault,activeReceiptIds:[id] };
  for (const offer of offers) { state.totalLockedCash += offer.cashCapacity; state.totalPremiumCredits += offer.terms.premium; credit(state.premiumCredits,offer.buyer,offer.terms.premium); }
  state.cashBalances[book]=state.totalLockedCash+state.totalPremiumCredits;state.stockBalances[vault]=q.collateralShares;
  return state;
}
export function debtOf(s: State, now: bigint): bigint { const t=s.debt.terms; return s.debt.closed ? 0n : debt(t.originalPrincipal,t.rateNumerator,t.startTime,t.settlementDeadline,min(now,t.settlementDeadline),t.rateDenominator,s.debt.cumulativeDebtReduction); }
function reduce(s: State, amount: bigint, now: bigint): void { const due=debtOf(s,now); if (s.debt.closed || amount===0n || amount>due) fail('InvalidDebtApplied'); s.debt.cumulativeDebtReduction+=amount;if(amount===due)s.debt.closed=true; }
function units(s: State, shares: bigint): bigint { const t=s.debt.terms,r=s.receipt;return convertedUnits(shares,t.snapshotMultiplierNumerator,t.snapshotMultiplierDenominator,r.latestMultiplierNumerator,r.latestMultiplierDenominator); }
function claim(s: State, owner: Hex, shares: bigint, now: bigint): void {
  if(owner===ZERO_ADDRESS)fail('ZeroAddress');if(shares===0n||shares>s.remainingShares)fail('InvalidExerciseShares');
  const r=s.receipt,delivery=units(s,shares);
  s.claims.push({owner,receiptId:s.receiptId,snapshotShares:shares,reportMultiplierNumerator:r.latestMultiplierNumerator,reportMultiplierDenominator:r.latestMultiplierDenominator,maturesAt:min(now,r.settlementDeadline),withdrawn:false,deliveryUnits:delivery});
  s.nextClaimId+=1n;s.remainingShares-=shares;s.outstandingUnits=checked(s.outstandingUnits+delivery);
}
function close(s: State, now: bigint): void {
  for(const o of s.offers){requireOfferStatus(o,2n);const unused=o.cashCapacity-o.cumulativeCashCharged;o.status=3n;s.totalLockedCash-=unused;s.totalCashCredits+=unused;credit(s.cashCredits,o.buyer,unused);}
  s.activeReceiptIds=s.activeReceiptIds.filter(id=>id!==s.receiptId);
  if(s.remainingShares!==0n)claim(s,s.receipt.consent.borrower,s.remainingShares,now);
  s.receipt.status=2n;
}
function debitBacking(s: State, amount: bigint): void { if(amount>s.backing||amount>balance(s.stockBalances,s.vault))fail('InsufficientBacking');s.backing-=amount;s.accountedBacking-=amount; }
/** Pure transaction boundary: errors never publish a partly modified state. Token failures are explicit snapshot inputs. */
export function transition(input: State, a: Action): State {
  const s=structuredClone(input),r=s.receipt,amount=a.amount??0n;
  if(a.kind==='withdrawPremium'||a.kind==='withdrawCredit'){
    const to=a.to??a.caller;if(to===ZERO_ADDRESS)fail('ZeroAddress');const map=a.kind==='withdrawPremium'?s.premiumCredits:s.cashCredits,available=balance(map,a.caller);
    if(amount===0n||amount>available)fail('InsufficientCredit');map[a.caller]=available-amount;
    if(a.kind==='withdrawPremium')s.totalPremiumCredits-=amount;else s.totalCashCredits-=amount;
    transfer(s.cashBalances,s.book,to,amount,a.cashFailure);return s;
  }
  if(a.kind==='withdrawClaim'){
    const c=s.claims.find((_,i)=>s.firstClaimId+BigInt(i)===a.claimId);
    if(!c||c.owner!==a.caller||c.withdrawn)fail('InvalidClaim');if(a.now<c.maturesAt)fail('ClaimNotMature');if(c.deliveryUnits===0n)fail('ZeroDelivery');
    c.withdrawn=true;s.outstandingUnits-=c.deliveryUnits;debitBacking(s,c.deliveryUnits);transfer(s.stockBalances,s.vault,a.to??a.caller,c.deliveryUnits,a.stockFailure);return s;
  }
  if(r.status===0n)fail('InvalidReceiptId');
  if(a.kind==='topUp'){
    if(r.status===3n)fail('ReceiptNotPending');if(a.caller===ZERO_ADDRESS)fail('ZeroAddress');if(amount===0n)fail('ZeroDelivery');
    s.backing=checked(s.backing+amount);s.accountedBacking=checked(s.accountedBacking+amount);transfer(s.stockBalances,a.caller,s.vault,amount,a.stockFailure);return s;
  }
  if(a.kind==='finalize'){
    if(r.status!==2n)fail('ReceiptNotPending');if(s.outstandingUnits!==0n)fail('HandoffIncomplete');
    if(!s.debt.closed||s.remainingShares!==0n)fail('HandoffIncomplete');const surplus=s.backing;
    if(surplus!==0n){debitBacking(s,surplus);transfer(s.stockBalances,s.vault,r.consent.borrower,surplus,a.stockFailure);}r.status=3n;return s;
  }
  if(r.status!==1n)fail('ReceiptNotActive');
  if(a.kind==='repay'){
    const due=debtOf(s,a.now);if(amount===0n||amount>due)fail('InvalidDebtApplied');
    const approved=s.cashAllowanceManager[a.caller];
    if(approved!==undefined&&(approved!==MAX_UINT||s.cashDecrementsInfiniteAllowance))s.cashAllowanceManager[a.caller]=checked(approved-amount);
    transfer(s.cashBalances,a.caller,s.pool,amount,a.cashFailure);reduce(s,amount,a.now);if(amount===due)close(s,a.now);return s;
  }
  if(a.kind==='addCollateral'){
    if(s.debt.closed)fail('InvalidDebtApplied');if(a.caller===ZERO_ADDRESS)fail('ZeroAddress');const remaining=checked(s.remainingShares+amount);if(remaining>MAX_SHARES)fail('UnsupportedShareAmount');const delivery=units(s,amount);if(delivery===0n)fail('ZeroDelivery');
    s.remainingShares=remaining;s.backing=checked(s.backing+delivery);s.accountedBacking=checked(s.accountedBacking+delivery);transfer(s.stockBalances,a.caller,s.vault,delivery,a.stockFailure);return s;
  }
  if(a.kind==='withdrawCollateral'){
    if(a.caller!==r.consent.borrower)fail('InvalidBorrower');if(a.now>=r.settlementDeadline)fail('SettlementDeadlineReached');if(amount===0n||amount>s.remainingShares)fail('InvalidExerciseShares');
    const remaining=s.remainingShares-amount,reserved=s.offers.reduce((sum,o)=>sum+o.terms.snapshotShares-o.cumulativeExercisedShares,0n);if(remaining<reserved)fail('ReservedCollateral');
    const p=r.benchmarkReportHash===ZERO?r.consent.referencePrice:r.benchmarkValuePerSnapshotShare;if(!isAtOrBelowTarget(debtOf(s,a.now),remaining,p,r.config.originationLtvBps))fail('BorrowerLtvTooHigh');
    const delivery=units(s,amount);if(delivery===0n)fail('ZeroDelivery');if(delivery>s.backing||s.outstandingUnits>s.backing-delivery)fail('InsufficientBacking');s.remainingShares=remaining;debitBacking(s,delivery);transfer(s.stockBalances,s.vault,a.caller,delivery,a.stockFailure);return s;
  }
  let p=0n;
  if(a.kind==='terminal'){if(a.now<r.settlementDeadline)fail('SettlementDeadlineNotReached');}
  else if(a.kind==='settle'){
    if(a.now>=r.settlementDeadline)fail('SettlementDeadlineReached');if(r.benchmarkReportHash!==ZERO)fail('BenchmarkAlreadyProcessed');const b=a.benchmark;
    if(!b?.finalized)fail('BenchmarkUnavailable');if(b.assetId!==r.consent.assetId||b.sessionId!==r.consent.sessionId||b.configHash!==r.consent.configHash||b.reportHash===ZERO)fail('BenchmarkIdentityMismatch');
    p=mulDivDown(b.price,b.multiplierNumerator*r.consent.snapshotMultiplierDenominator,b.multiplierDenominator*r.consent.snapshotMultiplierNumerator);
    r.benchmarkReportHash=b.reportHash;r.benchmarkValuePerSnapshotShare=p;r.latestMultiplierNumerator=b.multiplierNumerator;r.latestMultiplierDenominator=b.multiplierDenominator;
  }else throw new TypeError('unknown action');
  const plan=planNormal(debtOf(s,a.now),s.remainingShares,p,r.config.triggerLtvBps,r.config.targetLtvBps,s.offers.map(o=>({strike:o.terms.strike,totalShares:o.terms.snapshotShares,exercisedShares:o.cumulativeExercisedShares})));
  for(const [i,fill]of plan.fills.entries()){
    if(fill.additionalShares===0n)continue;const o=s.offers[i]!,result=exercise(o,o.cumulativeExercisedShares+fill.additionalShares,fill.debtApplied,r.consent.borrower);s.offers[i]=result.offer;
    s.totalLockedCash-=result.charged;s.totalCashCredits+=result.excess;credit(s.cashCredits,r.consent.borrower,result.excess);transfer(s.cashBalances,s.book,s.pool,fill.debtApplied,a.cashFailure);reduce(s,fill.debtApplied,a.now);claim(s,o.buyer,fill.additionalShares,a.now);
  }
  if(plan.debtAfter===0n)close(s,a.now);return s;
}
