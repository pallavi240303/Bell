import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeQuote, quoteRequest } from '../src/quotes.ts';
import { hash } from './fixtures.ts';
import { fixture } from './fixtures.ts';
import { observeQuoteSnapshot } from '../src/quotes.ts';
import { decide, execute } from '../src/core.ts';
const binding = { symbol: 'NVDA', assetId: hash('asset'), sessionId: hash('session') };
test('quote conversion preserves exact decimal digits and provider timestamp', () => {
    const q = normalizeQuote('twelvedata', '{"symbol":"NVDA","close":"123.456789","timestamp":1000}', binding);
    assert.equal(q.price, '123456789');
    assert.equal(q.observedAt, '1000');
    assert.equal(q.sessionId, binding.sessionId);
    assert.equal(q.assetId, binding.assetId);
    assert.equal(q.benchmarkKind, 'current-quote');
    assert.equal(q.responseHash, hash('{"symbol":"NVDA","close":"123.456789","timestamp":1000}'));
});
test('Finnhub numeric lexeme is converted without floating point arithmetic', () => {
    const q = normalizeQuote('finnhub', '{"c":9007199254.740991,"t":999}', binding);
    assert.equal(q.price, '9007199254740991');
    assert.equal(q.observedAt, '999');
});
test('Twelve Data accepts low/high repeated across distinct nested objects', () => {
    const raw = String.raw`{
        "symbol":"NVDA","name":"NVIDIA Corp","exchange":"NASDAQ","mic_code":"XNAS","currency":"USD",
        "timestamp":1000,"open":"140.00000","high":"141.00000","low":"139.00000","close":"140.123456",
        "volume":"1000000","previous_close":"139.00000","change":"1.123456","percent_change":"0.8","is_market_open":true,
        "fifty_two_week":{"low":"80.00000","high":"200.00000","low_change":"60.123456","high_change":"-59.876544","range":"80 - 200"},
        "ranges":[{"low":"130","high":"150"},{"low":"120","high":"160"}],
        "note":"quoted braces { } and escaped quote \" stay in the string"
    }`;
    const q = normalizeQuote('twelvedata', raw, binding);
    assert.equal(q.price, '140123456');
    assert.equal(q.observedAt, '1000');
    assert.equal(q.responseHash, hash(raw));
});
test('same-object duplicate keys reject at every depth including escaped aliases', () => {
    for (const raw of [
        String.raw`{"c":1,"t":1,"meta":{"low":1,"low":2}}`,
        String.raw`{"c":1,"t":1,"meta":{"value":1,"\u0076alue":2}}`,
        String.raw`{"c":1,"\u0063":2,"t":1}`,
        String.raw`{"c":1,"meta":{},"c":2,"t":1}`,
        String.raw`{"c":1,"t":1,"items":[{"low":1,"low":2}]}`,
    ]) assert.throws(() => normalizeQuote('finnhub', raw, binding), /^Error: QUOTE_INVALID$/);
});
test('unquoted numeric object keys cannot be repaired into valid provider JSON', () => {
    assert.throws(() => normalizeQuote('finnhub', '{"c":1,"t":1,2:3}', binding), /^Error: QUOTE_INVALID$/);
});
test('invalid, absent, excessive precision, mismatched and error quotes reject with sanitized codes', () => {
    for (const raw of ['{}', '{"c":0,"t":1}', '{"c":1.0000001,"t":1}', '{"c":1,"t":0}', '{"c":1,"t":1,"error":"secret"}', '{"c":1,"c":2,"t":1}', 'not-json'])
        assert.throws(() => normalizeQuote('finnhub', raw, binding), /^Error: QUOTE_INVALID$/);
    assert.throws(() => normalizeQuote('twelvedata', '{"symbol":"AAPL","close":"1","timestamp":1}', binding), /^Error: QUOTE_INVALID$/);
});
test('credentials only enter fixed official requests and never evidence identity', () => {
    assert.deepEqual(quoteRequest('finnhub', binding, 'test-key'), { url: 'https://finnhub.io/api/v1/quote?symbol=NVDA', method: 'GET', headers: { 'X-Finnhub-Token': 'test-key' }, timeout: '5s' });
    assert.equal(quoteRequest('twelvedata', binding, 'test-key').url, 'https://api.twelvedata.com/quote?symbol=NVDA&apikey=test-key');
    assert.throws(() => quoteRequest('finnhub', { ...binding, symbol: 'NVDA&url=evil' }, 'test-key'), /^Error: QUOTE_BINDING$/);
});
test('snapshot uses bound quotes with explicit replay facts and ordinary freshness checks', () => {
    const f = fixture();
    const c = { ...f.config, dataSource: 'quote-snapshot', quote: { ...binding, secretIds: { finnhub: 'FINNHUB_API_KEY', twelvedata: 'TWELVEDATA_API_KEY' } }, replay: f.bundle };
    c.providers.primary = { id: 'finnhub', url: 'https://finnhub.io/api/v1/quote' };
    c.providers.secondary = { id: 'twelvedata', url: 'https://api.twelvedata.com/quote' };
    const get = (p: string) => p === 'finnhub' ? '{"c":140,"t":1000}' : '{"symbol":"NVDA","close":"140","timestamp":1000}';
    const b = observeQuoteSnapshot(c, get);
    assert.equal(decide(c, b, f.state, 1000n).status, 'submit');
    const freshFacts = { ...b, calendar: { ...b.calendar, observedAt: '3000', validUntil: '3100' }, corporate: { ...b.corporate, observedAt: '3000' } };
    assert.deepEqual(decide(c, freshFacts, f.state, 3000n), { status: 'reject', reason: 'SOURCE_FRESHNESS' });
    assert.deepEqual(decide(c, { ...b, primary: { ...b.primary, observedAt: '1001' } }, f.state, 1000n), { status: 'reject', reason: 'SOURCE_FRESHNESS' });
    assert.deepEqual(decide(c, { ...b, secondary: { ...b.secondary, price: '150000000' } }, f.state, 1000n), { status: 'reject', reason: 'SOURCE_AGREEMENT' });
    assert.throws(() => observeQuoteSnapshot({ ...c, mode: 'live' }, get), /^Error: QUOTE_NOT_OFFICIAL_REOPEN$/);
    assert.throws(() => observeQuoteSnapshot({ ...c, quote: { ...c.quote, sessionId: hash('wrong') } }, get), /^Error: QUOTE_BINDING$/);
    assert.throws(() => observeQuoteSnapshot({ ...c, replay: undefined }, get));
    assert.throws(() => observeQuoteSnapshot({ ...c, providers: { ...c.providers, primary: { id: 'finnhub', url: 'https://evil.example/quote' } } }, () => { throw new Error('must not request'); }), /^Error: QUOTE_BINDING$/);
});
test('provider rejection is actionable without disclosing capability error bodies', () => {
    const f = fixture();
    for (const [message, reason] of [['QUOTE_INVALID', 'QUOTE_INVALID'], ['provider echoed test-key', 'READ_FAILED']]) {
        const logs: string[] = [];
        const r = execute(f.config, { now: () => f.now, readState: () => f.state, observe: () => { throw new Error(message); }, submit: () => { throw new Error('must not write'); }, log: s => logs.push(s) });
        assert.equal(r.reason, reason);
        assert.ok(logs.every(l => !l.includes('test-key')));
    }
});
test('snapshot cannot select unrelated runtime secrets as provider credentials', () => {
    const f = fixture();
    let requests = 0;
    const c = { ...f.config, dataSource: 'quote-snapshot', replay: f.bundle, quote: { ...binding, secretIds: { finnhub: 'DEPLOYER_PRIVATE_KEY', twelvedata: 'TWELVEDATA_API_KEY' } }, providers: { ...f.config.providers, primary: { id: 'finnhub', url: 'https://finnhub.io/api/v1/quote' }, secondary: { id: 'twelvedata', url: 'https://api.twelvedata.com/quote' } } };
    assert.throws(() => observeQuoteSnapshot(c, () => { requests++; throw new Error('request occurred'); }), /Invalid literal value/);
    assert.equal(requests, 0);
});
