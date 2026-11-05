# BELL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to execute this plan task by task. Use `superpowers:test-driven-development` for every feature or fix, and `superpowers:verification-before-completion` before every completion claim or commit.

**Goal:** Build a contract-first, locally and publicly testable BELL protocol that preserves the approved product design while implementing the economics and trust boundaries in `docs/PRD.md`.

**Architecture:** `CoverManager` is the sole monetary coordinator across an isolated `ProtectedPool`, `LoanVault`, and `CommitmentBook`. Chainlink CRE submits typed facts through mode-specific authenticated receivers into `SessionOracle`. A TypeScript engine mirrors contract semantics exactly. The backend indexes and orchestrates but never decides money. Connected wallets sign actor transactions. The application preserves the approved visual system and renders contract truth.

**Tech Stack:** Solidity and Foundry; TypeScript; React and Vite; viem; Node test runner; Playwright; Bun and Chainlink CRE SDK; Arc testnet; USDC-compatible mock locally.

**Spec:** `docs/PRD.md`

## Global constraints

- Money logic exists only under `contracts/`.
- Write a failing test before production code.
- No hard-coded demo outcomes.
- Engine and contract arithmetic, errors, and state transitions must match exactly.
- Keep the approved frontend look unchanged unless Pallavi approves a structural design change.
- Production, simulation, and EOA-demo report authority remain separate.
- Connected users sign their own Arc transactions.
- Keys remain in ignored environment files and are never printed or committed.
- Use date-free product documentation and filenames.
- Keep Git history linear, commits single-purpose, and author identity repository-local.
- Do not push until Pallavi explicitly requests it.

## Review focus

Every task receives two reviews before commit:

1. **Specification review:** required behavior, exclusions, trust boundary, and tests match the PRD.
2. **Quality review:** arithmetic, access control, rollback, state machine, event evidence, gas bounds, maintainability, and absence of secrets or hidden outcomes.

## Commit sequence

The intended linear sequence is:

1. `chore: initialize BELL workspace`
2. `docs: define BELL protocol requirements`
3. `feat: add protocol configuration and market facts`
4. `feat: add funded commitment lots`
5. `feat: add isolated protected lending`
6. `feat: add atomic covered borrowing`
7. `feat: add deterministic settlement and claims`
8. `feat: authenticate CRE market events`
9. `feat: add exact protocol parity engine`
10. `feat: add keeper indexing and replay evidence`
11. `feat: connect application to BELL contracts`
12. `test: add multi-wallet replay coverage`
13. `chore: add Arc testnet deployment evidence`

Commits may be split more finely when a change cannot remain reviewable as one unit. Do not squash away the red-green-review evidence before it is recorded.

## Task 1: Initialize the workspace

**Files**

- Create root `package.json`, lockfile, TypeScript configuration, `.env.example`, and contributor commands.
- Create root `foundry.toml`, root `remappings.txt`, and pinned contract dependency configuration for sources under `contracts/`.
- Create empty package boundaries for `engine/`, `services/keeper/`, `cre/`, `src/`, `scripts/`, and `tests/`.
- Create repository scripts for format, lint, build, unit, integration, and full verification.

**Acceptance**

- Fresh dependency installation is deterministic.
- `forge build` works with an empty contract scaffold.
- TypeScript typecheck and a smoke test run.
- Environment example contains names only and no values that are secrets.
- Generated, secret, deployment-run, and evidence-output files are ignored appropriately.

## Task 2: Configuration and typed market facts

**Tests first**

- `contracts/test/unit/Configuration.t.sol`
- `contracts/test/unit/SessionOracle.t.sol`

**Implementation**

- `contracts/src/lib/Types.sol`
- `contracts/src/lib/Errors.sol`
- `contracts/src/lib/Events.sol`
- `contracts/src/AssetRegistry.sol`
- `contracts/src/SessionOracle.sol`

**Cases**

