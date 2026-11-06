# BELL Product Requirements

## Product statement

**DeFi collateralizes the loan. BELL collateralizes the liquidation.**

BELL is a lending market with optional, pre-funded fixed-strike cover for tokenized assets. A borrower can borrow normally without offers or a premium, then attach fully funded session cover to that same eligible loan during its cover window. Buyers choose the strike, premium, exposure and risk limits they accept. Chainlink CRE authenticates external market facts; contracts perform every monetary calculation. Arc executes and settles transactions.

This document incorporates the binding [optional-cover correction](OPTIONAL_COVER.md). Earlier covered-only origination requirements are superseded. The primary path is `LoanManager.borrow` followed by optional `CoverManager.buyCover`. The corrected manager exposes no `borrowWithCover` shortcut.

## Problem and solution

Tokenized assets may trade while their underlying regulated market is closed or halted. A thin token price can diverge from the next reliable underlying benchmark, leaving lenders exposed while a defensible liquidation is unavailable. BELL makes committed purchase cash available before that uncertainty begins.

1. A lender supplies the BELL pool. Alice deposits collateral and receives an ordinary USDC loan.
2. Buyers post configurable whole offer lots, locking their maximum USDC obligation.
3. In the session window, Alice selects an ordered bundle and accepts its premium, strikes and limits for her existing eligible loan.
4. Acceptance reserves the complete funded bundle atomically. It neither disburses principal again nor replaces debt or collateral.
5. CRE validates market evidence. Before the funded deadline, a valid official reopening benchmark determines healthy, partial or full exercise.
6. Every normal outcome ends that session's cover and releases unused commitments. Residual debt continues on the same ordinary loan.
7. If active cover reaches its deadline without normal settlement, permissionless terminal settlement closes its capped debt from funded commitments without a market price.

## Economic truth and actors

The shared BELL pool holds ordinary and covered loans. LPs bear ordinary credit risk, including explicit bad-debt write-offs. Cover guarantees only the selected loan/session within accepted funded terms, not the value or full recovery of every pool share. The baseline comparator is a separate market and cannot use BELL pool assets or buyer escrow.

- **Borrower:** owns the durable loan, may choose cover, repay, add collateral and withdraw eligible surplus. Cover premiums are non-refundable and earned on allocation.
- **Buyer:** locks cash for selected lots. Maximum cash payment is bounded by those lots' escrow. Stock value plus premium may be less than cash paid; there is no guaranteed profit. Buyer escrow never pays another loan or an ordinary write-off.
- **Lender:** owns pool shares. NAV includes exact active-loan debt; withdrawals depend on available cash and ordinary losses can reduce NAV.
- **Keeper:** indexes canonical state, prepares unsigned requests and may submit permissionless settlement. It cannot choose prices, override monetary outcomes or sign public actor transactions.
- **CRE workflow:** authenticates external schedule, price, corporate-action, halt and reference facts against pinned chain state through a typed receiver.
- **Arc:** stores contract state, transfers USDC and supplies public transaction evidence.

There is no promise of risk-free returns or recovery beyond the funded debt cap. Mock stock and eligibility demonstrate mechanics, not real issuer custody, redemption or regulatory eligibility.

## Durable loan and session receipt

`loanId` identifies one debt/collateral position for its entire life. `receiptId` identifies one immutable session-cover agreement and explicitly stores its `loanId`. Their counters and meaning differ; clients must never substitute one for the other.

- Ordinary origination requires effective immutable configuration, authenticated fresh reference, an open/nonhalted session, permitted LTV and pool liquidity. Offers and cover premium are not required.
- LoanManager owns borrow, repay, collateral operations, liquidation and financial closure. Only the borrower may withdraw collateral or finalize handoff. Repayment and collateral addition are permissionless and need no fresh price.
- Cover requires an active uncovered loan with nonzero debt, an eligible new session, compatible token/share basis, fresh authenticated valuation, trigger health and complete funding through its deadline.
- Acceptance preserves original principal, start, rate, prior repayments and custody. Both acceptance debt and deadline debt must satisfy borrower consent and the supported settlement domain.
- At most one receipt is active per loan. Ended receipts remain inspectable and cannot reactivate. A later eligible session may attach a new receipt to the remaining loan.
- Prior buyer claims survive later coverage, repayment and closure. They never consume another loan's backing.

The pool tracks at most 32 outstanding loans, counting ordinary and covered loans once each. Assets equal liquid USDC plus exact active-loan debt. Its legacy `activeReceiptIds` getter contains durable loan IDs; the keeper exposes `activeLoanIds`. The baseline has separate capital/accounting.

