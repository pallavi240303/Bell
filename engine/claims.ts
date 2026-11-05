import { shares, mulDivDown } from './math.ts';
import { fail, uint } from './types.ts';
export function convertedUnits(amount: bigint, snapshotN: bigint, snapshotD: bigint, reportN: bigint, reportD: bigint): bigint {
  shares(amount); if (amount === 0n) fail('UnsupportedShareAmount');
  uint(snapshotN, 128n); uint(snapshotD, 128n); uint(reportN, 128n); uint(reportD, 128n);
  if (reportN === 0n || reportD === 0n) fail('InvalidMultiplier');
  return mulDivDown(amount, reportN * snapshotD, reportD * snapshotN);
}