- future-only configuration updates;
- immutable policy snapshots for live receipts;
- denominator, decimal, rate, LTV, timing, and active-loan bounds;
- unsupported corporate-action rejection;
- typed session transitions, nonce, previous-state, expiry, duplicate, and conflicting-final-report rejection.

**Acceptance**

- Only authorized receivers can accept reports.
- No mutable global policy can alter an existing receipt.
- All facts are domain-bound and emit sufficient evidence.

## Task 3: Exact arithmetic libraries

**Tests first**

- `contracts/test/unit/FixedPointMath.t.sol`
- `contracts/test/unit/InterestMath.t.sol`
- `contracts/test/unit/SettlementMath.t.sol`

**Implementation**

- `contracts/src/lib/FixedPointMath.sol`
- `contracts/src/lib/InterestMath.sol`
- `contracts/src/lib/SettlementMath.sol`

**Cases**

- exact ceiling division and common-scale cross-products;
- original-principal simple interest;
- partial debt reductions without clock reset;
- deadline cap and permanent zero closure;
- cumulative fixed-strike cash deltas;
- inverse minimum-share calculation for terminal settlement;
- single and multiple fills, low strikes, zero benchmark, and last-fill excess.

**Acceptance**

- No tolerance-based money assertion.
- No use of floating point.
- Boundary tests cover zero, one-unit, maximum supported, and overflow-adjacent values.

## Task 4: Funded offer lots

**Tests first**

- `contracts/test/unit/CommitmentBook.t.sol`

**Implementation**

- `contracts/src/CommitmentBook.sol`

**Cases**

- segregated USDC funding;
- whole-lot allocation;
- expiry, nonce, cancellation, and reference-deviation rules;
- buyer eligibility at posting and allocation;
- reservation uniqueness;
- immediate non-refundable premium credit;
- cumulative exercise charging;
- release only after authorized receipt closure.

**Acceptance**

- A lot is never underfunded or reused.
- Reserved obligations survive later token restrictions or buyer ineligibility.
- Pull credits prevent arbitrary external calls during accounting transitions.

## Task 5: Isolated pool, vault, and backed mock stock

**Tests first**

- `contracts/test/unit/ProtectedPool.t.sol`
- `contracts/test/unit/LoanVault.t.sol`
- `contracts/test/unit/ClaimsAndSplits.t.sol`

**Implementation**

- `contracts/src/ProtectedPool.sol`
- `contracts/src/LoanVault.sol`
- `contracts/src/demo/MockStockToken.sol`
- `contracts/src/demo/BaselineMarket.sol`

**Cases**

- share donation and rounding behavior;
- liquidity-limited redemption;
- exact bounded active-loan NAV;
- standard-market loss isolation;
- collateral custody and authorized movement;
- snapshot economic claims;
- split and reverse-split conversion with real backing;
- unavailable delivery without blocking debt closure.

**Acceptance**

- The active-loan cap is explicit and benchmarked.
- A multiplier change cannot mint an unbacked deliverable claim.
- Baseline contracts cannot access protected assets.

## Task 6: Atomic covered borrowing

**Tests first**

- `contracts/test/unit/QuoteHash.t.sol`
- `contracts/test/unit/BorrowWithCover.t.sol`

**Implementation**

- `contracts/src/lib/QuoteHash.sol`
- `contracts/src/CoverManager.sol`

**Cases**

- direct borrower consent and nonce;
- exact quote domain and ordered offer-term hashes;
- atomic collateral, reservation, premium, principal, and receipt creation;
- duplicate offer IDs;
- full-funding and maximum-fill bounds;
- descending strike and ascending-ID tie order;
- exact weighted-strike and per-buyer LTV consent;
- front-running reservation and every rollback branch;
- inclusion-time start and debt ceiling stored in the receipt.

**Acceptance**

- No partially created loan or cover is observable after a revert.
- Quote consent cannot be replayed or silently substitute offers.
- Ordinary inclusion delay does not invalidate static consent.

## Task 7: Receipt lifecycle and settlement

**Tests first**