## Immutable cover windows

| Profile | Opens before scheduled close | Cutoff before scheduled close | Use |
|---|---:|---:|---|
| LIVE | 7200 seconds | 1800 seconds | Production timing |
| REPLAY | 600 seconds | 60 seconds | Explicit simulation timing |

Profiles and offsets are constructor-pinned, never mutable operator settings. Acceptance requires `opensAt <= execution < cutoffAt` and `scheduledOpen <= opensAt < cutoffAt < scheduledClose`. Receipts snapshot the window. Replay timing changes no monetary formula or authority requirement.

## Offer lots and consent

- A whole lot is allocated to at most one receipt; flexible size requires multiple lots.
- Terms bind stock quantity, fixed strike, premium, maximum borrower LTV, asset/session policy, expiry and nonce.
- Required escrow is `ceil(lotShares × strike)` in common fixed-point units. Buyer eligibility is checked at posting and allocation.
- Free unexpired offers may be cancelled; reserved offers may not. Later ineligibility, pause or transfer restrictions cannot cancel funded financial obligations.
- A receipt accepts at most eight lots, descending strike then ascending offer ID for ties. Settlement keeps that order.
- Premium is credited once on successful cover allocation. There is no universal premium cap, strike floor or hidden ranking rule.

Quote consent binds chain, CoverManager, borrower/nonce, durable loan ID, original principal/multiplier, current collateral and recipient, exact scheduled/config/corporate/reference identities, ordered offer IDs/term hashes, premiums, share/strike limits, both debt ceilings, expiry and deadline bounds. Policy hashes bind the original loan multiplier and immutable profile. Actual acceptance time and funded debt ceiling are stored in the receipt.

`buyCover` validates consent/funding, enters the shared debt/cash-transition guard before book movements, reserves lots, pays premiums and activates the receipt atomically. Failure rolls back receipt, nonce, cap, premiums and escrow. It creates no debt, collateral deposit or principal payment.

## Risk policy and original interest

Default versioned policy is 60% origination LTV, 75% ordinary/settlement trigger, 65% target and 8% simple annual interest. Registry policy preserves `origination < target < trigger`. The loan retains its original terms; future configuration cannot rewrite its rate/start. Cover separately snapshots compatible effective policy and uses the stricter original/current admission trigger.

```text
effectiveTime(t) = min(t, activeCoverDeadline) while cover is active; otherwise t
elapsed(t) = effectiveTime(t) - originalLoanStart
interest(t) = ceil(originalPrincipal × originalRateNumerator × elapsed(t) / originalRateDenominator)
debt(t) = max(0, originalPrincipal + interest(t) - cumulativeDebtReduction)
```

Interest never compounds or capitalizes. Partial repayments do not reset the original basis. Ordinary debt has no cover maturity or permanent deadline cap. Active cover funds/caps original-basis debt through its deadline. Normal settlement removes that cap, so residual debt continues original-basis accrual. Full repayment or terminal financial closure permanently zeroes debt; it cannot revive.

## Normal and terminal settlement

Before its deadline, an active receipt may process its accepted official reopening benchmark once. A healthy result exercises no cash; an unsafe result exercises fixed commitments toward the target or full closure. Every normal result ends the receipt, releases all unused reserved cash and detaches cover. Healthy/partial residual debt and collateral remain on the ordinary loan. An ended receipt no longer supplies terminal protection.

For each lot:

```text
cashOwed_i(X) = ceil(X × strike_i)
incrementalCash = cashOwed_i(newCumulativeShares) - cashOwed_i(oldCumulativeShares)
```

Charges cannot exceed remaining locked capacity. The pool receives exactly the debt reduction; last-fill cash above remaining debt becomes the borrower's pull credit. A paid fill converting to zero physical delivery units reverts atomically rather than charging a buyer for no units.

At or after an active receipt's deadline, normal settlement reverts and anyone may call terminal settlement. It needs no market price, exercising the minimum funded fixed-strike quantity with cumulative rounding to close capped debt. Halt, token pause or temporary physical backing shortage cannot prevent funded financial closure. Full repayment also ends attached cover and releases unused cash. Financial closure and physical handoff remain separate states.

## Ordinary liquidation and collateral

