# Optional Cover Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development. Execute each task with a failing regression, implementation, focused/full relevant checks, and an independent spec/quality review before advancing.

Goal: restore ordinary borrowing followed by optional funded cover on the same loan.
Architecture: one new LoanManager separates durable loan/custody operations from CoverManager's session receipts. Reuse settlement/escrow arithmetic and existing oracle/CRE authority.
Tech stack: existing Solidity/Foundry, TypeScript engine/keeper, React/Vite and CRE toolchain; no new dependencies.
Spec: docs/OPTIONAL_COVER.md.

## Global constraints

Preserve the existing frontend design, all uncommitted delivery work, fixed buyer terms, 8% exact interest and engine parity. Money authority remains in contracts. No hard-coded outcomes, keys outside ignored .env, git writes or Studio uploads. Work in the existing owner-created bell-implementation checkout. Owner has explicitly authorized this scoped structural correction and asked to proceed without more questions. Files/document names contain no dates.

## Review focus

Preserve pre-cover accrued debt; prevent duplicate disbursement; enforce both window edges; prevent cross-loan escrow/backing access; keep pool NAV consistent during cross-contract token callbacks. Tests in Tasks 1–3 must pin these properties. Both managers must fit EIP-170 without changing the size ceiling.

## Task 1: Authenticated ordinary valuation

Files: contracts/src/lib/Types.sol, contracts/src/SessionOracle.sol, necessary lib errors/events, contracts/test/unit/SessionOracle.t.sol and a focused market-price test. Append MARKET_PRICE kind; retain old report kind numbers/envelope. Produce latestReference(bytes32) and requireFreshReference(bytes32) views returning Types.ReferencePriceFact. Fact fields: price, observedAt, validUntil, multiplierNumerator, multiplierDenominator, configHash, primarySourceHash, secondarySourceHash, reportHash. Require active SCHEDULED session with clock-open bounds, source observation inside session, fresh <=1800 seconds, bounded validity, monotonicity, independent nonzero hashes and matching corporate multiplier. Update asset nonce/hash exactly as all reports. Existing report/receiver behavior remains.

- [ ] Write/run RED regressions for valid price and wrong/stale/closed/halted/duplicate/multiplier cases.
- [ ] Implement minimal oracle support; run relevant and complete non-invariant contract suite.
- [ ] Independent scoped review, fix, and record results.

## Task 2: Durable loans and optional cover

Files: add contracts/src/LoanManager.sol; modify LoanVault, CoverManager, QuoteHash/Types/errors/events as required; preserve ProtectedPool/CommitmentBook arithmetic. Update contract helpers, unit/lifecycle/invariant/gas tests and differential fixtures to the coherent topology. Consume Task 1's authenticated reference views. LoanManager becomes the sole vault/pool manager; book remains solely controlled by CoverManager. Move existing loan operations rather than cloning them. Exact interface appendix follows the architect's bounded split report, and must be pinned in this plan before dispatch. Only loan creation disburses principal. buyCover attaches session receipt to existing loan and uses original-basis debt ceiling. Ordinary risk/write-off and cover detach must be explicit. Enforce window, consent, callback guard, claim and repeated-session rules. Preserve atomic shortcut only through the same helpers if size permits.

- [ ] RED ordinary borrow then later cover on same loan, no second transfer or interest reset.
- [ ] Implement loan/cover split and narrow guarded bridges.
- [ ] Prove healthy/partial detach, repeated session, full repayment, late terminal, unsafe/unfunded rejection, split/backing conservation, ordinary liquidation/writeoff and callback safety.
- [ ] Verify complete contract suite/invariants, exact math, deployment wiring and runtime size, then independent review.

## Task 3: Engine, CRE and application integration

Files: engine receipt/state/CLI/types/tests; CRE schema/core/adapters/workflow/tests; keeper ABI/config/state/transactions/replay and tests; scripts local deployment/Arc deployment/replay/ABI generator; src adapter/controller/actor tools and generated ABI; relevant frontend/browser/E2E tests. Consume exact Task 2 ABI. Expose distinct loan and cover receipt identities, ordinary borrow and later buyCover; preserve connected wallet authority and existing visual structure. Add MARKET_PRICE to CRE validation with source/market/corporate checks and unchanged report encoding. Preserve default CLI capability budgets. Update fixture/replay actions and quote hash domains, and compare real loan/cover lifecycle transitions exactly against engine state.

- [ ] RED new actions/state and real Anvil borrow-first/cover-later parity.
- [ ] Integrate one coherent ABI and lifecycle; do not weaken old negative/provenance tests.
- [ ] Run typecheck, engine/differential, keeper, CRE, frontend/browser and full E2E flows including different offers, time boundaries, next-session cover and paused claims.
- [ ] Independent review and fix gates.

## Task 4: Delivery and final verification

Update PRD, README, deployment/demo record and run instructions to the implemented behavior and disclosed pool risk. Run final formatter/build/tests/size/parity/replay/visual gates. Deploy a fresh simulation-mode Arc set using a new durable signed journal; preserve earlier manifest/history. Verify runtime, wiring, CRE report acceptance and browser state before claiming corrected deployment. Prepare actor transactions for explicit wallet approval. Studio source transfer remains pending owner's separate approval.

- [ ] Complete local verification and documentation with no placeholder success claims.
- [ ] Fresh deployment/runtime/wiring verification and public evidence.
- [ ] Record all addresses and remaining interactive signature/Studio gates accurately.
