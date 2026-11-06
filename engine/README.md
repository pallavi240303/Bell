# Engine

Non-authoritative, deterministic parity model. Contracts authorize all money movement.

`state.ts` keeps durable loans, optional current/historical receipts, offers and claims under separate IDs. `initialState(chainId, manager, loanManager, pool, book, vault, profile)` creates an empty model; ordinary `borrow` creates debt once and `buyCover` attaches a funded receipt later. `debtOf(state, loanId, timestamp)` and `totalAssets(state, timestamp)` accrue every active loan on its original basis. Repayment, normal detachment, financial closure and deferred delivery remain separate transitions.

`Action.poolNavCallback` models an installed pool NAV hook; it reads all live debt and only fails under the LoanManager transition guard. `Action.cashFailure` separately represents an injected token revert. FFI Step.cashCallback maps to poolNavCallback, so standalone book credit withdrawals can succeed with the real hook enabled.

All protocol values are bigint. `transition(state, action)` is atomic and never mutates the input. Market/config facts are supplied from coherent authenticated contract reads; the engine mirrors contract consumption of those facts, not oracle report acceptance. `MarketFacts` identifies the queried registry asset/version, whether it exists, effective config, current session, reference and corporate action. It must correspond to the action's actual registry query. Repay/add/top-up do not require fresh valuation; full repayment/add use the latest corporate multiplier.

`quote.ts` exports the V2 quote tuple/hash and contract-derived session policy hash. `interest.ts` preserves bounded arithmetic and adds ordinary wide debt. `receipt.ts` exports cover validation/construction, fresh-reference consumption and ordinary liquidation math. Pure cover validation is not a successful transaction: `transition(..., {kind:'buyCover', ...})` additionally executes loan binding, reservation, eligibility, premiums and atomic rollback.

`cli.ts` is safe to import. It exports canonical tuple strings (`*_ABI`), `FFI_OPS`, `Snapshot`, `Step`, `fromSnapshot`, `snapshot`, `actionFromStep` and `trace`. Backend/replay should import these rather than copy schemas. Snapshot arrays include every relevant loan (including ordinary loans), historical receipt, offer and claim, all active pool loans, token backing, and every actor affected by the action. Preserve all pre-existing IDs, balances, credits, allowances and original debt terms; do not reconstruct one receipt as the pool. A new token/actor must be included in the read set before its action. Ordered loan/receipt/claim entries use ascending IDs; pool active IDs retain on-chain swap-and-pop order; offers and actor/token arrays retain the snapshot read order.

FFI operation IDs remain 0–8 and12 for existing math/book operations, with the intentional V2 quote tuple/domain change at7. Operations9–11 use the new lifecycle tuples. Appended operations13–17 are wide debt, liquidation plan, ordinary borrow, cover attachment and ordinary liquidation. Trace action kinds0–9 retain their meanings; kinds10–12 are borrow/buyCover/liquidate. Standalone transition operations15–17 return the same one-element `(success,revertBytes,stateHash)[]` observation as a trace. Unknown operations/actions fail explicitly.

`executionCash(preNative, preCash, protocolCashDelta, gasCost)` is a separate Arc comparison helper. It verifies `floor(preNative/1e12)==preCash`, applies the signed protocol cash delta in units of1e12 wei, subtracts exact gas cost, then floors once and returns native remainder. Task3B must verify chain/receipt identity and before-native provenance. It must account for gas on reverted transactions too. Core protocol transitions and Anvil MockCash FFI never charge native gas.

Validation:

```sh
npm run test:engine
forge test --match-path contracts/test/differential/EngineDiff.t.sol -vv
```

The differential suite compares exact success/revert bytes and complete represented before/after observable state, with bounded per-scenario FFI calls retaining all seeded transitions. Snapshot schemas are long; the iterative tuple splitter avoids the dependency parser's per-character recursion limit without changing ABI encoding.
