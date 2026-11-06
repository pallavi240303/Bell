import type { Address, Hex } from 'viem';
export type { Address, Hex };
export interface Header { number: bigint; hash: Hex; parentHash?: Hex; timestamp: bigint }
export const requiredComponents=['manager','book','pool','vault','cash','stock','oracle','registry','receiver'] as const;
export type Component=typeof requiredComponents[number];
export interface Deployment { chainId: string; deploymentBlock: string; addresses: Record<Component,Address>&Record<string,Address>; codeHashes: Record<Component,Hex>&Record<string,Hex> }
export function rawUint(value: unknown, bits = 256): bigint {
  if(typeof value!=='string'||! /^(0|[1-9][0-9]*)$/.test(value)) throw new TypeError(`canonical uint${bits} string required`);
  const n=BigInt(value);if(n>=1n<<BigInt(bits))throw new RangeError(`uint${bits} overflow`);return n;
}
export function json(value: unknown): string { return JSON.stringify(value,(_,v:unknown)=>typeof v==='bigint'?v.toString():v); }
export function raw<T=unknown>(value: unknown): T { return JSON.parse(json(value)) as T; }
/** viem returns small ABI uints as numbers. Normalize immediately, before projections. */
export function integers(value: any): any {
  if(typeof value==='number')return BigInt(value);
  if(Array.isArray(value))return value.map(integers);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,integers(v)]));
  return typeof value==='string'&&value.startsWith('0x')?value.toLowerCase():value;
}
export function exactKeys(value: Record<string,unknown>, allowed: string[]) { for(const key of Object.keys(value))if(!allowed.includes(key))throw Error(`unexpected field: ${key}`); }
