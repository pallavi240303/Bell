import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
test('SDK and compiler are isolated, exact pinned, and runtime code excludes nondeterministic APIs', () => {
    const p = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
    assert.equal(p.dependencies['@chainlink/cre-sdk'], '1.23.0');
    assert.equal(lock.packages['node_modules/@chainlink/cre-sdk'].version, '1.23.0');
    assert.equal(p.engines.bun, '>=1.2.21');
    assert.match(p.scripts.build, /cre-compile/);
    for (const file of ['core', 'schema', 'adapters', 'workflow', 'main', 'quotes']) {
        const source = readFileSync(new URL(`../src/${file}.ts`, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /Date\.now|Math\.random|Promise\.race|process\.env|privateKeyToAccount|node:/);
    }
});
test('toolchain checker reports real versions and missing tools honestly', () => {
    const result = spawnSync(process.execPath, ['scripts/toolchain.mjs'], { cwd: new URL('../', import.meta.url), encoding: 'utf8', env: { ...process.env, PATH: '/nonexistent' } });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /MISSING.*bun/);
    assert.match(result.stdout, /MISSING.*cre/);
});
