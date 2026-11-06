import { zeroHash } from 'viem';
import { fixture, hash } from './fixtures.ts';
export function marketFixture() {
 const f:any=fixture(), active=hash('active-open-session');
 f.bundle={...f.bundle,kind:6,sessionId:zeroHash,calendar:{...f.bundle.calendar,assetId:f.config.assetId,sessionId:active,configHash:f.state.configHash,status:'OPEN',scheduledOpen:'800',scheduledClose:'1600',scheduledReopen:'1700'},primary:{...f.bundle.primary,sessionId:active},secondary:{...f.bundle.secondary,sessionId:active}};
 f.state={...f.state,activeSessionId:active,activePhase:1,latestCorporateActionHash:zeroHash,activeSession:{assetId:f.config.assetId,configHash:f.state.configHash,scheduledOpen:'800',scheduledClose:'1600',closeObservedAt:'0',phase:1},corporate:{...f.state.corporate,reportHash:zeroHash},latestReference:{assetId:f.config.assetId,sessionId:active,configHash:f.state.configHash,price:'124000000',multiplierNumerator:'1',multiplierDenominator:'1',observedAt:'900',validUntil:'1100',corporateActionHash:zeroHash,primarySourceHash:hash('old-p'),secondarySourceHash:hash('old-s'),reportHash:hash('old-reference')}};
 return f;
}