Fresh authenticated valuation and an open/nonhalted session are required for borrowing, collateral withdrawal, liquidation and cover admission. Ordinary liquidation uses the original trigger/target. The uncovered cutoff-to-close interval uses a 50% trigger and 45% target. The bonus is 550 bps. Covered ordinary liquidation is allowed only inside its stored window and releases cover first.

Cash, debt reduction and collateral claims agree exactly. `maxRepay` is a ceiling that reverts if insufficient. Insolvent all-collateral liquidation writes off residual debt explicitly and reduces pool NAV without buyer escrow or another loan's backing. Unpaid zero-delivery dust follows the explicit contract rule; it is never a paid buyer claim.

Covered collateral withdrawal is permitted only inside its own window, retains all reserved economic shares and meets fresh health/outstanding-claim backing checks. Ordinary withdrawal also needs fresh health/backing. Repayment and collateral addition remain possible without fresh prices.

## Claims and corporate actions

Each loan retains its original economic share basis. Authenticated cumulative multipliers convert prices and claims:

```text
benchmarkValuePerSnapshotShare = benchmarkPrice × currentMultiplier / snapshotMultiplier
deliveryUnits = floor(snapshotShares × currentMultiplier / snapshotMultiplier)
```

Monetary multiplier numerators and denominators must each be positive and at most `uint64.max`; report/stored wire fields remain `uint128`. This supported domain does not alter the 21-word report schema. Corporate actions never rewrite old claims' immutable delivery units.

Each loan reserves worst-case future conversion headroom alongside outstanding immutable claims. With `B = 2^64 - 1`, `R = B²` and `U = uint256.max`, the vault preserves `outstandingUnits + remainingShares × R <= U`. Collateral additions exceeding headroom reject before transfer. Headroom does not manufacture physical backing.

Claims mature immediately for owner-only deferred pull. Physical delivery still needs that loan's actual backing and successful unrestricted token transfer; pause/shortage leaves the claim outstanding. Top-ups never borrow other loans' backing. The legacy `LoanVault.Claim.receiptId` field means durable `loanId` in corrected wiring.

`HANDOFF_PENDING` means debt is financially closed while borrower surplus delivery is pending. It is distinct from active cover; receipt status independently proves cover ended. Mock stock supports split/pause/restriction demonstrations but has no issuer backing. Cash dividends, mergers and spinoffs are unsupported; assets requiring them cannot be listed.

## Contract architecture

- `AssetRegistry`: immutable versioned asset/configuration identities.
- `SessionOracle`: accepted session, corporate, benchmark and fresh reference facts.
- `BELLMarketEventReceiver`: production Keystone forwarder/workflow authentication.
- `SimulationMarketEventReceiver`: separate immutable simulation authority.
- `DemoReportAdapter`: explicitly trusted EOA simulation relay, never production authority.
- `LoanManager`: durable debt/collateral lifecycle; sole authorized pool/vault coordinator.
- `CoverManager`: receipt consent, funded allocation and normal/terminal settlement.
- `ProtectedPool`: lender shares, cash and exact ordinary/covered loan NAV.
- `LoanVault`: per-loan debt, collateral backing and immutable deferred claims.
- `CommitmentBook`: segregated offer cash, premiums, reservation, exercise and release.
- `MockStockToken` and mock eligibility: explicit demonstration token/policy.
- `BaselineMarket`: separate comparator without access to BELL capital or buyer escrow.

Pool/vault bind only LoanManager; book binds CoverManager/pool. Managers have reciprocal one-time bindings and explicit loan/receipt bridge identities. A shared guard rejects ordinary mutations and pool NAV reads during incomplete cash/debt transitions. Bridges cannot create callback cycles.

## CRE facts and authority

CRE orchestrates authenticated external API observations and pinned chain state: exchange schedule/status, primary/independent secondary prices, corporate actions, halt and reference facts. It verifies freshness, source agreement, exact domain/configuration, monotonic nonce, previous state and finality. Replay fixtures are supplied facts, never proof of live official sources.

The unchanged 21-word envelope supports `SESSION_SCHEDULED` (1), `CLOSE_CONFIRMED` (2), official `REOPEN_BENCHMARK` (3), `CORPORATE_ACTION` (4), `HALT` (5), and appended ordinary `MARKET_PRICE` (6). A kind-6 current quote is admission valuation, never an official reopen. Its report session ID is zero while independently checked source facts bind the active scheduled session.

Ordinary references require two fresh independent sources in the active open interval. They are asset-level, monotonic and config/corporate-bound, valid for at most 1800 seconds. Borrower prices and historical storage alone are not authority. Halt/unhalt does not revive an invalidated reference.

