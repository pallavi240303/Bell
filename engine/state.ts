/** Deterministic non-authoritative transaction model. Every loan, receipt, lot and claim has its own identity. */
import { MAX_UINT, MAX_SHARES, MAX_CASH, MAX_TIME, MAX_MULTIPLIER_COMPONENT, MAX_DELIVERY_UNITS_PER_SHARE, ZERO, ZERO_ADDRESS } from './params.ts';
import { checked, mulDivUp } from './math.ts';
import { interestWide } from './interest.ts';
import { convertedUnits } from './claims.ts';
import { exercise, requireOfferStatus, validateReservation } from './offers.ts';
import { planNormal } from './settle.ts';
import { positionDebt, projectedDebt, requireReference, loanPrice, debtLimit, validateCover, liquidationPlan } from './receipt.ts';
import { fail, fixed, uint, SolidityError, type Hex, type Receipt, type Offer, type Claim, type Position, type MarketFacts, type BorrowRequest, type Quote } from './types.ts';
export interface State {
 chainId:bigint; manager:Hex; loanManager:Hex; pool:Hex; book:Hex; vault:Hex; profile:bigint; opensOffset:bigint; cutoffOffset:bigint;
 loans:Record<string,Position>; receipts:Record<string,Receipt>; loanOfReceipt:Record<string,bigint>; offers:Record<Hex,Offer>; termsHashes:Record<Hex,Hex>; claims:Record<string,Claim>;
 nextLoanId:bigint;nextReceiptId:bigint;nextClaimId:bigint;borrowerNonces:Record<Hex,bigint>;activeLoanIds:bigint[];
 totalLockedCash:bigint;totalPremiumCredits:bigint;totalCashCredits:bigint;poolSupply:bigint;poolShares:Record<Hex,bigint>;
 premiumCredits:Record<Hex,bigint>;cashCredits:Record<Hex,bigint>;cashBalances:Record<Hex,bigint>;
 stockBalances:Record<Hex,Record<Hex,bigint>>;accountedBacking:Record<Hex,bigint>;stockAllowanceVault:Record<Hex,Record<Hex,bigint>>;
 cashAllowanceLoanManager:Record<Hex,bigint>;cashAllowanceBook:Record<Hex,bigint>;cashDecrementsInfiniteAllowance:boolean;
}
export interface Benchmark {finalized:boolean;assetId:Hex;sessionId:Hex;configHash:Hex;price:bigint;multiplierNumerator:bigint;multiplierDenominator:bigint;reportHash:Hex;observedAt?:bigint;primarySourceHash?:Hex;secondarySourceHash?:Hex}
export const ACTION_KINDS=['repay','addCollateral','withdrawCollateral','settle','terminal','topUp','finalize','withdrawClaim','withdrawPremium','withdrawCredit','borrow','buyCover','liquidate'] as const;
export interface Action {kind:typeof ACTION_KINDS[number];now:bigint;caller:Hex;loanId?:bigint;receiptId?:bigint;amount?:bigint;claimId?:bigint;to?:Hex;benchmark?:Benchmark;market?:MarketFacts;request?:BorrowRequest;quote?:Quote;offerIds?:Hex[];termsHashes?:Hex[];expectedHash?:Hex;stockFailure?:SolidityError;cashFailure?:SolidityError;poolNavCallback?:boolean}
export function initialState(chainId:bigint,manager:Hex,loanManager:Hex,pool:Hex,book:Hex,vault:Hex,profile=1n):State {
 uint(chainId);for(const a of [manager,loanManager,pool,book,vault])fixed(a,20n);
 return {chainId,manager,loanManager,pool,book,vault,profile,opensOffset:profile===0n?7200n:600n,cutoffOffset:profile===0n?1800n:60n,loans:{},receipts:{},loanOfReceipt:{},offers:{},termsHashes:{},claims:{},nextLoanId:1n,nextReceiptId:1n,nextClaimId:1n,borrowerNonces:{},activeLoanIds:[],totalLockedCash:0n,totalPremiumCredits:0n,totalCashCredits:0n,poolSupply:0n,poolShares:{},premiumCredits:{},cashCredits:{},cashBalances:{},stockBalances:{},accountedBacking:{},stockAllowanceVault:{},cashAllowanceLoanManager:{},cashAllowanceBook:{},cashDecrementsInfiniteAllowance:true};
}
const bal=(map:Record<string,bigint>,who:string)=>map[who]??0n;
const credit=(map:Record<string,bigint>,who:string,amount:bigint)=>{map[who]=checked(bal(map,who)+amount);};
function position(s:State,id:bigint,active=false):Position {const p=s.loans[id.toString()];if(!p||p.loan.status===0n)fail('InvalidReceiptId');if(active&&p.loan.status!==1n)fail('LoanNotActive');return p;}
export function debtOf(s:State,id:bigint,now:bigint):bigint {uint(now);return positionDebt(position(s,id),now);}
export function totalAssets(s:State,now:bigint):bigint {return s.activeLoanIds.reduce((v,id)=>checked(v+debtOf(s,id,now)),bal(s.cashBalances,s.pool));}
function market(a:Action):MarketFacts {if(!a.market)throw new TypeError('missing authenticated market facts');return a.market;}
function tokenBalances(s:State,token:Hex):Record<Hex,bigint>{return s.stockBalances[token]??(s.stockBalances[token]={});}
function tokenAllowances(s:State,token:Hex):Record<Hex,bigint>{return s.stockAllowanceVault[token]??(s.stockAllowanceVault[token]={});}
function stockTransfer(s:State,token:Hex,from:Hex,to:Hex,amount:bigint,failure?:SolidityError):void {
 if(to===ZERO_ADDRESS)fail('ZeroAddress');if(from===to)fail('InvalidTokenBalanceDelta',amount,0n);if(failure)throw failure;
 const balances=tokenBalances(s,token),available=bal(balances,from);if(available<amount)fail('ERC20InsufficientBalance',from,available,amount);
 balances[from]=available-amount;credit(balances,to,amount);
}
function stockPull(s:State,token:Hex,from:Hex,amount:bigint,a:Action):void {
 if(from===s.vault)fail('InvalidTokenBalanceDelta',amount,0n);const allowances=tokenAllowances(s,token),approved=bal(allowances,from);
 if(approved!==MAX_UINT){if(approved<amount)fail('ERC20InsufficientAllowance',s.vault,approved,amount);allowances[from]=approved-amount;}
 stockTransfer(s,token,from,s.vault,amount,a.stockFailure);
}
function cashMove(s:State,from:Hex,to:Hex,amount:bigint,a:Action,guarded:boolean,pull?:Record<Hex,bigint>):void {
 if(to===ZERO_ADDRESS)fail('ZeroAddress');if(from===to)fail('InvalidTokenBalanceDelta',amount,0n);
 if(pull){const approved=bal(pull,from);if(approved<amount)fail('Error','allowance');if(approved!==MAX_UINT||s.cashDecrementsInfiniteAllowance)pull[from]=approved-amount;}
 if(bal(s.cashBalances,from)<amount)fail('Error','balance');
 s.cashBalances[from]=bal(s.cashBalances,from)-amount;credit(s.cashBalances,to,amount);if(a.cashFailure)throw a.cashFailure;
 // A real pool NAV callback only encounters the shared guard when it reads a live loan.
 // Standalone book withdrawals have no LoanManager transition in progress.
 if(a.poolNavCallback){if(guarded&&s.activeLoanIds.length!==0)fail('CashDebtTransition');totalAssets(s,a.now);}
}
function reduce(p:Position,amount:bigint,now:bigint):void {const due=positionDebt(p,now);if(p.debt.closed||amount===0n||amount>due)fail('InvalidDebtApplied');p.debt.cumulativeDebtReduction=checked(p.debt.cumulativeDebtReduction+amount);if(amount===due)p.debt.closed=true;}
function supportedMultiplier(n:bigint,d:bigint):void {if(n===0n||d===0n||n>MAX_MULTIPLIER_COMPONENT||d>MAX_MULTIPLIER_COMPONENT)fail('InvalidMultiplier');}
function units(p:Position,shares:bigint,n:bigint,d:bigint):bigint {const t=p.debt.terms;return convertedUnits(shares,t.snapshotMultiplierNumerator,t.snapshotMultiplierDenominator,n,d);}
function multipliers(a:Action):[bigint,bigint] {const m=market(a);return m.actionHash===ZERO?[1n,1n]:[m.actionN,m.actionD];}
function recordClaim(s:State,id:bigint,owner:Hex,shares:bigint,n:bigint,d:bigint,now:bigint):void {
 if(owner===ZERO_ADDRESS)fail('ZeroAddress');const p=position(s,id),delivery=units(p,shares,n,d);
 if(shares>p.remainingShares)fail('InvalidExerciseShares');p.remainingShares-=shares;
 if(delivery===0n)return; // unpaid rounding dust only; paid fills check beforehand
 if(now>MAX_TIME)fail('InvalidTimeRange');supportedMultiplier(n,d);
 s.claims[s.nextClaimId.toString()]={owner,receiptId:id,snapshotShares:shares,reportMultiplierNumerator:n,reportMultiplierDenominator:d,maturesAt:now,withdrawn:false,deliveryUnits:delivery};s.nextClaimId++;p.outstandingUnits=checked(p.outstandingUnits+delivery);
}
function endReceipt(s:State,id:bigint):void {
 const r=s.receipts[id.toString()];if(!r)fail('InvalidReceiptId');if(r.status!==1n)fail('ReceiptNotActive');
 for(const key of r.offerIds){const o=s.offers[key]!;requireOfferStatus(o,2n);const unused=o.cashCapacity-o.cumulativeCashCharged;o.status=3n;s.totalLockedCash-=unused;s.totalCashCredits=checked(s.totalCashCredits+unused);credit(s.cashCredits,o.buyer,unused);}r.status=2n;
}
function detach(s:State,p:Position):void {if(p.loan.activeCoverId!==0n){endReceipt(s,p.loan.activeCoverId);p.loan.activeCoverId=0n;p.activeCoverDeadline=0n;p.opensAt=0n;p.cutoffAt=0n;}}
function close(s:State,id:bigint,n:bigint,d:bigint,now:bigint):void {
 const p=position(s,id);const i=s.activeLoanIds.indexOf(id);if(i<0)fail('InvalidReceiptId');if(positionDebt(p,now)!==0n)fail('DebtNotClosed');
 s.activeLoanIds[i]=s.activeLoanIds[s.activeLoanIds.length-1]!;s.activeLoanIds.pop();
 if(p.remainingShares!==0n)recordClaim(s,id,p.loan.borrower,p.remainingShares,n,d,now);p.loan.status=2n;
}
function debitBacking(s:State,p:Position,amount:bigint):void {const token=p.debt.terms.assetToken;if(amount>p.backing||amount>bal(tokenBalances(s,token),s.vault))fail('InsufficientBacking');p.backing-=amount;s.accountedBacking[token]=bal(s.accountedBacking,token)-amount;}
function validate(a:Action):void {
 if(!ACTION_KINDS.includes(a.kind))throw new TypeError('unknown action');uint(a.now);fixed(a.caller,20n);
 for(const v of [a.amount,a.loanId,a.receiptId,a.claimId])if(v!==undefined)uint(v);if(a.to!==undefined)fixed(a.to,20n);if(a.poolNavCallback!==undefined&&typeof a.poolNavCallback!=='boolean')throw new TypeError('invalid callback flag');
 if(a.benchmark){const b=a.benchmark;if(typeof b.finalized!=='boolean')throw new TypeError('invalid bool');for(const h of [b.assetId,b.sessionId,b.configHash,b.reportHash])fixed(h,32n);uint(b.price);uint(b.multiplierNumerator,128n);uint(b.multiplierDenominator,128n);}
 for(const e of [a.stockFailure,a.cashFailure])if(e!==undefined&&!(e instanceof SolidityError))throw new TypeError('invalid token failure');
}
/** Atomic boundary. No partially-mutated object escapes on failure. */
export function transition(input:State,a:Action):State {
 validate(a);const s=structuredClone(input),id=a.loanId??0n,amount=a.amount??0n;
 if(a.kind==='withdrawPremium'||a.kind==='withdrawCredit'){
  const to=a.to??a.caller;if(to===ZERO_ADDRESS)fail('ZeroAddress');const map=a.kind==='withdrawPremium'?s.premiumCredits:s.cashCredits;if(amount===0n||amount>bal(map,a.caller))fail('InsufficientCredit');map[a.caller]=bal(map,a.caller)-amount;
  if(a.kind==='withdrawPremium')s.totalPremiumCredits-=amount;else s.totalCashCredits-=amount;cashMove(s,s.book,to,amount,a,false);return s;
 }
 if(a.kind==='withdrawClaim'){
  const c=s.claims[(a.claimId??0n).toString()];if(!c||c.owner!==a.caller||c.withdrawn)fail('InvalidClaim');if(a.now<c.maturesAt)fail('ClaimNotMature');if(c.deliveryUnits===0n)fail('ZeroDelivery');
  const p=position(s,c.receiptId);c.withdrawn=true;p.outstandingUnits-=c.deliveryUnits;debitBacking(s,p,c.deliveryUnits);stockTransfer(s,p.debt.terms.assetToken,s.vault,a.to??a.caller,c.deliveryUnits,a.stockFailure);return s;
 }
 if(a.kind==='borrow'){
  const q=a.request;if(!q)throw new TypeError('missing borrow request');const m=market(a),c=m.config;
  if(!m.bindingsMatch)fail('ComponentMismatch');if(q.recipient===ZERO_ADDRESS)fail('ZeroAddress');if(a.now>q.expiry)fail('RequestExpired');if(!m.configFound||m.configAssetId!==q.assetId||m.configVersion!==q.configVersion)fail('UnknownConfig',q.assetId,q.configVersion);if(m.effectiveAt>a.now)fail('ConfigNotEffective');if(m.configHash!==q.configHash)fail('ReferenceFactsMismatch');
  if(c.stockTokenDecimals!==18n||m.tokenDecimals!==18n||c.cashTokenDecimals!==m.cashDecimals)fail('InvalidDecimals',m.tokenDecimals,c.cashTokenDecimals);
  const r=requireReference(q.assetId,m,a.now);if(r.configHash!==m.configHash||r.reportHash!==q.referenceReportHash)fail('ReferenceFactsMismatch');
  if(q.principal===0n||q.principal>MAX_CASH)fail('UnsupportedCashAmount');if(q.collateralShares===0n||q.collateralShares>MAX_SHARES)fail('UnsupportedShareAmount');if(q.principal>debtLimit(q.collateralShares,r.price,c.originationLtvBps))fail('BorrowerLtvTooHigh');if(q.principal>bal(s.cashBalances,s.pool))fail('InsufficientLiquidity');if(a.now>MAX_TIME)fail('InvalidTimeRange');
  const newId=s.nextLoanId++;if(a.caller===ZERO_ADDRESS||c.assetToken===ZERO_ADDRESS)fail('ZeroAddress');if(q.assetId===ZERO)fail('ZeroAssetId');supportedMultiplier(r.multiplierNumerator,r.multiplierDenominator);interestWide(q.principal,c.rateNumerator,0n,c.rateDenominator);
  s.loans[newId.toString()]={loan:{borrower:a.caller,recipient:q.recipient,assetId:q.assetId,configVersion:q.configVersion,configHash:m.configHash,config:structuredClone(c),status:1n,activeCoverId:0n,lastCoveredSessionId:ZERO},debt:{terms:{borrower:a.caller,assetId:q.assetId,assetToken:c.assetToken,originalPrincipal:q.principal,rateNumerator:c.rateNumerator,rateDenominator:c.rateDenominator,startTime:a.now,settlementDeadline:0n,snapshotCollateral:q.collateralShares,snapshotMultiplierNumerator:r.multiplierNumerator,snapshotMultiplierDenominator:r.multiplierDenominator},cumulativeDebtReduction:0n,closed:false},remainingShares:q.collateralShares,backing:q.collateralShares,outstandingUnits:0n,activeCoverDeadline:0n,opensAt:0n,cutoffAt:0n};
  credit(s.accountedBacking,c.assetToken,q.collateralShares);stockPull(s,c.assetToken,a.caller,q.collateralShares,a);if(s.activeLoanIds.length===32)fail('ActiveReceiptLimit');s.activeLoanIds.push(newId);cashMove(s,s.pool,q.recipient,q.principal,a,true);return s;
 }
 if(a.kind==='buyCover'){
  const q=a.quote;if(!q||!a.offerIds||!a.termsHashes||!a.expectedHash)throw new TypeError('incomplete cover consent');
  // Missing loans are checked at the contract's coverSnapshot stage, after quote/reference/offers.
  const empty=emptyPosition(market(a));const p=s.loans[id.toString()]??empty,m=market(a),receiptId=s.nextReceiptId;
  const offers=a.offerIds.map(key=>s.offers[key]??emptyOffer());
  const r=validateCover(q,a.offerIds,a.termsHashes,offers,a.offerIds.map(key=>s.termsHashes[key]??ZERO),a.now,{caller:a.caller,borrowerNonce:bal(s.borrowerNonces,a.caller),chainId:s.chainId,manager:s.manager,expectedHash:a.expectedHash,profile:s.profile,opensOffset:s.opensOffset,cutoffOffset:s.cutoffOffset,loanId:id,receiptId,position:p,market:m});
  if(receiptId===0n||p.loan.activeCoverId!==0n||s.loanOfReceipt[receiptId.toString()]!==undefined||q.sessionId===p.loan.lastCoveredSessionId)fail('InvalidCover');
  const ref=requireReference(p.loan.assetId,m,a.now);if(ref.sessionId!==q.sessionId)fail('InvalidCover');if(positionDebt(p,a.now)===0n)fail('InvalidCover');
  if(positionDebt(p,a.now)>debtLimit(p.remainingShares,loanPrice(p,ref),p.loan.config.triggerLtvBps))fail('BorrowerLtvTooHigh');
  s.nextReceiptId++;credit(s.borrowerNonces,a.caller,1n);s.receipts[receiptId.toString()]=r;s.loanOfReceipt[receiptId.toString()]=id;p.loan.activeCoverId=receiptId;p.loan.lastCoveredSessionId=q.sessionId;p.activeCoverDeadline=r.settlementDeadline;p.opensAt=r.opensAt;p.cutoffAt=r.cutoffAt;
  const ltv=mulDivUp(r.debtAtAcceptance,10000n*10n**18n,q.collateralShares*q.referencePrice);
  for(const [i,key]of r.offerIds.entries()){
   const o=s.offers[key]!;validateReservation(o,s.termsHashes[key]===r.offerTermsHashes[i],receiptId,a.caller,r.settlementDeadline,q.referencePrice,ltv,a.now,m.eligible[i]??false);o.status=2n;o.receiptId=receiptId;
   if(o.terms.premium!==0n){credit(s.premiumCredits,o.buyer,o.terms.premium);s.totalPremiumCredits=checked(s.totalPremiumCredits+o.terms.premium);cashMove(s,a.caller,s.book,o.terms.premium,a,true,s.cashAllowanceBook);}
  }return s;
 }
 if(a.kind==='settle'||a.kind==='terminal'){
  const receiptId=a.receiptId??0n,r=s.receipts[receiptId.toString()];if(!r||r.status===0n)fail('InvalidReceiptId');if(r.status!==1n)fail('ReceiptNotActive');
  let price=0n;
  if(a.kind==='terminal'){if(a.now<r.settlementDeadline)fail('SettlementDeadlineNotReached');[r.latestMultiplierNumerator,r.latestMultiplierDenominator]=multipliers(a);}
  else {if(a.now>=r.settlementDeadline)fail('SettlementDeadlineReached');if(r.benchmarkReportHash!==ZERO)fail('BenchmarkAlreadyProcessed');const b=a.benchmark;if(!b?.finalized)fail('BenchmarkUnavailable');if(b.assetId!==r.consent.assetId||b.sessionId!==r.consent.sessionId||b.configHash!==r.consent.configHash||b.reportHash===ZERO)fail('BenchmarkIdentityMismatch');
   price=loanPrice(position(s,r.loanId),{...market(a).referenceFact,price:b.price,multiplierNumerator:b.multiplierNumerator,multiplierDenominator:b.multiplierDenominator});r.benchmarkReportHash=b.reportHash;r.benchmarkValuePerSnapshotShare=price;r.latestMultiplierNumerator=b.multiplierNumerator;r.latestMultiplierDenominator=b.multiplierDenominator;
  }
  const p=position(s,r.loanId),plan=planNormal(positionDebt(p,a.now),p.remainingShares,price,r.config.triggerLtvBps,r.config.targetLtvBps,r.offerIds.map(key=>{const o=s.offers[key]!;return {strike:o.terms.strike,totalShares:o.terms.snapshotShares,exercisedShares:o.cumulativeExercisedShares};}));
  if(p.loan.status!==1n)fail('LoanNotActive');if(p.loan.activeCoverId!==receiptId||s.loanOfReceipt[receiptId.toString()]!==r.loanId)fail('InvalidCover');
  for(const [i,fill]of plan.fills.entries()){
   if(fill.additionalShares===0n)continue;const key=r.offerIds[i]!,o=s.offers[key]!,result=exercise(o,o.cumulativeExercisedShares+fill.additionalShares,fill.debtApplied,r.consent.borrower);s.offers[key]=result.offer;s.totalLockedCash-=result.charged;s.totalCashCredits=checked(s.totalCashCredits+result.excess);credit(s.cashCredits,r.consent.borrower,result.excess);cashMove(s,s.book,s.pool,fill.debtApplied,a,true);
   if(units(p,fill.additionalShares,r.latestMultiplierNumerator,r.latestMultiplierDenominator)===0n)fail('ZeroDelivery');reduce(p,fill.debtApplied,a.now);recordClaim(s,r.loanId,o.buyer,fill.additionalShares,r.latestMultiplierNumerator,r.latestMultiplierDenominator,a.now);
  }
  const due=positionDebt(p,a.now);endReceipt(s,receiptId);if(r.latestMultiplierNumerator===0n||r.latestMultiplierDenominator===0n)fail('InvalidMultiplier');if(a.kind==='terminal'&&due!==0n)fail('InvalidCover');p.loan.activeCoverId=0n;p.activeCoverDeadline=0n;p.opensAt=0n;p.cutoffAt=0n;if(due===0n)close(s,r.loanId,r.latestMultiplierNumerator,r.latestMultiplierDenominator,a.now);return s;
 }
 const p=position(s,id),token=p.debt.terms.assetToken;
 if(a.kind==='topUp'){
  if(p.loan.status===3n)fail('LoanNotPending');if(a.caller===ZERO_ADDRESS)fail('ZeroAddress');if(amount===0n)fail('ZeroDelivery');p.backing=checked(p.backing+amount);credit(s.accountedBacking,token,amount);stockPull(s,token,a.caller,amount,a);return s;
 }
 if(a.kind==='finalize'){
  if(a.caller!==p.loan.borrower)fail('InvalidBorrower');if(p.loan.status!==2n)fail('LoanNotPending');if(p.outstandingUnits!==0n||!p.debt.closed||p.remainingShares!==0n)fail('HandoffIncomplete');const surplus=p.backing;if(surplus!==0n){debitBacking(s,p,surplus);stockTransfer(s,token,s.vault,p.loan.borrower,surplus,a.stockFailure);}p.loan.status=3n;return s;
 }
 if(p.loan.status!==1n)fail('LoanNotActive');
 if(a.kind==='repay'){
  const due=positionDebt(p,a.now);if(amount===0n||amount>due)fail('InvalidDebtApplied');cashMove(s,a.caller,s.pool,amount,a,true,s.cashAllowanceLoanManager);reduce(p,amount,a.now);if(amount===due){detach(s,p);const[n,d]=multipliers(a);close(s,id,n,d,a.now);}return s;
 }
 if(a.kind==='addCollateral'){
  const[n,d]=multipliers(a);if(p.debt.closed)fail('InvalidDebtApplied');if(a.caller===ZERO_ADDRESS)fail('ZeroAddress');const remain=checked(p.remainingShares+amount);if(remain>MAX_SHARES)fail('UnsupportedShareAmount');if(remain>(MAX_UINT-p.outstandingUnits)/MAX_DELIVERY_UNITS_PER_SHARE)fail('UnsupportedShareAmount');if(amount===0n)fail('UnsupportedShareAmount');supportedMultiplier(n,d);const delivery=units(p,amount,n,d);if(delivery===0n)fail('ZeroDelivery');p.remainingShares=remain;p.backing=checked(p.backing+delivery);credit(s.accountedBacking,token,delivery);stockPull(s,token,a.caller,delivery,a);return s;
 }
 if(a.kind==='withdrawCollateral'){
  if(a.caller!==p.loan.borrower)fail('InvalidBorrower');if(p.loan.activeCoverId!==0n&&(a.now<p.opensAt||a.now>=p.cutoffAt))fail('InvalidCoverWindow');const r=requireReference(p.loan.assetId,market(a),a.now);if(amount===0n||amount>p.remainingShares)fail('InvalidExerciseShares');
  const remaining=p.remainingShares-amount;if(p.loan.activeCoverId!==0n&&remaining<s.receipts[p.loan.activeCoverId.toString()]!.consent.totalOfferShares)fail('CoveredCollateralReserved');if(positionDebt(p,a.now)>debtLimit(remaining,loanPrice(p,r),p.loan.config.originationLtvBps))fail('BorrowerLtvTooHigh');
  const delivery=units(p,amount,r.multiplierNumerator,r.multiplierDenominator);if(delivery===0n)fail('ZeroDelivery');if(delivery>p.backing||p.outstandingUnits>p.backing-delivery)fail('InsufficientBacking');p.remainingShares=remaining;debitBacking(s,p,delivery);stockTransfer(s,token,s.vault,a.caller,delivery,a.stockFailure);return s;
 }
 if(a.kind==='liquidate'){
  const m=market(a),r=requireReference(p.loan.assetId,m,a.now);let trigger=p.loan.config.triggerLtvBps,target=p.loan.config.targetLtvBps;
  if(p.loan.activeCoverId!==0n){if(a.now<p.opensAt||a.now>=p.cutoffAt)fail('InvalidCoverWindow');}else if(m.scheduledClose<=s.cutoffOffset||a.now>=m.scheduledClose-s.cutoffOffset){trigger=5000n;target=4500n;}
  const due=positionDebt(p,a.now),result=liquidationPlan(due,p.remainingShares,loanPrice(p,r),trigger,target);const delivery=result.shares===0n?0n:units(p,result.shares,r.multiplierNumerator,r.multiplierDenominator);
  if(delivery===0n){if(p.remainingShares!==0n&&units(p,p.remainingShares,r.multiplierNumerator,r.multiplierDenominator)!==0n)fail('ZeroDelivery');result.repaid=0n;result.shares=p.remainingShares;result.badDebt=due;}else if(delivery+p.outstandingUnits>p.backing)fail('InsufficientBacking');
  if(result.repaid>amount)fail('SlippageExceeded');detach(s,p);if(result.repaid!==0n){cashMove(s,a.caller,s.pool,result.repaid,a,true,s.cashAllowanceLoanManager);reduce(p,result.repaid,a.now);}if(result.badDebt!==0n)reduce(p,result.badDebt,a.now);if(result.shares!==0n)recordClaim(s,id,a.caller,result.shares,r.multiplierNumerator,r.multiplierDenominator,a.now);if(positionDebt(p,a.now)===0n)close(s,id,r.multiplierNumerator,r.multiplierDenominator,a.now);return s;
 }
 throw new TypeError('unknown action');
}
export function emptyPosition(m:MarketFacts):Position {return {loan:{borrower:ZERO_ADDRESS,recipient:ZERO_ADDRESS,assetId:ZERO,configVersion:0n,configHash:ZERO,config:m.config,status:0n,activeCoverId:0n,lastCoveredSessionId:ZERO},debt:{terms:{borrower:ZERO_ADDRESS,assetId:ZERO,assetToken:ZERO_ADDRESS,originalPrincipal:0n,rateNumerator:0n,rateDenominator:0n,startTime:0n,settlementDeadline:0n,snapshotCollateral:0n,snapshotMultiplierNumerator:0n,snapshotMultiplierDenominator:0n},cumulativeDebtReduction:0n,closed:false},remainingShares:0n,backing:0n,outstandingUnits:0n,activeCoverDeadline:0n,opensAt:0n,cutoffAt:0n};}
function emptyOffer():Offer{return {buyer:ZERO_ADDRESS,terms:{assetId:ZERO,policyHash:ZERO,snapshotShares:0n,strike:0n,premium:0n,maxBorrowerLtvBps:0n,referencePrice:0n,maxReferenceDeviationBps:0n,expiry:0n,nonce:0n},cashCapacity:0n,cumulativeExercisedShares:0n,cumulativeCashCharged:0n,receiptId:0n,status:0n};}
/** Arc-only comparison envelope. Caller verifies chain/receipt identity and same-block native provenance. */
export function executionCash(preNative:bigint,preCash:bigint,protocolCashDelta:bigint,gasCost:bigint):{cash:bigint;native:bigint;remainder:bigint}{
 uint(preNative);uint(preCash);uint(gasCost);if(preNative/1000000000000n!==preCash)throw new TypeError('native/cash provenance mismatch');
 const native=preNative+protocolCashDelta*1000000000000n-gasCost;uint(native);return {native,cash:native/1000000000000n,remainder:native%1000000000000n};
}
