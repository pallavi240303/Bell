export type QuoteProvider = 'finnhub' | 'twelvedata';
export interface QuoteBinding { symbol: string; assetId: `0x${string}`; sessionId: `0x${string}` }
import { validateConfig } from './core.ts';
import { bundleSchema, type Config } from './schema.ts';
import { publicEvidence } from './adapters.ts';
import { zeroHash } from 'viem';
export function observeQuoteSnapshot(input: unknown, get: (provider: QuoteProvider) => string, getFacts?: (key: keyof Config['providers']) => string) {
    const c = validateConfig(input);
    if (c.dataSource !== 'quote-snapshot' || !c.quote || c.quote.assetId !== c.assetId) throw new Error('QUOTE_BINDING');
    let b;
    if (c.mode === 'live') {
        if (!getFacts) throw new Error('QUOTE_NOT_OFFICIAL_REOPEN');
        const calendar = publicEvidence(c, 'calendar', getFacts('calendar'));
        if (calendar.kind !== 6) throw new Error('QUOTE_NOT_OFFICIAL_REOPEN');
        b = bundleSchema.parse({ kind: 6, assetId: calendar.assetId, sessionId: zeroHash, configHash: calendar.configHash,
            calendar, corporate: publicEvidence(c, 'corporate', getFacts('corporate')) });
    } else b = bundleSchema.parse(c.replay);
    const sourceSession = b.kind === 6 ? b.calendar.sessionId : b.sessionId;
    if ((b.kind !== 3 && b.kind !== 6) || b.assetId !== c.assetId || c.quote.sessionId !== sourceSession
        || (b.kind === 3 && b.sessionId !== c.sessionId)) throw new Error('QUOTE_BINDING');
    for (const [key, provider] of [['primary', 'finnhub'], ['secondary', 'twelvedata']] as const) {
        if (c.providers[key].id !== provider || c.providers[key].url !== quoteEndpoints[provider]) throw new Error('QUOTE_BINDING');
    }
    return bundleSchema.parse({ ...b, primary: normalizeQuote('finnhub', get('finnhub'), c.quote), secondary: normalizeQuote('twelvedata', get('twelvedata'), c.quote) });
}
import { keccak256, toHex } from 'viem';
export const quoteEndpoints = { finnhub: 'https://finnhub.io/api/v1/quote', twelvedata: 'https://api.twelvedata.com/quote' } as const;
function checkBinding(b: QuoteBinding) {
    if (b.symbol !== 'NVDA' || !/^0x[0-9a-fA-F]{64}$/.test(b.assetId) || !/^0x[0-9a-fA-F]{64}$/.test(b.sessionId)) throw new Error('QUOTE_BINDING');
}
export function normalizeQuote(provider: QuoteProvider, raw: string, binding: QuoteBinding) {
    checkBinding(binding);
    try {
        if (raw.length > 32768) throw new Error();
        // Validate the original grammar; never use this parse's rounded values.
        JSON.parse(raw);
        // Preserve JSON numeric lexemes before JSON.parse can round them. String
        // tokens consume escapes, so numbers inside strings are never rewritten.
        const objects: Set<string>[] = [];
        const exact = raw.replace(/"(?:[^"\\]|\\.)*"|[{}]|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/g, (token, offset: number) => {
            if (token === '{') { objects.push(new Set<string>()); return token; }
            if (token === '}') { objects.pop(); return token; }
            if (token.startsWith('"')) {
                if (/^\s*:/.test(raw.slice(offset + token.length))) {
                    const key = JSON.parse(token) as string;
                    const keys = objects.at(-1)!;
                    if (keys.has(key)) throw new Error();
                    keys.add(key);
                }
                return token;
            }
            return JSON.stringify(token);
        });
        const v = JSON.parse(exact);
        if (!v || Array.isArray(v) || typeof v !== 'object' || 'error' in v || v.status === 'error' || 'code' in v) throw new Error();
        if (provider === 'twelvedata' && v.symbol !== binding.symbol) throw new Error();
        const price = provider === 'finnhub' ? v.c : v.close;
        const time = provider === 'finnhub' ? v.t : v.timestamp;
        if (typeof price !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(price) || typeof time !== 'string' || !/^[1-9][0-9]*$/.test(time)) throw new Error();
        const [whole, fraction = ''] = price.split('.');
        const units = BigInt(whole!) * 1000000n + BigInt(fraction.padEnd(6, '0'));
        if (units <= 0n || units >= 2n ** 256n || BigInt(time) >= 2n ** 64n) throw new Error();
        return { ...binding, providerId: provider, url: quoteEndpoints[provider], responseHash: keccak256(toHex(raw)), observedAt: time, price: units.toString(), benchmarkKind: 'current-quote' as const };
    } catch { throw new Error('QUOTE_INVALID'); }
}
export function quoteRequest(provider: QuoteProvider, binding: QuoteBinding, secret: string): { url: string; method: string; headers: Record<string, string>; timeout: string } {
    checkBinding(binding);
    if (!secret || /[\r\n]/.test(secret)) throw new Error('QUOTE_SECRET_UNAVAILABLE');
    return { url: `${quoteEndpoints[provider]}?symbol=NVDA${provider === 'twelvedata' ? `&apikey=${encodeURIComponent(secret)}` : ''}`, method: 'GET', headers: provider === 'finnhub' ? { 'X-Finnhub-Token': secret } : {}, timeout: '5s' };
}
