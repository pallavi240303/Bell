import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { decodeAbiParameters, parseAbiParameters, keccak256, stringToHex, concat } from 'viem';
import { SolidityError, uint, type Hex, type Lot, type Quote, type Config, type Offer, type Receipt, type DebtRecord, type Claim } from './types.ts';
import { mulDivDown, mulDivUp } from './math.ts';
import { debt } from './interest.ts';
import { cashDelta, minimumSharesForCash, planNormal } from './settle.ts';
import { convertedUnits } from './claims.ts';
import { encode, QUOTE_ABI, TERMS_ABI, quoteHash, hashEncoded } from './quote.ts';
import { constructReceipt, validateBorrow, type BorrowFacts } from './receipt.ts';
import { offerId, termsHash, emptyBook, bookTransition, type BookAction } from './offers.ts';
import { initialState, transition, debtOf, type State, type Action, type Benchmark } from './state.ts';
export const PLAN_ABI = '(uint8 outcome,(uint256 additionalShares,uint256 cashCharged,uint256 debtApplied,uint256 borrowerExcess)[] fills,uint8 fillCount,uint256 debtAfter,uint256 collateralAfter,uint256 borrowerExcess)';
const LOTS_ABI='(uint256 strike,uint256 totalShares,uint256 exercisedShares)[]';
const BORROW_FACTS_ABI='(address caller,uint256 borrowerNonce,uint256 chainId,address manager,bytes32 expectedHash,bool bindingsMatch,uint64 effectiveAt,uint8 tokenDecimals,bytes32 configHash,bool halted,uint8 phase,uint64 scheduledClose,bytes32 sessionAssetId,bytes32 activeSessionId,bytes32 sessionConfigHash,bytes32 stateConfigHash,bytes32 scheduledReportHash,bytes32 actionHash,uint128 actionN,uint128 actionD,bool[] eligible)';
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
export const RECEIPT_ABI=`(${QUOTE_ABI} consent,${CONFIG_ABI} config,bytes32 quoteHash,bytes32[] offerIds,bytes32[] offerTermsHashes,uint64 startTime,uint64 settlementDeadline,uint256 debtCeiling,uint8 status,bytes32 benchmarkReportHash,uint256 benchmarkValuePerSnapshotShare,uint128 latestMultiplierNumerator,uint128 latestMultiplierDenominator)`;
const DEBT_ABI='((address borrower,bytes32 assetId,address assetToken,uint256 originalPrincipal,uint32 rateNumerator,uint64 rateDenominator,uint64 startTime,uint64 settlementDeadline,uint256 snapshotCollateral,uint128 snapshotMultiplierNumerator,uint128 snapshotMultiplierDenominator) terms,uint256 cumulativeDebtReduction,bool closed)';
const CLAIM_ABI='(address owner,uint256 receiptId,uint256 snapshotShares,uint128 reportMultiplierNumerator,uint128 reportMultiplierDenominator,uint64 maturesAt,bool withdrawn,uint256 deliveryUnits)';
const BENCHMARK_ABI='(bool finalized,bytes32 assetId,bytes32 sessionId,bytes32 configHash,uint256 price,uint128 multiplierNumerator,uint128 multiplierDenominator,uint64 observedAt,bytes32 primarySourceHash,bytes32 secondarySourceHash,bytes32 reportHash)';
const SNAPSHOT_ABI=`(${RECEIPT_ABI} receipt,${DEBT_ABI} debt,${OFFER_ABI}[] offers,${CLAIM_ABI}[] claims,uint256[] counters,address[3] components,address[] actors,uint256[8][] balances,uint256[] activeIds)`;
const STEP_ABI=`(uint256 kind,uint256 now_,address caller,uint256 amount,uint256 claimId,address to,${BENCHMARK_ABI} benchmark,bool paused,bool cashCallback)`;
interface Snapshot { receipt:Receipt;debt:DebtRecord;offers:Offer[];claims:Claim[];counters:bigint[];components:[Hex,Hex,Hex];actors:Hex[];balances:bigint[][];activeIds:bigint[] }
interface Step { kind:bigint;now_:bigint;caller:Hex;amount:bigint;claimId:bigint;to:Hex;benchmark:Benchmark;paused:boolean;cashCallback:boolean }
function fromSnapshot(w:Snapshot):State {
  const c=w.counters,s=initialState(c[0]!,w.receipt,w.offers,...w.components);
  s.debt=w.debt;s.claims=w.claims;s.nextClaimId=c[1]!;s.remainingShares=c[2]!;s.backing=c[3]!;s.accountedBacking=c[4]!;s.outstandingUnits=c[5]!;s.totalLockedCash=c[6]!;s.totalPremiumCredits=c[7]!;s.totalCashCredits=c[8]!;s.activeReceiptIds=w.activeIds;
  s.cashDecrementsInfiniteAllowance=true;
  for(const [i,who]of w.actors.entries()){const b=w.balances[i]!;s.cashBalances[who]=b[0]!;s.stockBalances[who]=b[1]!;s.premiumCredits[who]=b[2]!;s.cashCredits[who]=b[3]!;s.cashAllowanceManager[who]=b[5]!;s.stockAllowanceVault[who]=b[7]!;}
  return s;
}
function snapshot(s:State,base:Snapshot,now:bigint):Snapshot {
  const c=[...base.counters];c[1]=s.nextClaimId;c[2]=s.remainingShares;c[3]=s.backing;c[4]=s.accountedBacking;c[5]=s.outstandingUnits;c[6]=s.totalLockedCash;c[7]=s.totalPremiumCredits;c[8]=s.totalCashCredits;c[9]=debtOf(s,now);c[11]=(s.cashBalances[s.pool]??0n)+(s.activeReceiptIds.includes(s.receiptId)?c[9]:0n);
  return {...base,receipt:s.receipt,debt:s.debt,offers:s.offers,claims:s.claims,counters:c,activeIds:s.activeReceiptIds,balances:base.actors.map((who,i)=>[s.cashBalances[who]??0n,s.stockBalances[who]??0n,s.premiumCredits[who]??0n,s.cashCredits[who]??0n,base.balances[i]![4]!,s.cashAllowanceManager[who]!,base.balances[i]![6]!,s.stockAllowanceVault[who]!])};
}
function trace(w:Snapshot,steps:Step[]):Hex {
  let state=fromSnapshot(w);
  const kinds:Record<string,Action['kind']>={'0':'repay','1':'addCollateral','2':'withdrawCollateral','3':'settle','4':'terminal','5':'topUp','6':'finalize','7':'withdrawClaim','8':'withdrawPremium','9':'withdrawCredit'};
  const results=steps.map(step=>{
    const kind=kinds[step.kind.toString()];if(!kind)throw new TypeError('unknown step');
    let ok=true,error:Hex='0x';
    try{state=transition(state,{kind,now:step.now_,caller:step.caller,amount:step.amount,claimId:step.claimId,to:step.to,benchmark:step.benchmark,...(step.paused?{stockFailure:new SolidityError('TransfersPaused')}: {}),...(step.cashCallback?{cashFailure:new SolidityError('CashDebtTransition')}: {})});}
    catch(e){if(!(e instanceof SolidityError))throw e;ok=false;error=errorData(e);}
    return {ok,revertData:error,stateHash:hashEncoded(SNAPSHOT_ABI,[snapshot(state,w,step.now_)])};
  });
  return encode('(bool ok,bytes revertData,bytes32 stateHash)[]',[results]);
}
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
  const result=bigints(decodeAbiParameters(parseAbiParameters(schema),input)) as unknown[];
  if(encode(schema,result)!==input)throw new TypeError('noncanonical ABI payload');return result;
}
const ERROR_ARGS: Record<string,string>={Error:'string',ERC20InsufficientAllowance:'address,uint256,uint256',Panic:'uint256',TooManyFills:'uint256',InsufficientFundedCapacity:'uint256,uint256',InvalidOfferState:'uint8,uint8',OfferNonceUsed:'address,uint256',IneligibleBuyer:'address',NotOfferBuyer:'address',UnauthorizedManager:'address',InvalidDecimals:'uint8,uint8',InvalidTokenBalanceDelta:'uint256,uint256',ERC20InsufficientBalance:'address,uint256,uint256',LiabilityShortfall:'uint256,uint256'};
export function errorData(error:SolidityError):Hex {
  const schema=ERROR_ARGS[error.name]??'';
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
  if(op===9n){const a=decode(`${QUOTE_ABI},${CONFIG_ABI},bytes32[],bytes32[],${OFFER_ABI}[],bytes32[],bytes32,uint256,uint256`,input) as [Quote,Config,Hex[],Hex[],Offer[],Hex[],Hex,bigint,bigint];return encode(RECEIPT_ABI,[constructReceipt(...a)]);}
  if(op===10n){const a=decode(`${SNAPSHOT_ABI},${STEP_ABI}[]`,input) as [Snapshot,Step[]];return trace(...a);}
  if(op===11n){const a=decode(`${QUOTE_ABI},${CONFIG_ABI},bytes32[],bytes32[],${OFFER_ABI}[],bytes32[],uint256,${BORROW_FACTS_ABI}`,input) as [Quote,Config,Hex[],Hex[],Offer[],Hex[],bigint,BorrowFacts];return encode(RECEIPT_ABI,[validateBorrow(...a)]);}
  if(op===12n){const a=decode(`${BOOK_SNAPSHOT_ABI},${BOOK_STEP_ABI}`,input) as [BookSnapshot,BookStep];return bookStep(...a);}
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