- `contracts/test/unit/ReceiptLifecycle.t.sol`
- `contracts/test/scenarios/ReceiptScenarios.t.sol`

**Implementation**

- Complete `contracts/src/CoverManager.sol` lifecycle methods.
- Complete `contracts/src/LoanVault.sol` claim withdrawal and collateral release.

**Cases**

- borrower and third-party repayment;
- healthy report with retained cover;
- partial exercise with retained cover;
- full normal closure;
- collateral addition without risk increase;
- forbidden collateral withdrawal while unsafe;
- deadline precedence;
- no-report terminal closure;
- token pause and restriction independence;
- settlement idempotence;
- `HANDOFF_PENDING` truth state.

**Acceptance**

- Pool cash equals debt reduction exactly.
- Unused cash is not released while debt exists.
- Terminal settlement needs no benchmark and always follows the funded receipt.

## Task 8: CRE receiver trust boundaries

**Tests first**

- `contracts/test/unit/MarketEventReceiver.t.sol`

**Implementation**

- `contracts/src/BELLMarketEventReceiver.sol`
- `contracts/src/demo/SimulationMarketEventReceiver.sol`
- `contracts/src/demo/DemoReportAdapter.sol`

**Cases**

- ERC-165 and `IReceiver` support;
- exact pinned metadata-layout regression;
- pinned forwarder, workflow ID, and workflow owner;
- wrong chain, receiver, asset, session, configuration, policy, state, nonce, and expiry;
- duplicate and conflicting final reports;
- simulation omission limited to the pinned simulator's actual metadata behavior;
- EOA adapter unable to call production receiver authority.

**Acceptance**

- No receiver forwards arbitrary calldata.
- Production authorization cannot be weakened by demo or simulator requirements.
- Report payload is typed, decoded, validated, and applied through `SessionOracle`.

## Task 9: Stateful invariants and gas bounds

**Tests first**

- `contracts/test/invariant/Handler.sol`
- `contracts/test/invariant/ProtocolInvariants.t.sol`
- `contracts/test/gas/BoundedOperations.t.sol`

**Campaigns**

- distinct lender, borrower, two buyers, keeper, report relay, and adversary;
- guided sequences across posting, cancellation, borrowing, reporting, repayment, settlement, pause, restriction, split, and withdrawal;
- transition-time assertions plus end-state invariants;
- maximum active-loan NAV, eight-fill borrow, and eight-fill settlement gas.

**Acceptance**

- All PRD invariants are represented explicitly.
- No violation counter is ignored.
- Gas remains within declared Arc testnet limits at every bound.

## Task 10: Exact TypeScript parity engine

**Tests first**

- `engine/*.test.ts`
- `contracts/test/differential/EngineDiff.t.sol`

**Implementation**

- `engine/types.ts`
- `engine/params.ts`
- `engine/math.ts`
- `engine/interest.ts`
- `engine/offers.ts`
- `engine/quote.ts`
- `engine/receipt.ts`
- `engine/settle.ts`
- `engine/terminal.ts`
- `engine/claims.ts`
- `engine/state.ts`
- `engine/cli.ts`

**Acceptance**

- At least one thousand seeded cases compare exact integers, custom errors, transitions, and full observable state.
- Regression corpus records every fixed mismatch input.
- Engine code is never imported by contracts or treated as outcome authority in production.

## Task 11: CRE workflow

**Tests first**

- schema parity, calendar, benchmark, validation, live/replay parity, retry, idempotence, and toolchain tests under `cre/bell-market-event/tests/`.

**Implementation**

- one workflow and validation path for live and replay modes;
- input adapters for calendar, benchmark, corporate action, Arc state, and replay fixture;
- typed ABI report encoding matching contracts;
- sanitized observability and reproducible config hashing.

**Acceptance**

- Workflow uses external data and Arc contract state.
- Extreme moves require independent evidence rather than duplicated primary data.
- Missing freshness, session, status, multiplier, or source agreement prevents submission.
- Simulation artifact proves settlement rejection before and acceptance after a valid report.

