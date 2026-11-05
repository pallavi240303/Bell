import test from 'node:test';
import assert from 'node:assert/strict';
test('full width arithmetic and Solidity error precedence', async () => {
  const m = await import('./math.ts');
  assert.equal(m.mulDivDown(1n << 200n, 1n << 100n, 1n << 100n), 1n << 200n);
  assert.equal(m.mulDivUp(10n, 10n, 3n), 34n);
  assert.throws(() => m.mulDivDown(0n, 0n, 0n), { name: 'ZeroDenominator', args: [] });
  assert.throws(() => m.mulDivDown(1n << 255n, 2n, 1n), { name: 'MathResultOverflow', args: [] });
});
test('interest uses original principal, upward rounding, capped time, and cash domain', async () => {
  const m = await import('./interest.ts');
  assert.equal(m.debt(100n, 1n, 10n, 20n, 100n, 3n, 50n), 384n);
  assert.equal(m.debt(100n, 1n, 10n, 20n, 1n, 3n, 101n), 0n);
  assert.throws(() => m.debt(0n, 10001n, 20n, 10n, 0n, 0n, 0n), { name: 'InvalidTimeRange' });
  assert.throws(() => m.interest(1n << 128n, 0n, 0n, 1n), { name: 'UnsupportedCashAmount' });
});
