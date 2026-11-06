# BELL

**DeFi collateralizes the loan. BELL collateralizes the liquidation.**

BELL lends USDC against tokenized-stock collateral. A borrower first opens an ordinary loan, then may buy fully funded session cover on that same eligible loan. Buyers choose their fixed strike, premium and exposure, and escrow the cash before cover is accepted. Cover creates no second loan, collateral deposit or principal payment.

Chainlink CRE authenticates market facts; contracts calculate every monetary outcome. Arc executes and settles transactions. Cover protects the selected loan/session within its funded terms. The shared BELL pool also holds ordinary loans, so lenders bear ordinary credit and bad-debt risk. Buyers can lose money on the stock they commit to buy; premiums do not guarantee profit.

The corrected contracts are deployed on Arc Testnet with verified runtime hashes, reciprocal bindings and immutable REPLAY timing. Contracts, engine and keeper have local transaction/parity evidence. Four native CRE CLI simulations delivered schedule and ordinary market-price reports on Arc through the official mock forwarder; canonical receipts and receiver/oracle acceptance are recorded in the [runtime evidence](deployments/arc-optional-cover-runtime-evidence.json). **Connected-wallet public financial replay remains pending.** The earlier deployment is retained separately. These are explicitly synthetic replay reports, not a production DON or live official price feed. The stock and eligibility policy are mocks without issuer backing. The approved source-only upload and material build are complete in Arc Studio; see the [Studio build record](docs/STUDIO_BUILD.md). Public state reads work but take tens of seconds. Embedded browser verification and wallet interactions remain pending. See the [deployment status and demo runbook](docs/DEPLOYMENTS_AND_DEMO.md) for addresses, evidence and wallet steps.

The [product requirements](docs/PRD.md) describe the full lifecycle; [optional-cover requirements](docs/OPTIONAL_COVER.md) supersede the earlier covered-only implementation plan. [Keeper instructions](services/keeper/README.md), [local setup](scripts/README.md) and [CRE instructions](cre/bell-market-event/README.md) cover their execution paths.

Use Node.js 22+, npm and Foundry; the CRE package additionally requires Bun 1.2.21+ and its pinned SDK/toolchain. Run from the repository root:

```sh
npm ci
forge build
npm run abi:check
npm run test:engine
forge test
npm run test:keeper
npm run verify:replay
```

`verify:replay` owns local Anvil nodes and compares real transactions with the engine, including changed offers, ended cover with continuing ordinary debt, later-session cover, paused claims and terminal closure without a reopening price. Local scripted signatures do not prove interactive public wallet consent. Runtime evidence is written under ignored `evidence/runs/` paths.

```sh
npm run typecheck
npm run test:frontend
npm run build:frontend
npm run dev
```

Frontend, browser and visual checks must pass before release. `npm run verify` runs the current contract, engine, keeper/CRE integration, frontend/browser/E2E/visual and build gates; `npm run verify:replay` and the native CRE CLI command retain additional transaction evidence. Listing these commands does not claim every gate passes. Use the maintained runbook for connected-wallet local setup and public acceptance steps.

Money logic lives in `contracts/`; `engine/` is its exact checked mirror. The UI displays state and prepares wallet actions through the keeper. Dependencies are pinned in lockfiles. Keep keys in ignored `.env` files; never include credentials, signed deployment journals or runtime index files in source uploads. No key is needed by the unsigned actor API.
