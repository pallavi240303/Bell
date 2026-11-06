# Optional cover lifecycle

## Binding product requirement

A borrower may create an ordinary BELL loan without offers or a cover premium, then attach fully funded session cover to that same eligible loan during its cover window. Cover acceptance must not disburse principal again, replace the loan, move its original interest start, capitalize interest, or erase prior repayments. Buyer fixed strikes, whole lots, escrow, premiums and exact settlement arithmetic remain intact.

The owner explicitly requested this correction and immediate implementation with a bounded refactor. It supersedes covered-only origination statements in the PRD and initial implementation plan. No unrelated redesign or dependency change is authorized.

## Bounded architecture

Add one LoanManager and move existing debt/custody/repayment/loan-close operations into it. LoanVault and Pool authorize only LoanManager. CoverManager retains session receipts, CommitmentBook authority and settlement; narrow one-time-bound bridges coordinate them. This avoids expanding the current CoverManager beyond the EVM runtime size limit. No proxy, delegatecall, new governance, factory or tranche system.

A durable loanId identifies debt and collateral. A receiptId identifies one session's immutable cover agreement. Only one active receipt may attach to a loan; settled receipts remain inspectable. A later eligible session can cover the same remaining loan. Maintain explicit loan/receipt binding on every bridge and claim.

The BELL lending pool may hold ordinary and covered loans. LPs knowingly bear ordinary credit risk; coverage guarantees only its selected loan/session, not every pool share. The baseline comparator remains separate. Buyer escrow never pays another loan or an uncovered write-off.

## Preserved economics and safety

- Preserve 8% original-principal simple interest, existing risk policy defaults, exact math, at most eight whole offer lots and 32 outstanding loans.
- Accrue from the original loan start. Apply a deadline cap only while cover is active; fund all debt through that deadline using the original basis and cumulative repayments. Normal settlement before deadline removes the cap without resetting debt. At/after deadline only funded terminal closure applies.
- Healthy/partial normal settlement releases unused commitments and detaches that session's cover. Residual debt and collateral continue on the same ordinary loan. Full repayment closes debt permanently and releases any attached cover.
- Production cover interval is [scheduled close minus 7200 seconds, scheduled close minus 1800 seconds). Snapshot immutable offsets/window in receipts. Short replay offsets may be constructor-pinned only for explicitly labelled simulation deployments; they never change monetary results.
- Ordinary borrowing, collateral withdrawal, liquidation and cover admission require authenticated fresh valuation and an open/nonhalted session. Repayment/add collateral remain available without fresh prices. Cover admission must reject unsafe or insufficiently funded debt.
- Add MARKET_PRICE as an appended report kind using the existing 21-word report envelope. latestReference is asset-level, monotonic, two-source, config/corporate-bound, valid for at most 1800 seconds and only accepted during the active scheduled open interval. Borrower-provided prices are never an authority.
- Normal and post-cutoff ordinary liquidation policy must be explicit, conserve cash/collateral and record bad debt without touching cover escrow. Preserve the original 550-bps bonus and 5000-bps post-cutoff trigger / 4500-bps target, alongside configured ordinary trigger/target.
- Split conversions retain each loan's original economic share basis and immutable delivery units for prior claims. No claim or cover can consume another loan's backing.
- Enter the shared cash/debt-transition guard before book cash moves; all ordinary mutations and pool NAV reads reject inconsistent intermediate states. No bridge may create a reentrancy cycle.

## App and execution

Keep the existing frontend look. Add ordinary borrow and attach-cover actions and accurate loan/cover status through the existing wallet and unsigned API pattern. Preserve real transaction hashes, connected actor signatures and exact engine parity. Keep borrow-and-cover as a convenience only if it fits the same safe lifecycle and size limit; it cannot be the sole entry path.

New contracts need a fresh coherent deployment; existing addresses cannot gain this behavior through a frontend update. Maintain docs/DEPLOYMENTS_AND_DEMO.md. Test locally before Arc deployment. No Studio source transfer, push, history rewrite, credential exposure or hard-coded outcomes.