## Task 12: Keeper, indexer, and replay evidence

**Tests first**

- API, indexer, unsigned transaction, replay, settler, and signing-boundary tests under `services/keeper/test/`.

**Implementation**

- ordered event indexer with block-hash cursor;
- reconnect, backfill, deduplication, and replaced-block handling;
- raw-integer projections;
- unsigned actor transaction construction;
- permissionless settlement monitor;
- Anvil-only demo signers;
- input-driven replay runner and evidence collection.

**Acceptance**

- Frontend contains no privileged keeper credential.
- Arc actor writes require the connected wallet.
- Keeper never selects a price, offer, debt amount, or settlement allocation.
- Changing offer inputs changes onchain results without source changes.

## Task 13: Preserve the visual system and connect contract truth

**Baseline first**

- Capture approved desktop and mobile baselines.
- Record fonts, tokens, motion, layout, responsive behavior, and page structure.
- Any structural visual change requires Pallavi's approval.

**Tests first**

- adapter transport, wallet, controller, truth-label, and visual tests;
- connected-wallet end-to-end tests for borrower, buyers, lender, control, and replay.

**Implementation**

- preserve page shells and visual components;
- implement state types, controller, adapters, and copy around new ABIs;
- generate ABIs from contract artifacts;
- read financial values at a consistent block;
- add wallet connection, chain validation, approvals, quote signature, direct submission, receipt waiting, and refresh;
- label local, Arc, preview, data source, mock asset, signing mode, and authority.

**Acceptance**

- The frontend cannot invent settlement values.
- Buyer offers are editable and post real transactions.
- Alice accepts one exact bundle in one atomic borrow transaction.
- Visual diffs mask only unavoidable addresses, times, hashes, and explorer links.

## Task 14: Local multi-wallet replay

**Tests**

- `tests/e2e/borrow.spec.ts`
- `tests/e2e/buyers.spec.ts`
- `tests/e2e/lend.spec.ts`
- `tests/e2e/replay.spec.ts`
- `tests/e2e/signing.spec.ts`

**Flow**

- start clean Anvil and deploy;
- fund distinct actors;
- supply pool;
- post configurable Rahul and Meera lots;
- accept exact bundle as Alice;
- prove cutoff and report rejection paths;
- relay accepted report;
- execute normal and terminal variants;
- repay residual debt where applicable;
- withdraw claims and credits;
- prove idempotence and conservation;
- retain transaction hashes, receipts, events, input hash, config hash, and parity output.

**Acceptance**

- No automated result injection.
- UI and API match onchain state after every step.
- At least three materially different offer configurations yield correctly different outcomes.

## Task 15: Arc Studio and Arc testnet delivery

**Arc Studio**

- Use Studio materially for project generation or modification, contract/app review, test execution, preview, and deployment workflow.
- Retain project URL, project identifier, material prompts, trace/history, diffs, test output, preview, and deployment evidence.
- Independently verify all generated or modified code locally.

**Arc testnet**

- resolve current RPC, chain ID, explorer, faucet, USDC, CRE forwarder, and metadata layout from authoritative sources;
- deploy mode-specific contracts with verified constructor configuration;
- verify bytecode and deployment addresses;
- fund distinct actors and run canonical plus custom-offer replays;
- retain explorer links and event evidence;
- verify retries, event ordering, and maximum-fill gas.

**Acceptance**

- Alice, Rahul, and Meera submit real transactions from distinct accounts.
- CRE report delivery and receiver acceptance are publicly verifiable.
- Local and Arc results match for the same fixed inputs, aside from explicitly modelled chain context.
- A clean checkout can reproduce builds, tests, and the documented demo.

## Final verification

Run targeted tests after every task. Before a release claim, run the complete suite from a clean state:

```bash
forge fmt --check
forge build
forge test
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run verify:parity
npm run verify:replay
```

Record the exact tool versions and command output. Completion claims require fresh output from this repository.

