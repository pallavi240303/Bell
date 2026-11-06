# Keeper service

The keeper indexes canonical evidence, refreshes contract facts, and prepares unsigned actor transactions. Contracts authorize all money movement. The deterministic engine independently checks local transaction results using complete durable loan, receipt, claim, offer, actor and token observations.

Run from the repository root:

```sh
forge build
npm run abi:generate
npm run abi:check
npm run test:keeper
npm run verify:replay
RPC_URL=http://127.0.0.1:8545 node --import tsx services/keeper/cli.ts serve deployments/runs/local-optional/manifest.json
```

Tests start isolated random-port Anvil nodes and stop them on success/failure. They read no private keys. Local setup requires chain31337, loopback and successful Anvil capability checks. The manual bootstrap intentionally stays alive; see `scripts/README.md`. Generated Foundry artifacts are required.

`GET /state`, `/events`, `/manifest`, `/health` and `POST /prepare` retain their existing paths. The API provides reads and unsigned packets; connected wallets sign their own actions. There is no actor signer, impersonation, report-control or funding endpoint. Money inputs/outputs are canonical decimal strings. For example:

```json
{"chainId":"31337","from":"0x0000000000000000000000000000000000000001","contract":"loanManager","method":"repay","args":["1","1000000"]}
```

LoanManager accepts borrow/repay/addCollateral/withdrawCollateral/liquidate/topUpBacking/finalizeHandoff. CoverManager (`manager`) accepts buyCover. Pool/book/vault actor actions retain their existing allowlists. Repayment approves LoanManager; offers and premiums approve book; collateral/backing approve vault; pool supply approves pool. Permissionless settle/terminalSettle remain receipt-indexed in their separate preparation/monitor lane. Stock mint/pause are local demo-operator operations only.

Manifests require unique nonzero manager, loanManager, book, pool, vault, cash, stock, oracle, registry and receiver addresses, optional eligibility, and exact code hashes. The manifest boundary follows every binding. Verification checks runtime identity, reciprocal dependencies, book→CoverManager, pool/vault→LoanManager, oracle/receiver and immutable LIVE7200/1800 or REPLAY600/60 profile. Earlier deployed addresses cannot acquire the corrected ABI through a UI update.

Snapshots expose `loans[loanId]` as the sole current debt/custody/backing owner. `receipts[receiptId].receipt.loanId` joins immutable cover agreements; historical ended receipts have zero coverage and never contribute debt/NAV again. `pool.activeLoanIds` exposes the contract's legacy activeReceiptIds getter accurately, preserving its order. Claims retain the ABI's legacy receiptId field, which means durable loanId. Assets include all config versions, corporate state, latestReference and pinned requireFreshReference classification; a halt/unhalt invalidated reference is not considered usable. `stockTokens[token]` holds all represented token balances, vault allowances and accounted backing. `coverPolicy` records immutable profile/offsets. Cash allowance names distinguish LoanManager, book and pool.

Financial reads remain pinned to the captured indexed boundary, with final canonical-hash guards. Logs discover IDs/actors only. Global USDC evidence/discovery is filtered to BELL counterparties. The weighted FIFO client retains24units/sec, cheap requests1/others4, groups≤6, HTTP batches≤8, nonoverlap and response-completion+1sec reservation. Retries re-enter pacing; aborts remain honored. Index chunks≤64blocks/header workers≤8, atomic persistence, raw provenance, reorg rollback, sync/snapshot singleflight and explicit event-boundary behavior remain intact.

The fixture uses actual8% original-principal interest and named schedule/origination-price/window-price/close/reopen facts. MARKET_PRICE is appended kind6 with sessionId0 and independently checked active schedule; it is admission valuation, never an official reopen benchmark. No-reopen terminal still includes origination/admission prices. Three configurable offer cases plus identical repeat, healthy/partial detach, full repayment, unresolved terminal, paused claim rollback, later session receipt2 and simultaneous distinct loan3 are real local transactions. Expected amounts/errors come from the reviewed engine; all represented state is compared exactly after modeled actions. No tolerance or hard-coded monetary outputs.

Ignored `evidence/runs/keeper-*.json` retains supplied inputs/hashes, real receipts/calldata/events, canonical before/after observations, exact revert bytes, transition parity and seals computed after final observations. Script/unlocked local signatures are never labelled interactive user consent. Prior evidence files remain historical; the latest summary names the current runs.

Public Arc canonical USDC uses native-backed cash accounting: sender ERC20 cash includes gas. Exact verification binds canonical chain/token/receipt identity, gasUsed×effectiveGasPrice, canonical inclusion-parent native/cash and one final floor with dust. It conservatively rejects transactions sharing an inclusion block and unexplained source-to-parent actor/protocol mutations. Public MAX_UINT allowance behavior is unverified; smoke uses finite explicit approvals. Local MockCash parity remains independent of native gas. No public deployment or live report proof is claimed here.