```text
external APIs + pinned chain state -> CRE validation -> authenticated report
  -> KeystoneForwarder -> receiver -> SessionOracle -> permissionless settlement
```

Production DON, CLI simulation with the official mock forwarder, and EOA demo relay are separately labelled authority paths. Actual local CLI simulation demonstrates report delivery/acceptance and exact ordinary borrow/repay/cover/settlement parity; it is not a production DON or public Arc proof. Refreshed CRE work still requires independent review. Build success alone proves neither acceptance nor financial parity. See [CRE instructions](../cre/bell-market-event/README.md) and [delivery status](DEPLOYMENTS_AND_DEMO.md).

## App, keeper and modes

Preserve approved layout, typography, motion and responsive appearance. Borrowers separately borrow, inspect durable debt, review exact optional-cover consent and sign attachment. Buyers configure offers and inspect credits/exposure/claims. Lenders inspect shared-pool risk, NAV and liquidity. Values come from contracts or an explicitly labelled engine preview. Mark-to-benchmark P&L is unrealized; realized P&L needs actual disposal/redemption proceeds.

The keeper indexes ordered logs with canonical hashes, cursors, deduplication and reorg recovery. Financial snapshots use one pinned block with final hash guards; integer values are raw decimal strings. `/prepare` constructs unsigned requests. Public actors sign their own money-moving transactions; operators cannot impersonate them. Automated actor signers exist only on visibly labelled owned local Anvil nodes.

Persistent labels identify network, timing profile, source, signer, mock asset, write path and outcome authority. Evidence retains inputs, configuration identities, actors, reports, actual receipts/events, claims, conservation/parity and public explorer links where applicable. Scripted local consent is never interactive wallet consent. No key or privileged browser token enters the client.

## Demo acceptance and verification

1. Supply liquidity; borrow ordinarily before offers exist and record the durable loan ID.
2. Change buyer lots; attach cover to the same loan in its window. Prove no second principal/collateral transfer and unchanged original 8% basis/prior repayments.
3. Reject early/late, unsafe, stale/forged-reference, wrong-policy/consent and underfunded attachments atomically.
4. Authenticate distinct schedule, ordinary reference and official reopen facts through the labelled CRE path. Reject premature, replayed and wrong-domain reports.
5. Demonstrate healthy/partial/full normal outcomes, release unused cash and prove residual ordinary accrual.
6. Attach later-session cover to the same loan while preserving prior claims; keep an unrelated ordinary loan distinct.
7. Demonstrate funded terminal closure without an official reopen and with paused stock. Retain claims; later pull only as owner when backing/transfer permits.
8. Show ordinary liquidation/write-off and shared LP risk without another loan's escrow/backing.
9. Change offers and repeat; compare exact values, errors and observable state with the engine. Show real hashes and conservation evidence.
10. Repeat with connected actors on a fresh corrected Arc deployment. Retain public evidence and Studio build/preview history after approved source transfer.

Release gates include arithmetic/lifecycle units, receiver authentication/replay tests, stateful conservation/authority invariants, at least 1000 seeded exact differential cases, bounded gas tests, local multi-wallet replay, corrected public Arc replay, actual CRE CLI evidence and desktop/mobile browser/visual checks. Individual stage evidence does not imply every gate passes. The [maintained runbook](DEPLOYMENTS_AND_DEMO.md) records completed evidence and pending delivery.

## Security invariants and scope

- Active cover is fully funded through its deadline by only its selected lots.
- Ordinary loans may be uncovered; receipts never replace durable debt identities.
- Lots are never double-allocated; premiums credit once and charges stay within escrow.
- Pool cash received equals debt reduction; ordinary bad debt cannot use buyer escrow.
- Closed debt never revives; detached ordinary debt is not permanently capped.
- Every normal outcome releases unused cover even if ordinary debt remains.
- Terminal closure is price-independent; token restrictions cannot cancel financial obligations.
- Claims preserve immutable units, per-loan backing and supported future conversion headroom.
- Contracts, engine, keeper and UI agree exactly; no monetary outcome is hard-coded.

Out of scope: refinancing/rollover, transfer to another pool, special session refunds, buyer-profit guarantees, unsupported corporate actions, mainnet and real issuer custody. A later session receipt on a continuing loan is supported and is not refinancing.

BELL is ready for sponsor validation when a reviewer can reproduce the corrected lifecycle, change buyer inputs, distinguish simulated/live authority and verify every debt reduction, premium, claim, release and loss from actual contract evidence.
