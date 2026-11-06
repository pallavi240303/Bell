import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configSchema, evidenceSchema } from '../src/schema.ts';
import { decide, validateConfig } from '../src/core.ts';
import { fixture } from './fixtures.ts';

test('config, evidence and source independence work when WASM has no URL constructor', () => {
    const f = fixture();
    const previous = globalThis.URL;
    try {
        Object.defineProperty(globalThis, 'URL', { value: undefined, configurable: true, writable: true });
        assert.equal(configSchema.parse(f.config).providers.primary.url, 'https://primary.example/evidence');
        assert.equal(evidenceSchema.parse(f.bundle.primary).price, '125000000');
        assert.equal(decide(f.config, f.bundle, f.state, f.now).status, 'submit');
    } finally { globalThis.URL = previous; }
});

test('configured evidence URLs reject credentials, query, fragments and ambiguous authorities', () => {
    for (const url of ['http://provider.example/path', 'https://user:pass@provider.example/path', 'https://provider.example/path?key=value', 'https://provider.example/path#fragment', 'https://provider.example\\@evil.example/path', 'https://provider..example/path', 'https://-provider.example/path', 'https://provider.example:65536/path', ' https://provider.example/path', 'https://provider.example/%zz', 'https://127.1/path', 'https://[::1]/path']) {
        const f = fixture();
        f.config.providers.primary.url = url;
        assert.throws(() => validateConfig(f.config));
    }
});

test('equivalent DNS case and default HTTPS port cannot impersonate independent sources', () => {
    const f = fixture();
    f.config.providers.secondary.url = 'https://PRIMARY.example:443/confirmation';
    f.bundle.secondary.url = f.config.providers.secondary.url;
    assert.deepEqual(decide(f.config, f.bundle, f.state, f.now), { status: 'reject', reason: 'INDEPENDENT_EVIDENCE' });
});

test('hexadecimal IPv4 host aliases cannot masquerade as independent DNS sources', () => {
    const f = fixture();
    f.config.providers.primary.url = 'https://0x7f000001/evidence';
    f.bundle.primary.url = f.config.providers.primary.url;
    f.config.providers.secondary.url = 'https://0x07f000001/confirmation';
    f.bundle.secondary.url = f.config.providers.secondary.url;
    assert.equal(decide(f.config, f.bundle, f.state, f.now).status, 'reject');
    for (const url of [f.config.providers.primary.url, f.config.providers.secondary.url, 'https://0x/path', 'https://127.0.0.0x1/path']) {
        const clean = fixture();
        clean.config.providers.primary.url = url;
        assert.throws(() => validateConfig(clean.config));
        assert.throws(() => evidenceSchema.parse({ ...clean.bundle.primary, url }));
    }
});
