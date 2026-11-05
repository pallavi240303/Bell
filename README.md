# BELL

DeFi collateralizes the loan. BELL collateralizes the liquidation.

BELL is a pre-funded liquidation commitment layer for tokenized-asset lending. Buyers lock USDC and choose their strike, premium, and exposure before the underlying market closes. Chainlink CRE verifies the market event, BELL settles deterministically, and Arc provides the execution and settlement network.

The protocol is built contract-first. See `docs/PRD.md` for the product rules and `docs/IMPLEMENTATION_PLAN.md` for the test-first delivery sequence.

Use Node.js 22 or newer with npm and Foundry. Install the exact dependencies from the committed lockfile, then run the workspace checks from the repository root:

```sh
npm ci
npm run verify:workspace
```

`npm run typecheck` and `npm run lint` run strict TypeScript checking. `npm run format` and `npm run format:check` format and check Solidity. `npm run build` checks TypeScript and builds contracts. `npm test` runs the workspace unit smoke tests; `forge test` runs contract tests once they exist. The empty scaffold has no protocol implementation, contract tests, or application build yet.

`npm run test:integration`, `npm run test:e2e`, `npm run verify:parity`, and `npm run verify:replay` fail explicitly until their packages exist. `npm run verify` includes those stages and therefore intentionally fails while they are pending. TypeScript formatting is deferred to application tooling.

All direct npm dependencies are pinned exactly. No external Solidity library is installed until a contract requires one; pin its exact version and source revision when it is introduced. Keep credentials in ignored environment files. `.env.example` lists variable names with empty values only. Generated builds, deployment-run output, and runtime evidence are ignored.
