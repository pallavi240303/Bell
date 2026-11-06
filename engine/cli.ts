import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { decodeAbiParameters, parseAbiParameters, keccak256, stringToHex, concat } from 'viem';
import { SolidityError, uint, type Hex, type Lot, type Quote, type Config, type Offer, type Receipt, type DebtRecord, type Claim, type Position, type MarketFacts, type BorrowRequest } from './types.ts';
import { mulDivDown, mulDivUp } from './math.ts';
import { debt, debtWide } from './interest.ts';
import { cashDelta, minimumSharesForCash, planNormal } from './settle.ts';
import { convertedUnits } from './claims.ts';
import { encode, abiParameters, QUOTE_ABI, TERMS_ABI, quoteHash, hashEncoded } from './quote.ts';
import { constructReceipt, validateCover, liquidationPlan, type CoverFacts } from './receipt.ts';
import { offerId, termsHash, emptyBook, bookTransition, type BookAction } from './offers.ts';
import { initialState, transition, debtOf, totalAssets, ACTION_KINDS, type State, type Action, type Benchmark } from './state.ts';
export const PLAN_ABI = '(uint8 outcome,(uint256 additionalShares,uint256 cashCharged,uint256 debtApplied,uint256 borrowerExcess)[] fills,uint8 fillCount,uint256 debtAfter,uint256 collateralAfter,uint256 borrowerExcess)';
const LOTS_ABI='(uint256 strike,uint256 totalShares,uint256 exercisedShares)[]';
export const CONFIG_ABI='(address assetToken,uint8 stockTokenDecimals,uint8 cashTokenDecimals,uint16 originationLtvBps,uint16 targetLtvBps,uint16 triggerLtvBps,uint32 rateNumerator,uint64 rateDenominator,uint8 maxFills,uint8 maxActiveReceipts,uint8 supportedCorporateActions)';
export const OFFER_ABI=`(address buyer,${TERMS_ABI} terms,uint256 cashCapacity,uint256 cumulativeExercisedShares,uint256 cumulativeCashCharged,uint256 receiptId,uint8 status)`;
const BOOK_SNAPSHOT_ABI=`(uint256 chainId,address book_,address manager_,address pool_,bytes32[] ids_,address[] buyers,uint256[] nonces,${OFFER_ABI}[] offers,bytes32[] termsHashes,bool[] used,uint256[3] totals,address[] actors,uint256[4][] balances)`;
const BOOK_STEP_ABI=`(uint256 kind,address caller,uint256 now_,bytes32 id,${TERMS_ABI} terms,bool eligible,bytes32 termsHash,uint256 receiptId,address payer,uint64 deadline,uint256 referencePrice,uint16 ltv,uint256 cumulative,uint256 applied,address borrower)`;
interface BookSnapshot {chainId:bigint;book_:Hex;manager_:Hex;pool_:Hex;ids_:Hex[];buyers:Hex[];nonces:bigint[];offers:Offer[];termsHashes:Hex[];used:boolean[];totals:bigint[];actors:Hex[];balances:bigint[][]}
type BookStep = Omit<BookAction,'kind'|'now'|'reference'> & {kind:bigint;now_:bigint;referencePrice:bigint};
function bookStep(w:BookSnapshot,a:BookStep):Hex {
  let state=emptyBook(w.chainId,w.book_,w.manager_,w.pool_);
  for(const [i,id]of w.ids_.entries()){state.offers[id]=w.offers[i]!;state.termsHashes[id]=w.termsHashes[i]!;state.usedNonces[`${w.buyers[i]}:${w.nonces[i]}`]=w.used[i]!;}
  [state.locked,state.premiums,state.credits]=w.totals as [bigint,bigint,bigint];
  for(const [i,who]of w.actors.entries()){const b=w.balances[i]!;state.balances[who]=b[0]!;state.premiumCredits[who]=b[1]!;state.cashCredits[who]=b[2]!;state.allowances[who]=b[3]!;}
  const kinds:Record<string,BookAction['kind']>={'0':'post','1':'cancel','2':'reserve','3':'exercise','4':'release'};
  const kind=kinds[a.kind.toString()];if(!kind)throw new TypeError('unknown book action');
  let ok=true,revertData:Hex='0x';
  try{state=bookTransition(state,{...a,kind,now:a.now_,reference:a.referencePrice});}catch(e){if(!(e instanceof SolidityError))throw e;ok=false;revertData=errorData(e);}
  const after:BookSnapshot={...w,offers:w.ids_.map(id=>state.offers[id]!),termsHashes:w.ids_.map(id=>state.termsHashes[id]!),used:w.ids_.map((_,i)=>state.usedNonces[`${w.buyers[i]}:${w.nonces[i]}`]??false),totals:[state.locked,state.premiums,state.credits],balances:w.actors.map(who=>[state.balances[who]??0n,state.premiumCredits[who]??0n,state.cashCredits[who]??0n,state.allowances[who]??0n])};
  return encode('(bool ok,bytes revertData,bytes32 stateHash)',[{ok,revertData,stateHash:hashEncoded(BOOK_SNAPSHOT_ABI,[after])}]);
}
export const RECEIPT_ABI=`(uint256 loanId,${QUOTE_ABI} consent,${CONFIG_ABI} config,bytes32 quoteHash,bytes32[] offerIds,bytes32[] offerTermsHashes,uint64 startTime,uint64 opensAt,uint64 cutoffAt,uint64 settlementDeadline,uint256 debtAtAcceptance,uint256 debtCeiling,uint8 status,bytes32 benchmarkReportHash,uint256 benchmarkValuePerSnapshotShare,uint128 latestMultiplierNumerator,uint128 latestMultiplierDenominator)`;
export const DEBT_ABI='((address borrower,bytes32 assetId,address assetToken,uint256 originalPrincipal,uint32 rateNumerator,uint64 rateDenominator,uint64 startTime,uint64 settlementDeadline,uint256 snapshotCollateral,uint128 snapshotMultiplierNumerator,uint128 snapshotMultiplierDenominator) terms,uint256 cumulativeDebtReduction,bool closed)';
export const LOAN_ABI=`(address borrower,address recipient,bytes32 assetId,uint64 configVersion,bytes32 configHash,${CONFIG_ABI} config,uint8 status,uint256 activeCoverId,bytes32 lastCoveredSessionId)`;
export const POSITION_ABI=`(${LOAN_ABI} loan,${DEBT_ABI} debt,uint256 remainingShares,uint256 backing,uint256 outstandingUnits,uint64 activeCoverDeadline,uint64 opensAt,uint64 cutoffAt)`;
export const CLAIM_ABI='(address owner,uint256 receiptId,uint256 snapshotShares,uint128 reportMultiplierNumerator,uint128 reportMultiplierDenominator,uint64 maturesAt,bool withdrawn,uint256 deliveryUnits)';
export const BENCHMARK_ABI='(bool finalized,bytes32 assetId,bytes32 sessionId,bytes32 configHash,uint256 price,uint128 multiplierNumerator,uint128 multiplierDenominator,uint64 observedAt,bytes32 primarySourceHash,bytes32 secondarySourceHash,bytes32 reportHash)';
export const REFERENCE_ABI='(bytes32 assetId,bytes32 sessionId,bytes32 configHash,uint256 price,uint128 multiplierNumerator,uint128 multiplierDenominator,uint64 observedAt,uint64 validUntil,bytes32 corporateActionHash,bytes32 primarySourceHash,bytes32 secondarySourceHash,bytes32 reportHash)';
export const MARKET_ABI=`(bool configFound,bytes32 configAssetId,uint64 configVersion,${CONFIG_ABI} config,uint64 effectiveAt,bytes32 configHash,uint8 tokenDecimals,uint8 cashDecimals,bool bindingsMatch,bool halted,uint8 phase,uint64 scheduledOpen,uint64 scheduledClose,bytes32 sessionAssetId,bytes32 activeSessionId,bytes32 sessionConfigHash,bytes32 stateConfigHash,bytes32 scheduledReportHash,bytes32 actionHash,uint128 actionN,uint128 actionD,bool referenceInvalidated,${REFERENCE_ABI} referenceFact,bool[] eligible)`;
export const BORROW_REQUEST_ABI='(bytes32 assetId,uint64 configVersion,bytes32 configHash,uint256 principal,uint256 collateralShares,address recipient,bytes32 referenceReportHash,uint64 expiry)';
export const COVER_FACTS_ABI=`(address caller,uint256 borrowerNonce,uint256 chainId,address manager,bytes32 expectedHash,uint8 profile,uint64 opensOffset,uint64 cutoffOffset,uint256 loanId,uint256 receiptId,${POSITION_ABI} position,${MARKET_ABI} market)`;
export const SNAPSHOT_ABI=`((uint256 id,${POSITION_ABI} position,uint256 debtNow)[] loans,(uint256 id,${RECEIPT_ABI} receipt)[] receipts,(bytes32 id,${OFFER_ABI} offer,bytes32 termsHash)[] offers,(uint256 id,${CLAIM_ABI} claim)[] claims,uint256[12] counters,address[5] components,address[] actors,uint256[7][] balances,(address token,uint256 accounted,uint256[2][] balances)[] stocks,uint256[] activeIds)`;
export const STEP_ABI=`(uint256 kind,uint256 now_,address caller,uint256 loanId,uint256 receiptId,uint256 amount,uint256 claimId,address to,${BENCHMARK_ABI} benchmark,${MARKET_ABI} market,${BORROW_REQUEST_ABI} request,${QUOTE_ABI} quote,bytes32[] offerIds,bytes32[] termsHashes,bytes32 expectedHash,bool paused,bool cashCallback)`;
export interface Snapshot {loans:{id:bigint;position:Position;debtNow:bigint}[];receipts:{id:bigint;receipt:Receipt}[];offers:{id:Hex;offer:Offer;termsHash:Hex}[];claims:{id:bigint;claim:Claim}[];counters:bigint[];components:[Hex,Hex,Hex,Hex,Hex];actors:Hex[];balances:bigint[][];stocks:{token:Hex;accounted:bigint;balances:bigint[][]}[];activeIds:bigint[]}
export interface Step {kind:bigint;now_:bigint;caller:Hex;loanId:bigint;receiptId:bigint;amount:bigint;claimId:bigint;to:Hex;benchmark:Benchmark;market:MarketFacts;request:BorrowRequest;quote:Quote;offerIds:Hex[];termsHashes:Hex[];expectedHash:Hex;paused:boolean;cashCallback:boolean}
export function fromSnapshot(w:Snapshot):State {
 const c=w.counters,[pool,book,vault,manager,loanManager]=w.components,s=initialState(c[0]!,manager,loanManager,pool,book,vault,c[1]!);
 s.opensOffset=c[2]!;s.cutoffOffset=c[3]!;s.nextLoanId=c[4]!;s.nextReceiptId=c[5]!;s.nextClaimId=c[6]!;s.totalLockedCash=c[7]!;s.totalPremiumCredits=c[8]!;s.totalCashCredits=c[9]!;s.poolSupply=c[10]!;s.activeLoanIds=[...w.activeIds];
 for(const e of w.loans)s.loans[e.id.toString()]=structuredClone(e.position);
 for(const e of w.receipts){s.receipts[e.id.toString()]=structuredClone(e.receipt);s.loanOfReceipt[e.id.toString()]=e.receipt.loanId;}
 for(const e of w.offers){s.offers[e.id]=structuredClone(e.offer);s.termsHashes[e.id]=e.termsHash;}
 for(const e of w.claims)s.claims[e.id.toString()]=structuredClone(e.claim);
 for(const[i,who]of w.actors.entries()){const b=w.balances[i]!;s.cashBalances[who]=b[0]!;s.premiumCredits[who]=b[1]!;s.cashCredits[who]=b[2]!;s.poolShares[who]=b[3]!;s.cashAllowanceLoanManager[who]=b[4]!;s.cashAllowanceBook[who]=b[5]!;s.borrowerNonces[who]=b[6]!;}
 for(const t of w.stocks){s.accountedBacking[t.token]=t.accounted;s.stockBalances[t.token]={};s.stockAllowanceVault[t.token]={};for(const[i,who]of w.actors.entries()){s.stockBalances[t.token]![who]=t.balances[i]![0]!;s.stockAllowanceVault[t.token]![who]=t.balances[i]![1]!;}}
 return s;
}
const ordered=<T>(map:Record<string,T>):[string,T][]=>Object.entries(map).sort(([a],[b])=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
export function snapshot(s:State,base:Snapshot,now:bigint):Snapshot {
 const get=(m:Record<string,bigint>,k:string)=>m[k]??0n;
 return {loans:ordered(s.loans).map(([id,p])=>({id:BigInt(id),position:p,debtNow:debtOf(s,BigInt(id),now)})),receipts:ordered(s.receipts).map(([id,r])=>({id:BigInt(id),receipt:r})),offers:base.offers.map(e=>({id:e.id,offer:s.offers[e.id]!,termsHash:s.termsHashes[e.id]!})),claims:ordered(s.claims).map(([id,c])=>({id:BigInt(id),claim:c})),counters:[s.chainId,s.profile,s.opensOffset,s.cutoffOffset,s.nextLoanId,s.nextReceiptId,s.nextClaimId,s.totalLockedCash,s.totalPremiumCredits,s.totalCashCredits,s.poolSupply,totalAssets(s,now)],components:base.components,actors:base.actors,balances:base.actors.map(w=>[get(s.cashBalances,w),get(s.premiumCredits,w),get(s.cashCredits,w),get(s.poolShares,w),get(s.cashAllowanceLoanManager,w),get(s.cashAllowanceBook,w),get(s.borrowerNonces,w)]),stocks:base.stocks.map(t=>({token:t.token,accounted:get(s.accountedBacking,t.token),balances:base.actors.map(w=>[get(s.stockBalances[t.token]??{},w),get(s.stockAllowanceVault[t.token]??{},w)])})),activeIds:s.activeLoanIds};
}
export function actionFromStep(step:Step):Action {const kind=ACTION_KINDS.find((_,i)=>BigInt(i)===step.kind);if(!kind)throw new TypeError('unknown step');return {...step,kind,now:step.now_,...(step.paused?{stockFailure:new SolidityError('TransfersPaused')}:{}),poolNavCallback:step.cashCallback};}
export function trace(w:Snapshot,steps:Step[]):Hex {
 let state=fromSnapshot(w);
 const results=steps.map(step=>{let ok=true,revertData:Hex='0x';try{state=transition(state,actionFromStep(step));}catch(e){if(!(e instanceof SolidityError))throw e;ok=false;revertData=errorData(e);}return {ok,revertData,stateHash:hashEncoded(SNAPSHOT_ABI,[snapshot(state,w,step.now_)])};});
 return encode('(bool ok,bytes revertData,bytes32 stateHash)[]',[results]);
}
export const FFI_OPS={mulDivDown:0n,mulDivUp:1n,debt:2n,cashDelta:3n,minimumShares:4n,normalPlan:5n,convertedUnits:6n,quoteHash:7n,offerHash:8n,constructReceipt:9n,trace:10n,validateCover:11n,book:12n,debtWide:13n,liquidationPlan:14n,borrow:15n,buyCover:16n,liquidate:17n} as const;
// ABI libraries may decode small integers as JS numbers. Convert at the boundary before any protocol computation.
function bigints(value: unknown): unknown {
  if(typeof value==='number')return BigInt(value);
  if(Array.isArray(value))return value.map(bigints);
  if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,bigints(v)]));
  if(typeof value==='string'&&value.startsWith('0x'))return value.toLowerCase();
  return value;
}
export function decode(schema:string,input:Hex): unknown[] {
  if(!/^0x(?:[0-9a-f]{2})*$/.test(input))throw new TypeError('noncanonical ABI hex');
  const result=bigints(decodeAbiParameters(abiParameters(schema),input)) as unknown[];
  if(encode(schema,result)!==input)throw new TypeError('noncanonical ABI payload');return result;
}
const ERROR_ARGS: Record<string,string>={UnknownConfig:'bytes32,uint64',ReferenceUnavailable:'bytes32',ReferenceSessionNotOpen:'bytes32',FutureObservation:'uint64,uint64',ReportExpired:'uint64,uint64',StaleReference:'uint64,uint64',SafeERC20FailedOperation:'address',Error:'string',ERC20InsufficientAllowance:'address,uint256,uint256',Panic:'uint256',TooManyFills:'uint256',InsufficientFundedCapacity:'uint256,uint256',InvalidOfferState:'uint8,uint8',OfferNonceUsed:'address,uint256',IneligibleBuyer:'address',NotOfferBuyer:'address',UnauthorizedManager:'address',InvalidDecimals:'uint8,uint8',InvalidTokenBalanceDelta:'uint256,uint256',ERC20InsufficientBalance:'address,uint256,uint256',LiabilityShortfall:'uint256,uint256'};
export function errorData(error:SolidityError):Hex {
  const schema=error.name==='AssetHalted'?(error.args.length===0?'':'bytes32'):(ERROR_ARGS[error.name]??'');
  if(schema===''&&error.args.length!==0)throw new TypeError(`unknown error signature ${error.name}`);
  const selector=keccak256(stringToHex(`${error.name}(${schema})`)).slice(0,10) as Hex;
  return schema === '' ? selector : concat([selector,encode(schema,error.args)]);
}
export function evaluate(op:bigint,input:Hex,chainId:bigint):Hex {
  if(op<2n){const [x,y,d]=decode('uint256,uint256,uint256',input) as bigint[];return encode('uint256',[(op===0n?mulDivDown:mulDivUp)(x!,y!,d!)]);}
  if(op===2n){const a=decode('uint256,uint32,uint64,uint64,uint64,uint256,uint256',input) as [bigint,bigint,bigint,bigint,bigint,bigint,bigint];return encode('uint256',[debt(...a)]);}
  if(op===3n){const a=decode('uint256,uint256,uint256',input) as [bigint,bigint,bigint];return encode('uint256',[cashDelta(...a)]);}
  if(op===4n){const a=decode('uint256,uint256,uint256,uint256',input) as [bigint,bigint,bigint,bigint];return encode('uint256,uint256',minimumSharesForCash(...a));}
  if(op===5n){const a=decode(`uint256,uint256,uint256,uint16,uint16,${LOTS_ABI}`,input) as [bigint,bigint,bigint,bigint,bigint,Lot[]];return encode(PLAN_ABI,[planNormal(...a)]);}
  if(op===6n){const a=decode('uint256,uint128,uint128,uint128,uint128',input) as [bigint,bigint,bigint,bigint,bigint];return encode('uint256',[convertedUnits(...a)]);}
  if(op===7n){const a=decode(`address,${QUOTE_ABI},bytes32[],bytes32[]`,input) as [Hex,Quote,Hex[],Hex[]];return encode('bytes32',[quoteHash(chainId,...a)]);}
  if(op===8n){const [book,offer]=decode(`address,${OFFER_ABI}`,input) as [Hex,Offer];const id=offerId(chainId,book,offer.buyer,offer.terms.nonce);return encode('bytes32,bytes32',[id,termsHash(id,offer)]);}
  if(op===9n){const a=decode(`${QUOTE_ABI},${CONFIG_ABI},bytes32[],bytes32[],${OFFER_ABI}[],bytes32[],bytes32,uint256,${COVER_FACTS_ABI}`,input) as [Quote,Config,Hex[],Hex[],Offer[],Hex[],Hex,bigint,CoverFacts];return encode(RECEIPT_ABI,[constructReceipt(...a)]);}
  if(op===10n){const a=decode(`${SNAPSHOT_ABI},${STEP_ABI}[]`,input) as [Snapshot,Step[]];return trace(...a);}
  if(op===11n){const a=decode(`${QUOTE_ABI},bytes32[],bytes32[],${OFFER_ABI}[],bytes32[],uint256,${COVER_FACTS_ABI}`,input) as [Quote,Hex[],Hex[],Offer[],Hex[],bigint,CoverFacts];return encode(RECEIPT_ABI,[validateCover(...a)]);}
  if(op===12n){const a=decode(`${BOOK_SNAPSHOT_ABI},${BOOK_STEP_ABI}`,input) as [BookSnapshot,BookStep];return bookStep(...a);}
  if(op===13n){const a=decode('uint256,uint32,uint64,uint64,uint256,uint256',input) as [bigint,bigint,bigint,bigint,bigint,bigint];return encode('uint256',[debtWide(...a)]);}
  if(op===14n){const a=decode('uint256,uint256,uint256,uint16,uint16',input) as [bigint,bigint,bigint,bigint,bigint];return encode('(uint256 repaid,uint256 shares,uint256 badDebt)',[liquidationPlan(...a)]);}
  if(op>=15n&&op<=17n){const [w,step]=decode(`${SNAPSHOT_ABI},${STEP_ABI}`,input) as [Snapshot,Step];if(step.kind!==op-5n)throw new TypeError('operation/action mismatch');return trace(w,[step]);}
  throw new TypeError('unknown FFI operation');
}
function canonicalInteger(v:unknown):bigint{if(typeof v!=='string'||!/^(0|[1-9][0-9]*)$/.test(v))throw new TypeError('integers must be canonical decimal strings');return uint(BigInt(v));}
export function main(args:string[]):string {
  if(args.length===1&&args[0]!.startsWith('--ffi=')){
    const [chainId,requests]=decode('uint256,(uint256 op,bytes input)[]',args[0]!.slice(6) as Hex) as [bigint,{op:bigint;input:Hex}[]];
    const results=requests.map(r=>{try{return {ok:true,data:evaluate(r.op,r.input,chainId)};}catch(e){if(!(e instanceof SolidityError))throw e;return {ok:false,data:errorData(e)};}});
    return encode('(bool ok,bytes data)[]',[results]);
  }
  if(args.length!==0)throw new TypeError('usage: JSON on stdin or --ffi=<canonical ABI batch>');
  const requests:unknown=JSON.parse(readFileSync(0,'utf8'));if(!Array.isArray(requests))throw new TypeError('batch must be an array');
  const results=requests.map((r:unknown)=>{
    if(r===null||typeof r!=='object'||!('op'in r)||!('args'in r)||Object.keys(r).length!==2||!Array.isArray(r.args))throw new TypeError('invalid request');
    const a=r.args.map(canonicalInteger);
    try{
      if((r.op==='mulDivDown'||r.op==='mulDivUp')&&a.length===3)return {ok:true,value:(r.op==='mulDivDown'?mulDivDown:mulDivUp)(a[0]!,a[1]!,a[2]!)};
      if(r.op==='debt'&&a.length===7)return {ok:true,value:debt(...a as [bigint,bigint,bigint,bigint,bigint,bigint,bigint])};
      if(r.op==='cashDelta'&&a.length===3)return {ok:true,value:cashDelta(...a as [bigint,bigint,bigint])};
      if(r.op==='minimumSharesForCash'&&a.length===4)return {ok:true,value:minimumSharesForCash(...a as [bigint,bigint,bigint,bigint])};
      if(r.op==='convertedUnits'&&a.length===5)return {ok:true,value:convertedUnits(...a as [bigint,bigint,bigint,bigint,bigint])};
      throw new TypeError('unknown operation or wrong arity');
    }catch(e){if(!(e instanceof SolidityError))throw e;return {ok:false,error:{name:e.name,args:e.args}};}
  });
  return JSON.stringify(results,(_,v:unknown)=>typeof v==='bigint'?v.toString():v);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{process.stdout.write(main(process.argv.slice(2)));}catch(e){process.stderr.write(`${e instanceof Error?e.message:'invalid input'}\n`);process.exitCode=1;}}
