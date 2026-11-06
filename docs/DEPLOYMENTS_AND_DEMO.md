# BELL deployments and demo

## Delivery status

The corrected ordinary-borrowing and optional-cover contracts are deployed on **Arc Testnet**, chain **5042002**. Their runtime hashes, bindings and immutable REPLAY timing were checked at a canonical block. Both asset configurations and the bounded mock mint are confirmed. Schedule and ordinary MARKET_PRICE reports for both corrected assets were accepted through native CRE CLI simulation on Arc. Both demo buyers have confirmed mock eligibility records. Connected actor financial replay remains pending. The earlier covered-only deployment is preserved separately below.

The earlier deployed receiver uses **CRE CLI simulation and the official mock forwarder**. This is not a production DON deployment. The stock is a mock token without issuer backing. Transaction receipts and runtime code were checked; explorer source verification has not been completed.

## Corrected public setup and native CRE reports

Both configuration records are confirmed: [demo asset](https://explorer.testnet.arc.io/tx/0x17a2a7154030e327268b73242704e79b8e53b20f51a262c707b0a25ddff1e2c5) (`0x4e37900212b0e65d35a76de49e6992976f566e0961524725a18840d49fa375d6`) and [proof asset](https://explorer.testnet.arc.io/tx/0x2b0f4d71edbc607dcf4f33fd3a1f102209d2248a5e916d4bda04fe199c4a8967) (`0xc243ae199de4a4261e4e14158dbe1fd1a3ef766463317d929f7fef5e19178c75`). The [bounded mock mint](https://explorer.testnet.arc.io/tx/0x6ea80130a17be3928a9ff1468d57ae6f5012e21dcad034b7b4f204b3f7bb1a2d) supplied Alice with `10000000000000000` token units (`0.01` mock share); this is setup, not a signed actor loan or borrowing action.

The [accepted native CRE schedule](https://explorer.testnet.arc.io/tx/0xb6ab66a810060281302821fbf8d10fe93919c521fb7780c4e188f380f72340a9) at block `71029152` has report hash `0x29f5b3966296afa26c876d686fc419f017588ebc129e70fed9ee2bec5c7103a3`. The saved canonical operator proof records `ReportProcessed` from the official mock forwarder, `ReceiverReportAccepted` from the corrected receiver, and `MarketEventAccepted` from the corrected oracle in that transaction. It advances the proof asset from report nonce `1` to next nonce `2`.

This is a real public transaction carrying an explicitly synthetic replay schedule through CRE CLI simulation and the official mock forwarder. It is not a production DON, live official price feed, issuer-backed stock, or completed connected-wallet financial replay. Historical acceptance does not establish an ongoing open window or fresh reference. Refresh phase, quote expiry and eligibility before wallet actions. Earlier addresses and evidence remain preserved below.

The [accepted proof-asset MARKET_PRICE](https://explorer.testnet.arc.io/tx/0x5cc711d23ea029117533d7374863aece4d506fb72443ad4376e529ce38476063) at block `71029550` has report hash `0x6de378df260006e0aa2ea43fb0d38edd277c3469d689a92c5f78140d23bf8c0f`. It is kind `6`, carries an explicitly synthetic `$100` ordinary reference (`100000000` at 6 decimals), and advances that asset to next nonce `3`. The saved proof confirms all three forwarder/receiver/oracle acceptance events. This ordinary reference does not substitute for the official kind-3 reopening benchmark; its expiry still applies.

The [accepted demo-asset schedule](https://explorer.testnet.arc.io/tx/0xada112fdc1a4f49b5557c08fa907dbcf5ce8df6c4663f4f5c54a50f8629cc78e) at block `71029232` has report hash `0x5ace132ff24edaed93994124489e9c358442a72b1843864bf112afc201f9bb3c` and the same recorded three-event acceptance boundary.

The [accepted demo-asset MARKET_PRICE](https://explorer.testnet.arc.io/tx/0xf2d8c3472d8bedd8b2d8a4cdee0270022574ca841a24517cc15ef31efbb38ba0) at block `71029635` has report hash `0x5a6ff8583be82b24939ef725651ed4cf87f5f966581613e91c50c4d2cce1de43`. It is also an explicitly synthetic kind-6 ordinary reference, with all three acceptance events recorded.

The operator confirmed mock eligibility for [Rahul](https://explorer.testnet.arc.io/tx/0x0898ed6fad0cff8d7bfed309f36dec7583a6c64ffd2745559aa96d2209ef7e03) at block `71029691` and [Meera](https://explorer.testnet.arc.io/tx/0x7adb646b634a619b42e2fadf579bff3ecb466bc86214c4d2e48a29b6f8fc35c3) at block `71029702`, under policy `0x1428a5ebea255ff30c9d2c54eb4470f29a61a72bc9dff4251ddb8f43c8b1fa8e`. These are permissionless mock eligibility records, not production identity enforcement or buyer consent to an offer.

The recorded demo quote expires before the later cover window opens. Refresh a qualifying synthetic MARKET_PRICE before cover-window actions, then recheck the current reference, eligibility policy, phase and cutoff. Recorded setup and report acceptance do not establish ongoing borrowing or cover readiness.

<!-- PENDING_CONNECTED_ACTOR_REPLAY_BEGIN -->
Connected-wallet actor financial replay remains pending. Actors must sign their own supply, collateral, borrow, offer, premium and cover actions; no actor loan is pre-signed.
<!-- PENDING_CONNECTED_ACTOR_REPLAY_END -->

Public configuration, report boundaries, canonical verification and wallet checklist: [runtime evidence](../deployments/arc-optional-cover-runtime-evidence.json).

## Earlier covered-only deployed addresses

Source of truth: `deployments/arc-testnet.json`. First fully wired block: `70981905`.

| Component | Arc Testnet address |
|---|---|
| Canonical USDC | `0x3600000000000000000000000000000000000000` |
| Mock stock | `0x0c45b282e553979268bc406ccd1daf809240985b` |
| Asset registry | `0x53cf069e0596fcf7e31ab1c9506e6aeecf6d07dc` |
| Session oracle | `0x6c71b2c4c3b569918da247aa703ec82a73c6ce8a` |
| Mock eligibility policy | `0xa50aa5b3f01abe81b6856bd5cd5a2cd05f7a7680` |
| Commitment book | `0x36ec6ed78c74b51e2becd87c32cec3efeaa2ce12` |
| Pool | `0xe799cd7214cd6036aa17ed96a33f4fed54f37342` |
| Loan vault | `0x5faff645aa2950a08bb9b759c84e12908f11706c` |
| Cover manager | `0x87d7132e07a917a3dafe8012c760cf98a4bf0caf` |
| Simulation receiver | `0x9b857bcf1cc797e999084416a28123133f4b85a6` |
| Official mock forwarder | `0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1` |

RPC: [Arc Testnet](https://rpc.testnet.arc.io). Explorer: [Arc Testnet Explorer](https://explorer.testnet.arc.io). Faucet: [Circle Faucet](https://faucet.circle.com).

Native gas and ERC-20 USDC represent the same balance: native amounts use 18 decimals; ERC-20 amounts use 6. Do not count them as separate assets.

## Public demo wallets

| Role | Address |
|---|---|
| Alice / borrower | `0x3e09f39d6c3fcc3372d35c304f3435317360ef4b` |
| Rahul / buyer | `0x6da05b79d241f08a1556f7ded69ef3e74b520eca` |
| Meera / buyer | `0x51af7c2a4b952767dff9028d4415252bdde93f30` |
| Lender / deployment owner / keeper | `0xe3f075487d5ffb5bd7abe81d11f7927b8b8df51d` |

Actor funding was verified. Refresh balances from the chain before use. Actors connect their own wallets and approve their own supply, offer, borrowing and cover transactions. No actor private keys are required in the backend. Permissionless settlement may be submitted by the keeper.

## Existing public CRE evidence

[Accepted simulation transaction](https://explorer.testnet.arc.io/tx/0xd68f8ba9a3a1728477562fb8c927e29ec890cc52ee33f79ce97423407e2c4c17) emitted both `MarketEventAccepted` and `ReceiverReportAccepted` at block `70984972`.

Report hash: `0x2caccf2cd07ecd1220a106ea55bb4792faa029504f152148bfb04e3cddaaf14a`.

This uses explicit replay facts and a trusted reference bootstrap. It proves report delivery and oracle acceptance, not a live official reopening price or completed financial loan replay. Authenticated external quote simulation rejected stale provider timestamps; repeating the accepted benchmark returned `BENCHMARK_ALREADY_FINAL` without another transaction.

## Corrected local evidence and limits

The corrected lifecycle has recorded local transactions for nine replay variants: changed offers and repeatability, healthy/partial detachment with continuing original-basis debt, full repayment, full normal closure, no-reopen terminal closure with stock paused, and later-session cover on the same loan while earlier claims persist and another ordinary loan remains distinct. The keeper replay recorded 342 actual transactions, 55 modeled lifecycle transitions and 37 exact expected-revert observations. These are local script-signed observations, not connected-wallet public consent.

Actual native CRE CLI simulation on an owned local Anvil also delivered schedule and ordinary MARKET_PRICE reports through the official mock forwarder, with `ReportProcessed`, `ReceiverReportAccepted` and `MarketEventAccepted` checked. The proof includes exact ordinary borrow/repay/cover/settlement parity. A kind-6 dry run is separate from the transactions that were actually broadcast. Refreshed CRE independent review passed; the subsequent portable CLI command was also reviewed and exercised with a new local proof. This establishes local CLI simulation, not a production DON, live official price feed or corrected public Arc deployment.

A kind-6 ordinary quote never substitutes for the official kind-3 reopening benchmark. External calendar, independent prices, corporate state and historical reopening reference must retain their authentic source identities and timestamps; stale supplied facts must reject. Terminal closure deliberately needs no reopening price.

Supported monetary corporate multiplier components are positive and at most `uint64.max`, although their wire fields remain `uint128`. Each loan reserves worst-case future conversion headroom for remaining shares alongside immutable outstanding claims. Conversion headroom and financial close do not imply that physical stock backing exists or that paused claims can be delivered.

## Local demo runbook

Use Node.js 22+, Foundry/Anvil, and the committed lockfile. Commands are from the repository root unless noted:

```sh
npm ci
forge build
npm run abi:check
npm run test:engine
forge test
npm run test:keeper
npm run verify:replay
```

The replay owns and stops isolated local nodes. Inspect the latest `evidence/runs/keeper-replay-summary.json` and its referenced variant evidence rather than treating older files as a new run. It checks actual contract outcomes; changing offers changes calculated results. Do not present its automated local signatures as interactive wallet consent.

For a manual connected-wallet demo, leave port 8545 free and start a persistent Node session:

```sh
node --import tsx --interactive
```

In that session:

```js
var {bootstrapLocal} = await import('./services/keeper/replay.ts');
var fixture = await bootstrapLocal({port: 8545});
await fixture.node.client.request({method:'anvil_setBlockTimestampInterval',params:[1]});
console.log(fixture.metadata);
```

The helper owns an isolated chain 31337 node and stops before pool deposit, user loan, offers and approvals. Default actors are public local Anvil addresses. The exact public Arc role addresses remain listed in Public demo wallets above; use that explicit mapping only when those are the connected wallets intended for the run. To use distinct connected wallets, pass their public addresses as `actors: {borrower, buyerA, buyerB, lender}` when bootstrapping; setup needs no actor private keys. It funds/mints only local demo assets, configures actual 8% original-principal interest, and installs explicitly supplied schedule/reference facts. Keep the session alive; clean up with `await fixture.stop()` before exiting.

In separate terminals:

```sh
RPC_URL=http://127.0.0.1:8545 node --import tsx services/keeper/cli.ts serve deployments/runs/local-optional/manifest.json
npm run dev
```

Open [the manual local app](http://localhost:5173). The frontend must target that manifest/API and show chain 31337, REPLAY timing, supplied simulation facts, mock stock and connected-wallet signing. Use the controlled Anvil clock with timestamp interval `1`: each ordinary transaction advances chain time by one second; larger operator advances remain explicit. The setup stops before actor supply, offers, loans and approvals; no actor loan is pre-signed. Use `GET /manifest`, `/state`, `/events`, `/health` and `POST /prepare`; there are no `/replay/play` or report-control API endpoints in the current keeper. The API only reads and prepares unsigned actor requests. Borrow/repay use LoanManager; cover uses CoverManager. Approvals go to pool for supply, book for offers/premiums, vault for stock/backing, and LoanManager for repayment.

For the manual wallet run, complete these actions in order:

- [ ] Connect the lender wallet, approve the pool and supply liquidity.
- [ ] Connect Alice, approve collateral to the vault, open the loan and borrow through LoanManager without cover.
- [ ] Connect Rahul and Meera, approve the book and post independently chosen, fully escrowed offers.
- [ ] Inside the cover window before cutoff, connect Alice and approve any premium, then attach cover to that same loan through CoverManager.
- [ ] Verify no replacement loan, second principal payout or interest reset; inspect rejected invalid/out-of-window actions.
- [ ] Use explicit operator close/reopen steps, submit settlement by wallet, and inspect continuing debt, claims and refunds.
- [ ] Use a separate run for terminal closure and changed offers; retain wallet receipts and compare exact contract/engine outcomes.

Follow the acceptance checklist below using wallet signatures. In the persistent operator session, after borrowers/buyers finish their actions:

```js
await fixture.operatorStep('close');
await fixture.operatorStep('reopen');
// Alternative unresolved run: advance to the funded deadline, then settle by wallet.
await fixture.operatorStep('terminal');
```

Normal and terminal paths are separate runs. An ended normal receipt has no remaining terminal protection. Operator steps supply time/report facts, never a desired financial outcome. If a reference expires, supply a new qualifying MARKET_PRICE through `fixture.report(...)` before another fresh-price action; do not alter provider timestamps to make old data fresh. Rebootstrap for independent scenarios and preserve evidence before stopping the node.

For the isolated CRE package and native CLI proof:

```sh
npm --prefix cre/bell-market-event ci
npm --prefix cre/bell-market-event run check:toolchain
npm --prefix cre/bell-market-event test
npm --prefix cre/bell-market-event run typecheck
npm --prefix cre/bell-market-event run build
npm --prefix cre/bell-market-event run test:integration
npm --prefix cre/bell-market-event run test:cli:local
```

The package requires Bun 1.2.21+ and the pinned CRE tooling. The local CLI runner owns its node, deploys the official mock-forwarder fixture, keeps dry-run and broadcast evidence separate, and retains a local proof file. A WASM build alone does not prove CLI execution. Live quote integrations require configured external APIs and secret handling; replay evidence must remain labelled supplied/synthetic where applicable.

Frontend migration, browser consent and visual verification are separate release gates. Use `npm run typecheck`, `npm run test:frontend`, `npm run build:frontend`, `npm run test:browser`, `npm run test:visual` and `npm run test:e2e` against the intended fixture. Existing stage evidence is not a claim that every current check passes. Root `test:integration` runs keeper tests, CRE tests and CRE contract integration. `npm run verify` includes formatting, TypeScript, contract/engine tests, those integration checks, browser/E2E/visual checks and frontend/CRE builds. Run the replay and native CLI checks separately for their transaction evidence.

## Corrected demo acceptance checklist

- [ ] Deploy and verify the corrected lifecycle; record its manifest and addresses below.
- [ ] Lender supplies liquidity; Alice borrows without buying cover.
- [ ] Rahul and Meera post configurable, fully escrowed offers.
- [ ] Alice attaches cover to the same existing loan inside the explicit cover window.
- [ ] Verify no second principal payment, no loan replacement and no reset of accrued interest.
- [ ] Prove rejection before the window, at/after cutoff, with insufficient capacity, and with invalid price evidence.
- [ ] Deliver a validated CRE replay report and submit permissionless settlement.
- [ ] Verify healthy/partial settlement ends session cover while any residual loan continues under ordinary rules.
- [ ] On a separate active-cover run, verify price-independent terminal closure at/after the funded deadline, paused claim persistence, repayments and owner-only withdrawals.
- [ ] Prove unused buyer cash is released correctly and no buyer escrow pays another loan's losses.
- [ ] Repeat using different offers and compare actual contract outcomes with exact engine results.
- [ ] Retain inputs, configuration hashes, receipts, events, explorer links and parity evidence.

## Corrected deployment

**Deployed and independently verified.** Public manifest: [corrected Arc deployment](../deployments/arc-optional-cover.json). Public transaction links and verification details: [deployment evidence](../deployments/arc-optional-cover-evidence.json). All 15 deployment/wiring transactions succeeded. Final binding block: `71021459`; independent verification block: `71022011`, hash `0xb8aac03c5cc721b21f2433c357ac6d81a90298229c98b8a5190c5e144e0ef11e`.

| Component | Corrected Arc Testnet address |
|---|---|
| Canonical USDC | `0x3600000000000000000000000000000000000000` |
| Mock stock | `0xfab1937a707294263a555dc2af27d753d2db4c1c` |
| Asset registry | `0xeb9c98789dd35a0402caa90542ac1fe16a09bf6b` |
| Session oracle | `0xb60c0cff473d4d16e5efc8f7412cdd90e91f2417` |
| Mock eligibility policy | `0xbf187808dfe7fc20b433a6004fe60f307f41e85a` |
| Commitment book | `0x3f0619a06a27417cdae0ab78dbe50e4edf866289` |
| Pool | `0xe0f42a574a11ec1315521688f2340ade3fcd7751` |
| Loan vault | `0xa76ded1b9b8fc58f393c7f4a0417e5cf711f87e3` |
| Loan manager | `0xffb0353b2a4c86af1ec4661e768e051612343757` |
| Cover manager | `0xc4f7aef503279bed1ad60076a81d7ad6997d7175` |
| Simulation receiver | `0x757b15c0ce785fe26be159ba98ca443d1e6394c4` |

The execution manifest remains `deployments/runs/arc-optional-cover.json`; its private resumable signed journal is `deployments/runs/arc-optional-cover-journal.json`. Never upload that journal. Keep the earlier `deployments/arc-testnet.json` and its evidence unchanged. The new deployment uses REPLAY 600/60-second offsets, mock stock/eligibility and the official mock forwarder; it is not a LIVE/DON deployment. No actor supply, borrow, offer or cover transaction has been signed by this deployment step.

The existing deployment script constructs an explicitly labelled **REPLAY** simulation topology with a separate LoanManager, CoverManager, mock stock/eligibility and official mock forwarder. It binds book to CoverManager/pool, pool/vault to LoanManager, managers reciprocally, and oracle to receiver. Verification must check actual runtime hashes, dependencies, final binding block, canonical USDC and immutable profile: LIVE 7200/1800 seconds or REPLAY 600/60 seconds. The script currently pins REPLAY; it does not create a LIVE deployment.

The confirmed deployment used these operator commands; another run resumes only its recorded signed transactions:

```sh
node --import tsx scripts/arc-deploy.ts
node --import tsx scripts/arc-deploy.ts --broadcast
```

The first command is preflight only but requires the dedicated deployer key in ignored `.env`; never print it. The second spends testnet gas and persists exact signed transaction bytes before broadcast for identical-transaction recovery. Keep signed journals private and out of uploads. Archive/publish only sanitized transaction hashes, receipts, addresses, runtime identities and public configuration.

Using the verified corrected manifest, prepare a bounded scenario with `scripts/arc-replay.ts`. It requires explicit chosen loan/receipt IDs, original 8% configuration and per-loan smoke exposure at most 0.5 USDC original principal / 0.01 share. These are script smoke limits, not protocol-wide loan limits. With `SCENARIO.json` replaced by the reviewed file:

```sh
node --import tsx scripts/arc-replay.ts SCENARIO.json borrow
node --import tsx scripts/arc-replay.ts SCENARIO.json buyCover
node --import tsx scripts/arc-replay.ts SCENARIO.json verify PACKET.json TX_HASH
```

Prepare/sign/verify each action sequentially against fresh canonical state; save each emitted packet as its own `PACKET.json` and provide the actual signed transaction hash for verification. The tool prepares unsigned packets and does not broadcast. The actor signs through their own wallet. Supply, approvals, offers, report delivery and eligible windows must already be established for the respective action; `buyCover` selects the existing scenario loan, not a new borrow template. Receipt verification includes canonical transaction/state identity and exact engine results, with Arc native-backed USDC gas reconciled separately. Script verification itself does not establish interactive consent.

The recorded constructor profile is REPLAY. Runtime identities and public evidence are linked above. Explorer source verification remains separate and incomplete; checked runtime code does not mean source has been published on the explorer.

## Arc Studio delivery

Existing project: [BELL in Arc Studio](https://studio.arc.io/app/bb079c72-6d74-4e95-a4ce-8703ca67cca9).

The approved 262-file source-only upload is complete. Studio built the contracts, frontend and CRE workflow and ran the checks recorded in the [Studio build record](STUDIO_BUILD.md). All approved source bytes are verified: 259 text hashes after pull and three binary hashes inside Studio. Public state and boundary-matched events return HTTP 200; state reads took 30–68 seconds. The existing frontend renders, but its embedded browser verification badge and wallet interactions remain unverified. No Studio secret-vault provisioning is claimed. Connected-wallet public financial replay, explorer source verification and the submission video remain outstanding. Keep credentials, login tokens and signed journals out of source uploads.
