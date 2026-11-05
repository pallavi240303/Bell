# BELL

DeFi collateralizes the loan. BELL collateralizes the liquidation.

BELL is a pre-funded liquidation commitment layer for tokenized-asset lending. Buyers lock USDC and choose their strike, premium, and exposure before the underlying market closes. Chainlink CRE verifies the market event, BELL settles deterministically, and Arc provides the execution and settlement network.

The protocol is built contract-first. See `docs/PRD.md` for the product rules and `docs/IMPLEMENTATION_PLAN.md` for the test-first delivery sequence.

