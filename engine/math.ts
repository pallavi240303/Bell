import { MAX_UINT, MAX_CASH, MAX_SHARES, MAX_PRICE } from './params.ts';
import { fail, uint } from './types.ts';
export function mulDivDown(x: bigint, y: bigint, denominator: bigint): bigint {
  uint(x); uint(y); uint(denominator);
  if (denominator === 0n) fail('ZeroDenominator');
  const result = x * y / denominator;
  if (result > MAX_UINT) fail('MathResultOverflow');
  return result;
}
export function mulDivUp(x: bigint, y: bigint, denominator: bigint): bigint {
  const result = mulDivDown(x, y, denominator);
  if (x * y % denominator === 0n) return result;
  if (result === MAX_UINT) fail('MathResultOverflow');
  return result + 1n;
}
export function checked(x: bigint): bigint { if (x < 0n || x > MAX_UINT) fail('Panic', 0x11n); return x; }
export function cash(x: bigint): void { uint(x); if (x > MAX_CASH) fail('UnsupportedCashAmount'); }
export function shares(x: bigint): void { uint(x); if (x > MAX_SHARES) fail('UnsupportedShareAmount'); }
export function price(x: bigint): void { uint(x); if (x > MAX_PRICE) fail('UnsupportedPrice'); }
export function min(a: bigint, b: bigint): bigint { return a < b ? a : b; }
