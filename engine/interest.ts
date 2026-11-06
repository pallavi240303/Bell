import { cash, mulDivUp } from './math.ts';
import { fail, uint } from './types.ts';
export function elapsed(start: bigint, deadline: bigint, timestamp: bigint): bigint {
  uint(start, 64n); uint(deadline, 64n); uint(timestamp, 64n);
  if (deadline < start) fail('InvalidTimeRange');
  if (timestamp <= start) return 0n;
  return (timestamp < deadline ? timestamp : deadline) - start;
}
export function interest(principal: bigint, rate: bigint, seconds: bigint, denominator: bigint): bigint {
  uint(rate, 32n); uint(seconds, 64n); uint(denominator); cash(principal);
  if (rate > 10000n) fail('UnsupportedRate');
  if (denominator === 0n) fail('ZeroDenominator');
  if (principal === 0n || rate === 0n || seconds === 0n) return 0n;
  const accrued = mulDivUp(principal, rate * seconds, denominator); cash(accrued); return accrued;
}
export function debt(principal: bigint, rate: bigint, start: bigint, deadline: bigint, timestamp: bigint, denominator: bigint, reduction: bigint): bigint {
  cash(principal); cash(reduction);
  const gross = principal + interest(principal, rate, elapsed(start, deadline, timestamp), denominator);
  cash(gross); return reduction >= gross ? 0n : gross - reduction;
}

/** Ordinary original-principal interest. Only the original principal is bounded to uint128. */
export function interestWide(principal:bigint,rate:bigint,seconds:bigint,denominator:bigint):bigint {
 uint(rate,32n);uint(seconds,64n);uint(denominator);cash(principal);
 if(rate>10000n)fail('UnsupportedRate');if(denominator===0n)fail('ZeroDenominator');
 return mulDivUp(principal,rate*seconds,denominator);
}
export function debtWide(principal:bigint,rate:bigint,start:bigint,timestamp:bigint,denominator:bigint,reduction:bigint):bigint {
 uint(start,64n);uint(timestamp,64n);uint(reduction);
 if(timestamp<start)fail('InvalidTimeRange');
 const gross=principal+interestWide(principal,rate,timestamp-start,denominator);
 return reduction>=gross?0n:gross-reduction;
}
