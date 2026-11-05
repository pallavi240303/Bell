import { planNormal } from './settle.ts';
import type { Lot, Plan } from './types.ts';
/** Terminal has no benchmark: the manager executes the same plan at zero price. */
export function planTerminal(debt: bigint, collateral: bigint, trigger: bigint, target: bigint, lots: readonly Lot[]): Plan { return planNormal(debt, collateral, 0n, trigger, target, lots); }
