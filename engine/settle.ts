import { BPS, SHARE_SCALE } from './params.ts';
import { cash, shares, price, min, mulDivDown, mulDivUp } from './math.ts';
import { fail, uint, type Lot, type Plan } from './types.ts';
export function cashOwed(cumulative: bigint, strike: bigint): bigint { shares(cumulative); price(strike); const result = mulDivUp(cumulative, strike, SHARE_SCALE); cash(result); return result; }
export function cashDelta(old: bigint, next: bigint, strike: bigint): bigint { uint(old); uint(next); if (next < old) fail('CumulativeSharesDecrease'); return cashOwed(next, strike) - cashOwed(old, strike); }
export function minimumSharesForCash(old: bigint, total: bigint, strike: bigint, target: bigint): [bigint, bigint] {
  shares(old); shares(total); cash(target); price(strike);
  if (strike === 0n) fail('ZeroStrike');
  if (old > total) fail('InvalidLotShares');
  if (target === 0n || old === total) return [0n, 0n];
  const desired = cashOwed(old, strike) + target; cash(desired);
  const cumulative = min(mulDivDown(desired - 1n, SHARE_SCALE, strike) + 1n, total);
  return cumulative <= old ? [0n, 0n] : [cumulative - old, cashDelta(old, cumulative, strike)];
}
function position(d: bigint, c: bigint, p: bigint): void { cash(d); shares(c); price(p); }
export function isAtOrBelowTarget(d: bigint, c: bigint, p: bigint, ltv: bigint): boolean {
  position(d, c, p); uint(ltv, 16n); if (ltv > BPS) fail('InvalidSettlementLtv');
  return d * BPS * SHARE_SCALE <= c * p * ltv;
}
export function isUnsafe(d: bigint, c: bigint, p: bigint, ltv: bigint): boolean { return !isAtOrBelowTarget(d, c, p, ltv); }
export function planNormal(d: bigint, c: bigint, p: bigint, trigger: bigint, target: bigint, lots: readonly Lot[]): Plan {
  position(d, c, p); uint(trigger, 16n); uint(target, 16n);
  if (target === 0n || target >= trigger || trigger > BPS) fail('InvalidSettlementLtv');
  if (lots.length > 8) fail('TooManyFills', BigInt(lots.length));
  for (const lot of lots) {
    price(lot.strike); if (lot.strike === 0n) fail('ZeroStrike');
    shares(lot.totalShares); shares(lot.exercisedShares);
    if (lot.exercisedShares > lot.totalShares) fail('InvalidLotShares');
    cashOwed(lot.totalShares, lot.strike);
  }
  const plan: Plan = { outcome: 0n, fills: lots.map(() => ({ additionalShares: 0n, cashCharged: 0n, debtApplied: 0n, borrowerExcess: 0n })), fillCount: 0n, debtAfter: d, collateralAfter: c, borrowerExcess: 0n };
  if (!isUnsafe(d, c, p, trigger)) return plan;
  let force = p === 0n;
  const apply = (index: number, amount: bigint, charged: bigint) => {
    const applied = min(charged, plan.debtAfter), excess = charged - applied;
    plan.fills[index] = { additionalShares: amount, cashCharged: charged, debtApplied: applied, borrowerExcess: excess };
    plan.fillCount += 1n; plan.debtAfter -= applied; plan.collateralAfter -= amount; plan.borrowerExcess += excess;
  };
  for (const [i, lot] of lots.entries()) {
    if (plan.debtAfter === 0n) break;
    const remaining = min(lot.totalShares - lot.exercisedShares, plan.collateralAfter);
    if (remaining === 0n) continue;
    const capped = lot.exercisedShares + remaining, capacity = cashDelta(lot.exercisedShares, capped, lot.strike);
    if (capacity === 0n) continue;
    if (!force) {
      if (mulDivUp(SHARE_SCALE, 1n, lot.strike) * p * target > BPS * SHARE_SCALE) force = true;
      else {
        const maximum = min(capacity, plan.debtAfter);
        const satisfies = (requested: bigint): boolean => {
          const [amount, charged] = minimumSharesForCash(lot.exercisedShares, capped, lot.strike, requested);
          return isAtOrBelowTarget(plan.debtAfter - min(charged, plan.debtAfter), plan.collateralAfter - amount, p, target);
        };
        if (maximum !== 0n && satisfies(maximum)) {
          let low = 1n, high = maximum;
          while (low < high) { const mid = low + (high - low) / 2n; if (satisfies(mid)) high = mid; else low = mid + 1n; }
          const [amount, charged] = minimumSharesForCash(lot.exercisedShares, capped, lot.strike, low);
          apply(i, amount, charged); plan.outcome = plan.debtAfter === 0n ? 2n : 1n; return plan;
        }
      }
    }
    const [amount, charged] = minimumSharesForCash(lot.exercisedShares, capped, lot.strike, force ? min(plan.debtAfter, capacity) : capacity);
    if (amount === 0n || charged === 0n) continue;
    apply(i, amount, charged);
    if (plan.debtAfter === 0n) { plan.outcome = 2n; return plan; }
    if (!force && isAtOrBelowTarget(plan.debtAfter, plan.collateralAfter, p, target)) { plan.outcome = 1n; return plan; }
  }
  fail('InsufficientFundedCapacity', d - plan.debtAfter, d);
}
