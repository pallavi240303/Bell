import { z } from 'zod';
export const uint = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(s => s.toLowerCase() as `0x${string}`);
export const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(s => s.toLowerCase() as `0x${string}`);
// Javy has no WHATWG URL constructor. Parse only the credential-free HTTPS
// DNS endpoint subset used here, without browser normalization or polyfills.
export function httpsOrigin(value: string): string {
    const m = /^https:\/\/([^/:?#]+)(?::([0-9]{1,5}))?(\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?$/i.exec(value);
    if (!m || m[0] !== value || /%(?![0-9a-fA-F]{2})/.test(m[3] ?? '')) throw new Error('PUBLIC_ENDPOINT');
    const host = m[1]!.toLowerCase().replace(/\.$/, '');
    const labels = host.split('.');
    // WHATWG treats numeric final labels (including hex forms) as IPv4, not
    // DNS. Reject them so distinct spellings cannot bypass origin independence.
    if (/^(?:[0-9]+|0x[0-9a-f]*)$/.test(labels.at(-1)!)) throw new Error('PUBLIC_ENDPOINT');
    if (host.length > 253 || !labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw new Error('PUBLIC_ENDPOINT');
    const port = m[2] === undefined ? 443 : Number(m[2]);
    if (port < 1 || port > 65535) throw new Error('PUBLIC_ENDPOINT');
    return `https://${host}${port === 443 ? '' : `:${port}`}`;
}
const publicHttps = z.string().refine(value => { try { httpsOrigin(value); return true; } catch { return false; } }, 'Invalid public HTTPS endpoint');
const endpoint = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), url: publicHttps }).strict();
export const configSchema = z.object({
    mode: z.enum(['live', 'replay']), chainName: z.string().min(1), chainSelector: uint, chainId: uint,
    dataSource: z.enum(['quote-snapshot', 'gpro-history']).optional(),
    historical: z.object({ stage: z.enum(['origination', 'cover', 'reopen']) }).strict().optional(),
    quote: z.object({ symbol: z.literal('NVDA'), assetId: bytes32, sessionId: bytes32, secretIds: z.object({ finnhub: z.literal('FINNHUB_API_KEY'), twelvedata: z.literal('TWELVEDATA_API_KEY') }).strict() }).strict().optional(),
    oracle: address, registry: address, configVersion: uint, assetId: bytes32, sessionId: bytes32, referenceSessionId: bytes32,
    liveReceiver: address, simulationReceiver: address, liveForwarder: address, simulationForwarder: address,
    workflowId: bytes32, workflowOwner: address, cron: z.string().min(1), gasLimit: uint,
    maxAgeSeconds: uint, maxValiditySeconds: uint, agreementBps: uint, extremeMoveBps: uint,
    maxReadAttempts: z.number().int().min(1).max(3),
    providers: z.object({ calendar: endpoint, primary: endpoint, secondary: endpoint, corporate: endpoint }).strict(),
    replay: z.unknown().optional(),
}).strict();
export const evidenceSchema = z.object({ providerId: z.string(), url: publicHttps, responseHash: bytes32, observedAt: uint, price: uint.optional(), corroborated: z.boolean().optional() });
export const benchmarkEvidenceSchema = evidenceSchema.extend({ assetId: bytes32, sessionId: bytes32 });
export const corporateSchema = evidenceSchema.extend({ assetId: bytes32, action: z.number().int().min(0).max(5), actionId: bytes32, multiplierNumerator: uint, multiplierDenominator: uint });
export const calendarSchema = evidenceSchema.extend({ status: z.enum(['SCHEDULED', 'OPEN', 'CLOSED', 'HALTED']), scheduledOpen: uint, scheduledClose: uint, scheduledReopen: uint, validUntil: uint, assetId: bytes32.optional(), sessionId: bytes32.optional(), configHash: bytes32.optional() });
export const bundleSchema = z.object({ kind: z.number().int().min(1).max(6), assetId: bytes32, sessionId: bytes32, configHash: bytes32, calendar: calendarSchema, primary: benchmarkEvidenceSchema.optional(), secondary: benchmarkEvidenceSchema.optional(), corporate: corporateSchema.optional() });
const corporateFact = z.object({ action: z.number().int().min(0).max(5), actionId: bytes32, multiplierNumerator: uint, multiplierDenominator: uint, observedAt: uint, reportHash: bytes32.optional() });
export const referenceFactSchema = z.object({ assetId: bytes32, sessionId: bytes32, configHash: bytes32, price: uint, multiplierNumerator: uint, multiplierDenominator: uint, observedAt: uint, validUntil: uint, corporateActionHash: bytes32, primarySourceHash: bytes32, secondarySourceHash: bytes32, reportHash: bytes32 });
const sessionFactSchema = z.object({ assetId: bytes32, configHash: bytes32, scheduledOpen: uint, scheduledClose: uint, closeObservedAt: uint, phase: z.number().int().min(0).max(3) });
export const stateSchema = z.object({
    chainId: uint, oracle: address, receiver: address, forwarder: address, workflowId: bytes32, workflowOwner: address, assetId: bytes32,
    registryConfigHash: bytes32, configEffectiveAt: uint, supportedCorporateActions: z.number().int().min(0).max(255),
    nextNonce: uint, stateHash: bytes32, configHash: bytes32, activeSessionId: bytes32, activePhase: z.number().int().min(0).max(3), halted: z.boolean(),
    session: z.object({ assetId: bytes32, configHash: bytes32, scheduledOpen: uint, scheduledClose: uint, closeObservedAt: uint, phase: z.number().int().min(0).max(3) }),
    benchmarkFinalized: z.boolean(), referencePrice: uint, corporate: corporateFact,
    latestCorporateActionHash: bytes32.optional(), activeSession: sessionFactSchema.optional(), latestReference: referenceFactSchema.optional(),
});
export type Config = z.infer<typeof configSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type ObservationBundle = z.infer<typeof bundleSchema>;
export type ArcState = z.infer<typeof stateSchema>;
