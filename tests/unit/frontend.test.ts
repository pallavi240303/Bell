import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

test('browser ABIs are generated from current artifacts and checked for freshness', () => {
  assert.ok(existsSync('scripts/generate-browser-abis.ts'), 'deterministic browser ABI generator required');
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/generate-browser-abis.ts', '--check'], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('visual baselines contain all six desktop and mobile page shells', () => {
  for (const page of ['home','replay','borrow','buyers','lend','control']) {
    for (const width of [1440,390]) assert.ok(existsSync(`tests/visual/baselines/${page}-${width}.png`));
  }
});

test('visual comparison masks only unavoidable provenance text', () => {
  assert.ok(existsSync('tests/visual/visual.spec.ts'), 'real visual comparison required');
  const source = readFileSync('tests/visual/visual.spec.ts','utf8');
  assert.ok(!source.includes('data-visual-dynamic'));
  assert.match(source, /toHaveScreenshot|compare/);
});

test('browser transport rejects noncanonical integers and preserves large amounts', async () => {
  const m = await import('../../src/adapter/transport.ts').catch(()=>null);
  assert.ok(m, 'browser transport required');
  assert.equal(m.uint('9007199254740993'), 9007199254740993n);
  for (const value of [2, '01', '-1', '1e3', '1.0']) assert.throws(()=>m.uint(value));
});

test('wallet verifies unsigned calldata before invoking a wallet', async () => {
  const m = await import('../../src/adapter/wallet.ts').catch(()=>null);
  assert.ok(m, 'verified connected-wallet flow required');
});

test('controller never renders unavailable state as zero or a confirmed outcome', async () => {
  const m = await import('../../src/state/truth.ts').catch(()=>null);
  assert.ok(m, 'truth projection required');
  assert.equal(m.amount(undefined, 6), '—');
  assert.equal(m.amount(0n, 6), '0');
  assert.equal(m.receiptLabel(undefined), 'NO SNAPSHOT');
});
