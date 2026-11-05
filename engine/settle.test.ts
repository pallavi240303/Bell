import test from 'node:test';
import assert from 'node:assert/strict';
test('cumulative cash rounding and smallest shares crossing cash boundary', async () => {
  const m = await import('./settle.ts');
  assert.equal(m.cashDelta(1n, 2n, 1n), 0n);
  assert.deepEqual(m.minimumSharesForCash(1n, 10n ** 18n + 1n, 1n, 1n), [10n ** 18n, 1n]);
  assert.throws(() => m.cashDelta(2n, 1n, 0n), { name: 'CumulativeSharesDecrease' });
});
test('normal target, healthy, terminal closure, excess, exact failure args and fill slots', async () => {
  const m = await import('./settle.ts');
  const lot = { strike: 100n, totalShares: 10n ** 19n, exercisedShares: 0n };
  assert.equal(m.planNormal(500n, 10n ** 19n, 100n, 7500n, 6500n, [lot]).outcome, 0n);
  const plan = m.planNormal(500n, 10n ** 19n, 60n, 7500n, 6500n, [lot]);
  assert.equal(plan.outcome, 1n); assert.ok(m.isAtOrBelowTarget(plan.debtAfter, plan.collateralAfter, 60n, 6500n));
  assert.equal(m.planNormal(500n, 10n ** 19n, 0n, 7500n, 6500n, [lot]).debtAfter, 0n);
  assert.throws(() => m.planNormal(1001n, 10n ** 19n, 0n, 7500n, 6500n, [lot]), { name: 'InsufficientFundedCapacity', args: [1000n, 1001n] });
  assert.throws(() => m.planNormal(0n, 0n, 0n, 7500n, 6500n, Array(9).fill(lot)), { name: 'TooManyFills', args: [9n] });
  assert.equal(m.planNormal(1n, 1n, 0n, 7500n, 6500n, [{ strike: 10n ** 19n, totalShares: 1n, exercisedShares: 0n }]).borrowerExcess, 9n);
});
