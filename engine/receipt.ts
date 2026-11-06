import { MAX_CASH, MAX_SHARES, MAX_PRICE, MAX_TIME, ZERO, ZERO_ADDRESS } from './params.ts';
import { mulDivDown, mulDivUp } from './math.ts';
import { debt, debtWide } from './interest.ts';
import { requireOfferStatus } from './offers.ts';
import { policyHash, quoteHash } from './quote.ts';
import { fail, type Config, type Hex, type Offer, type Quote, type Receipt, type Position, type MarketFacts, type Reference } from './types.ts';
export function positionDebt(p:Position,now:bigint):bigint {
 if(p.debt.closed)return 0n;
 const t=p.debt.terms,cap=t.settlementDeadline||p.activeCoverDeadline;
 const timestamp=cap!==0n&&now>=cap?cap:now;
 if(timestamp>MAX_TIME)fail('InvalidTimeRange');
 return t.settlementDeadline===0n?debtWide(t.originalPrincipal,t.rateNumerator,t.startTime,timestamp,t.rateDenominator,p.debt.cumulativeDebtReduction):debt(t.originalPrincipal,t.rateNumerator,t.startTime,t.settlementDeadline,timestamp,t.rateDenominator,p.debt.cumulativeDebtReduction);
}
export function projectedDebt(p:Position,timestamp:bigint,now:bigint):bigint {if(timestamp<now)fail('InvalidTimeRange');return positionDebt(p,timestamp);}
export function requireReference(asset:Hex,f:MarketFacts,now:bigint):Reference {
 const r=f.referenceFact;
 if(f.halted)fail('AssetHalted',asset);
 if(r.reportHash===ZERO||f.referenceInvalidated||r.sessionId!==f.activeSessionId||r.configHash!==f.stateConfigHash||r.corporateActionHash!==f.actionHash)fail('ReferenceUnavailable',asset);
 if(f.activeSessionId===ZERO||f.phase!==1n||f.sessionAssetId!==asset||f.sessionConfigHash!==f.stateConfigHash||now<f.scheduledOpen||now>=f.scheduledClose)fail('ReferenceSessionNotOpen',f.activeSessionId);
 const t=now&MAX_TIME;
 if(r.observedAt>now)fail('FutureObservation',r.observedAt,t);
 if(r.validUntil<now)fail('ReportExpired',r.validUntil,t);
 if(now-r.observedAt>1800n)fail('StaleReference',r.observedAt,t);
 if(r.validUntil<r.observedAt||r.validUntil>r.observedAt+1800n)fail('InvalidReferenceValidity');
 return r;
}
export function debtLimit(shares:bigint,price:bigint,ltv:bigint):bigint {if(shares>MAX_SHARES)fail('UnsupportedShareAmount');return mulDivDown(shares*ltv,price,10000n*10n**18n);}
export function loanPrice(p:Position,r:Reference):bigint {const t=p.debt.terms;return mulDivDown(r.price,r.multiplierNumerator*t.snapshotMultiplierDenominator,r.multiplierDenominator*t.snapshotMultiplierNumerator);}
export interface CoverFacts { caller:Hex; borrowerNonce:bigint; chainId:bigint; manager:Hex; expectedHash:Hex; profile:bigint; opensOffset:bigint; cutoffOffset:bigint; loanId:bigint; receiptId:bigint; position:Position; market:MarketFacts }
export function constructReceipt(q:Quote,config:Config,ids:Hex[],hashes:Hex[],offers:Offer[],actualHashes:Hex[],identity:Hex,now:bigint,f:CoverFacts):Receipt {
 if(q.principal===0n||q.principal>MAX_CASH)fail('UnsupportedCashAmount');
 if(q.collateralShares===0n||q.collateralShares>MAX_SHARES)fail('InvalidCollateral');
 if(q.referencePrice===0n||q.referencePrice>MAX_PRICE)fail('UnsupportedPrice');
 if(ids.length===0||ids.length>8||ids.length!==hashes.length)fail('InvalidOfferCount');
 if(offers.length!==ids.length||actualHashes.length!==ids.length)throw new TypeError('incomplete offer snapshot');
 let total=0n,premium=0n,weighted=0n,capacity=0n,deadline=MAX_TIME,previous=0n;
 for(const [i,o]of offers.entries()){
  requireOfferStatus(o,1n);if(actualHashes[i]!==hashes[i])fail('OfferTermsHashMismatch');
  const t=o.terms;if(t.assetId!==q.assetId||t.policyHash!==q.policyHash)fail('OfferIdentityMismatch');
  if(i!==0&&(t.strike>previous||(t.strike===previous&&ids[i]!<=ids[i-1]!)))fail('InvalidOfferOrder');
  previous=t.strike;total+=t.snapshotShares;premium+=t.premium;weighted+=t.snapshotShares*t.strike;capacity+=o.cashCapacity;if(t.expiry<deadline)deadline=t.expiry;
 }
 if(total===0n||total>q.collateralShares)fail('InvalidCollateral');
 if(total!==q.totalOfferShares||premium!==q.totalPremium||weighted/total!==q.weightedStrike)fail('QuoteTotalsMismatch');
 if(deadline<=f.market.scheduledClose||deadline<q.minSettlementDeadline||deadline>q.maxSettlementDeadline)fail('InvalidSettlementDeadline');
 const p=f.position,l=p.loan,t=p.debt.terms;
 if(l.status===0n)fail('InvalidReceiptId');if(l.status!==1n)fail('LoanNotActive');
 const nowDebt=positionDebt(p,now),ceiling=projectedDebt(p,deadline,now);
 if(l.borrower!==q.borrower||l.recipient!==q.recipient||l.assetId!==q.assetId||t.originalPrincipal!==q.principal||p.remainingShares!==q.collateralShares||t.snapshotMultiplierNumerator!==q.snapshotMultiplierNumerator||t.snapshotMultiplierDenominator!==q.snapshotMultiplierDenominator)fail('InvalidLoanConsent');
 if(l.config.assetToken!==config.assetToken||l.config.stockTokenDecimals!==config.stockTokenDecimals||l.config.cashTokenDecimals!==config.cashTokenDecimals)fail('ComponentMismatch');
 const trigger=l.config.triggerLtvBps<config.triggerLtvBps?l.config.triggerLtvBps:config.triggerLtvBps;
 if(nowDebt>debtLimit(q.collateralShares,q.referencePrice,trigger))fail('BorrowerLtvTooHigh');
 if(ceiling>MAX_CASH)fail('UnsupportedCashAmount');
 if(nowDebt>q.maxDebtAtAcceptance||ceiling>q.maxDebtAtDeadline)fail('DebtLimitExceeded');
 if(capacity<ceiling)fail('InsufficientFundedCapacity',capacity,ceiling);
 return {loanId:q.loanId,consent:structuredClone(q),config:structuredClone(config),quoteHash:identity,offerIds:[...ids],offerTermsHashes:[...hashes],startTime:now,opensAt:f.market.scheduledClose-f.opensOffset,cutoffAt:f.market.scheduledClose-f.cutoffOffset,settlementDeadline:deadline,debtAtAcceptance:nowDebt,debtCeiling:ceiling,status:1n,benchmarkReportHash:ZERO,benchmarkValuePerSnapshotShare:0n,latestMultiplierNumerator:q.snapshotMultiplierNumerator,latestMultiplierDenominator:q.snapshotMultiplierDenominator};
}
export function validateCover(q:Quote,ids:Hex[],hashes:Hex[],offers:Offer[],actualHashes:Hex[],now:bigint,f:CoverFacts):Receipt {
 if(f.loanId!==q.loanId)fail('InvalidLoanConsent');if(q.borrower!==f.caller)fail('InvalidBorrower');if(q.borrowerNonce!==f.borrowerNonce)fail('InvalidBorrowerNonce');if(q.recipient===ZERO_ADDRESS)fail('ZeroAddress');if(now>q.expiry)fail('QuoteExpired');
 const identity=quoteHash(f.chainId,f.manager,q,ids,hashes);if(identity!==f.expectedHash)fail('QuoteHashMismatch');
 const m=f.market,c=m.config;if(!m.bindingsMatch)fail('ComponentMismatch');if(!m.configFound||m.configAssetId!==q.assetId||m.configVersion!==q.configVersion)fail('UnknownConfig',q.assetId,q.configVersion);if(m.effectiveAt>now)fail('ConfigNotEffective');
 if(c.stockTokenDecimals!==18n)fail('InvalidDecimals',c.stockTokenDecimals,c.cashTokenDecimals);if(m.tokenDecimals!==18n)fail('InvalidDecimals',m.tokenDecimals,c.cashTokenDecimals);
 if(m.configHash!==q.configHash)fail('ReferenceFactsMismatch');if(m.halted)fail('AssetHalted');
 if(m.phase!==1n||now>=m.scheduledClose||m.sessionAssetId!==q.assetId||m.activeSessionId!==q.sessionId)fail('InvalidSession');
 if(m.sessionConfigHash!==q.configHash||m.stateConfigHash!==q.configHash||m.scheduledReportHash!==q.scheduledReportHash||m.actionHash!==q.corporateActionHash)fail('ReferenceFactsMismatch');
 if(m.scheduledClose<f.opensOffset)fail('InvalidCoverWindow');
 const opens=m.scheduledClose-f.opensOffset,cutoff=m.scheduledClose-f.cutoffOffset;
 if(m.scheduledOpen>opens||opens>=cutoff||cutoff>=m.scheduledClose||now<opens||now>=cutoff)fail('InvalidCoverWindow');
 if(q.snapshotMultiplierNumerator===0n||q.snapshotMultiplierDenominator===0n)fail('InvalidMultiplier');
 const r=requireReference(q.assetId,m,now);
 // Solidity's identity OR short-circuits before the potentially overflowing conversion.
 if(r.reportHash!==q.referenceReportHash||r.configHash!==q.configHash||r.sessionId!==q.sessionId)fail('ReferenceFactsMismatch');
 const price=mulDivDown(r.price,r.multiplierNumerator*q.snapshotMultiplierDenominator,r.multiplierDenominator*q.snapshotMultiplierNumerator);
 if(q.referencePrice!==price)fail('ReferenceFactsMismatch');
 if(q.policyHash!==policyHash(f.chainId,f.manager,q.assetId,q.sessionId,q.configHash,q.snapshotMultiplierNumerator,q.snapshotMultiplierDenominator,f.profile,f.opensOffset,f.cutoffOffset))fail('InvalidPolicy');
 return constructReceipt(q,c,ids,hashes,offers,actualHashes,identity,now,f);
}
export function liquidationPlan(due:bigint,shares:bigint,price:bigint,trigger:bigint,target:bigint):{repaid:bigint;shares:bigint;badDebt:bigint}{
 if(due<=debtLimit(shares,price,trigger))fail('HealthyLoan');if(target*10550n>=100000000n)fail('UnsupportedLiquidationTarget');
 const value=mulDivDown(shares,price,10n**18n),targetDebt=mulDivDown(value,target,10000n);
 let repaid=mulDivUp(due-targetDebt,100000000n,100000000n-target*10550n);if(repaid>due)repaid=due;
 const all=mulDivUp(shares*10000n,price,10550n*10n**18n);
 if(repaid>=all){repaid=mulDivDown(value,10000n,10550n);return {repaid,shares,badDebt:due-repaid};}
 if(price>((1n<<256n)-1n)/10000n)fail('UnsupportedPrice');
 return {repaid,shares:mulDivDown(repaid,10550n*10n**18n,10000n*price),badDebt:0n};
}
