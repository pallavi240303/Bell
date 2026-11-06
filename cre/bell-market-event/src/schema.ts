import { z } from 'zod';
export const uint = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(s => s.toLowerCase() as `0x${string}`);
export const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(s => s.toLowerCase() as `0x${string}`);
const endpoint = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), url: z.string().url() }).strict();
export const configSchema = z.object({
    mode: z.enum(['live', 'replay']), chainName: z.string().min(1), chainSelector: uint, chainId: uint,
    oracle: address, registry: address, configVersion: uint, assetId: bytes32, sessionId: bytes32, referenceSessionId: bytes32,
    liveReceiver: address, simulationReceiver: address, liveForwarder: address, simulationForwarder: address,
    workflowId: bytes32, workflowOwner: address, cron: z.string().min(1), gasLimit: uint,
    maxAgeSeconds: uint, maxValiditySeconds: uint, agreementBps: uint, extremeMoveBps: uint,
    maxReadAttempts: z.number().int().min(1).max(3),
    providers: z.object({ calendar: endpoint, primary: endpoint, secondary: endpoint, corporate: endpoint }).strict(),
    replay: z.unknown().optional(),
}).strict();
export const evidenceSchema = z.object({ providerId: z.string(), url: z.string().url(), responseHash: bytes32, observedAt: uint, price: uint.optional(), corroborated: z.boolean().optional() });
export const benchmarkEvidenceSchema = evidenceSchema.extend({ assetId: bytes32, sessionId: bytes32 });
export const corporateSchema = evidenceSchema.extend({ assetId: bytes32, action: z.number().int().min(0).max(5), actionId: bytes32, multiplierNumerator: uint, multiplierDenominator: uint });
export const calendarSchema = evidenceSchema.extend({ status: z.enum(['SCHEDULED', 'OPEN', 'CLOSED', 'HALTED']), scheduledOpen: uint, scheduledClose: uint, scheduledReopen: uint, validUntil: uint });
export const bundleSchema = z.object({ kind: z.number().int().min(1).max(5), assetId: bytes32, sessionId: bytes32, configHash: bytes32, calendar: calendarSchema, primary: benchmarkEvidenceSchema.optional(), secondary: benchmarkEvidenceSchema.optional(), corporate: corporateSchema.optional() });
const corporateFact = z.object({ action: z.number().int().min(0).max(5), actionId: bytes32, multiplierNumerator: uint, multiplierDenominator: uint, observedAt: uint });
export const stateSchema = z.object({
    chainId: uint, oracle: address, receiver: address, forwarder: address, workflowId: bytes32, workflowOwner: address, assetId: bytes32,
    registryConfigHash: bytes32, configEffectiveAt: uint, supportedCorporateActions: z.number().int().min(0).max(255),
    nextNonce: uint, stateHash: bytes32, configHash: bytes32, activeSessionId: bytes32, activePhase: z.number().int().min(0).max(3), halted: z.boolean(),
    session: z.object({ assetId: bytes32, configHash: bytes32, scheduledOpen: uint, scheduledClose: uint, closeObservedAt: uint, phase: z.number().int().min(0).max(3) }),
    benchmarkFinalized: z.boolean(), referencePrice: uint, corporate: corporateFact,
});
export type Config = z.infer<typeof configSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type ObservationBundle = z.infer<typeof bundleSchema>;
export type ArcState = z.infer<typeof stateSchema>;
