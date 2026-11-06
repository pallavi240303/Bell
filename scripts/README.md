# Scripts

`keeper-local.ts` deploys coherent LoanManager/CoverManager REPLAY fixtures. `generate-browser-abis.ts` generates all browser ABIs, including loanManager, from reviewed Foundry artifacts. `arc-deploy.ts` prepares a future corrected deployment under `deployments/runs/arc-optional-cover-journal.json` and writes `arc-optional-cover.json`; old Arc manifests/journals remain historical. No broadcast occurs without the explicit existing broadcast path. `arc-replay.ts` prepares unsigned separate borrow/buyCover packets and verifies actual wallet receipts. It reads the corrected manifest path and never reads keys or broadcasts.

For a manual local fixture, import the bounded startup helper in a persistent Node session:

```js
const {bootstrapLocal}=await import('./services/keeper/replay.ts');
const fixture=await bootstrapLocal({port:8545,actors:publicActorAddresses});
console.log(fixture.metadata);
// After connected wallets supply/borrow/post offers/buy cover:
await fixture.operatorStep('close');
await fixture.operatorStep('reopen');
// Alternative unresolved branch: advance to funded deadline, then a wallet settles.
await fixture.operatorStep('terminal');
await fixture.stop();
```

Omit `actors` to use public default Anvil actor addresses. To reuse public Alice/Rahul/Meera/lender wallets, pass their public addresses as `{borrower,buyerA,buyerB,lender}`; keys are never needed by setup and are never printed. The owner remains the isolated unlocked demo operator. Setup only mints local test tokens/funds native gas, configures an8% asset and accepts supplied schedule/fresh two-source price. It stops in a valid open cover window with no user loan, offers, pool deposit or approvals. Connected wallets sign those actions themselves. The ignored directory defaults to `deployments/runs/local-optional/` and contains manifest.json and actors.json with RPC/public metadata. The requested loopback port must be free; an occupied node is rejected.

Root owns the final API/Vite preview launch. API example:

```sh
RPC_URL=http://127.0.0.1:8545 node --import tsx services/keeper/cli.ts serve deployments/runs/local-optional/manifest.json
```

Operator time/report steps use the fixture's supplied report facts, not desired financial results. The helper is local31337/loopback/Anvil-only; it adds no public signer or control endpoint. Automated replays keep random ports and always stop. Manual startup stays alive until stop is called; register SIGINT/SIGTERM cleanup in the owning process. If manual work outlasts a reference's validity, a newly supplied fresh MARKET_PRICE is needed through `fixture.report(...)` before fresh-price actions.
