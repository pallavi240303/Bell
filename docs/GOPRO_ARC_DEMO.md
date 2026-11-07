# Hosted GoPro demo on Arc Testnet

Frontend/backend: https://arc-studio-bb079c726d744e95a4ce8703.vercel.app
Studio preview: https://studio.arc.io/share/bell-t3ysnjv2vv

The existing USDC pool is `0xe0f42a574a11ec1315521688f2340ade3fcd7751`. GoPro is a registered collateral asset in this same pool; no new pool or contract bytecode is required. Mock stock token: `0xfab1937a707294263a555dc2af27d753d2db4c1c` (`mSTOCK`). It represents test collateral, not redeemable GoPro equity. Asset ID: `0x940f35f3c997e3e96c694a303fd43763e94b9da1a160a5a3250dfbb9711e5137`.

CRE executes locally and fetches GoPro's historical observations from Twelve Data and Yahoo. Its `--broadcast` sends real transactions through Arc's simulation forwarder into the deployed receiver/oracle. This is local CRE simulation, not a live DON deployment. Calendar, corporate-action context and the previous-session bootstrap are explicitly supplied replay inputs. No CRE credentials or signing keys are required on the hosted frontend/backend.

## Publication status

GoPro is registered on Arc and all five native CRE report transactions are verified. The hosted `/api/state` snapshot contains GoPro and passes the frontend decoder. The reviewed frontend/container is built in Studio, but its CLI session has no Vercel deployment tool; the browser-connected publish step is pending. The public URL still served the earlier JavaScript at the last check. Do not treat Studio build success as publication.

## Lender first

1. Open the hosted application with MetaMask/Rabby. Connect the address you want to use. Select Arc Testnet (chain 5042002).
2. Open App → Lend, or Demo → Lender. Wait for a verified snapshot. Supply e.g. 50 test USDC: approve the exact amount, then supply in a second wallet transaction. Keep USDC for gas.
3. Withdraw a small quantity of pool shares. Review the USDC estimate from the deployed contract, sign, and verify the confirmed explorer hash and refreshed balances.
4. Withdrawals depend on owned shares and available pool cash. There is no personal lender health factor. Market closure does not itself lock withdrawals.

## Prepare wallets before starting the clock

Use any addresses, one role at a time. Actor names and addresses are not hardcoded. Each actor needs Arc Testnet USDC for gas; buyers additionally need enough USDC for their independently chosen offers. Get test USDC at https://faucet.circle.com. The operator never mints USDC or signs actor financial transactions.

In the local repository:

```sh
cd /Users/pallavi/Documents/bell-2
node --import tsx scripts/gpro-arc.ts status
node --import tsx scripts/gpro-arc.ts mint BORROWER_PUBLIC_ADDRESS
```

`mint` issues 20 mock stock shares once per address, sufficient for two proposed ten-share loans. It is an owner setup transaction. Local `.env` needs the already configured registry-owner `DEPLOYER_PRIVATE_KEY` and `TWELVEDATA_API_KEY`; the CRE CLI uses the browser login. The operator uses that testnet operator key for report gas only, never deposits, approvals, loans, offers or settlement on an actor's behalf. Credentials and signed journals remain in ignored local runtime paths.

## Run both outcomes with the same prices

1. When lender liquidity and all wallets are ready, run `node --import tsx scripts/gpro-arc.ts originate`. This starts a fresh session and sends the native CRE historical origination price ($1.9699). It prints the actual cutoff, close, reopen and maximum offer expiry. The cover clock is about nine minutes after startup; it cannot be paused.
2. Demo → Borrower: choose lower-debt inputs and click **Fill proposed loan inputs**. Approve ten mock shares and borrow 10 USDC through your wallet. Repeat with higher-debt inputs: ten shares, 11.80 USDC. You can use the same or different borrower addresses. These are ordinary loans first.
3. Run `node --import tsx scripts/gpro-arc.ts cover`. Native CRE fetches the historical cover-window reference ($1.775).
4. For each buyer address run `node --import tsx scripts/gpro-arc.ts eligible BUYER_PUBLIC_ADDRESS`. This is mock-policy setup for this session. Connect that buyer in the hosted UI. Select the GoPro asset (`0x940f35f3…`) in Stock if multiple assets appear.
5. Post independently chosen funded offers, with maximum borrower LTV explicitly chosen (75% admits these proposed loans). For each loan, illustrative lots are 5 shares at 1.70 USDC and 5 at 1.65 USDC, each with a total 0.01 USDC premium. Four independent lots cover both loans; one reserved lot cannot cover two loans. Choose an expiry after reopen and no later than the printed maximum. Exact approvals and offer posts are separate wallet transactions.
6. Connect each borrower, select its existing loan, choose its offers, approve the premium and buy cover before cutoff. The original loan is not replaced.
7. At the printed close run `node --import tsx scripts/gpro-arc.ts close`; at/after reopen run `node --import tsx scripts/gpro-arc.ts reopen`. CRE fetches the historical $1.565 reopening observation and sends a real Arc report transaction.
8. Refresh the hosted UI, select each loan and settle cover through the wallet. Inspect actual repayment, remaining debt and claims. Buyers collect claims/premiums from their own connected addresses.

Both scenarios use the same verified historical path. The default 10 USDC loan stays below the trigger; 11.80 USDC crosses it. Contracts determine results, including interest. Changing collateral, principal or offers can change the outcome. Do not expect saved local-test amounts to match every timed public run exactly.

## Evidence and restarts

`deployments/gpro-arc-verification.json` records public setup/report transaction hashes; `deployments/runs/gpro-arc` holds private runtime configuration, redacted logs and the signed operator journal. Do not upload that runtime directory. `recover` checks a saved pending CRE result without rebroadcasting. A pending or rejected report is not treated as successful; inspect its log before retrying. `originate` cannot replace an unfinalized GoPro session.

The operator's `verify-reports` command runs a short report-only session on Arc, without actor loans or offers. It proves local CRE-to-Arc reporting, not wallet interaction. Actual supply/withdrawal/borrowing/offer/cover/claim receipts must come from your hosted frontend wallet test.

If you miss the cover cutoff, do not try to replace the open session. Send `close` and `reopen` at their permitted times, then start a fresh session. An ordinary loan is not automatically covered.

## Verified on Arc

All five native CRE reports were accepted on Arc: schedule, origination, cover-window reference, close and reopening. [Reopening transaction](https://explorer.testnet.arc.io/tx/0x7616976126d4638946969b23135b9fdaa87125b9069222f590fdf681e4e90aef). No actor financial transactions were made during this report-only verification. The session is finalized; `originate` starts a new one when you are ready.

The setup evidence also retains the initial bootstrap attempt whose outer forwarder transaction succeeded but whose receiver did not accept the report. Its replacement supplied the required second-source hash and was accepted. A transaction receipt alone is not report acceptance; native reports are checked against oracle events and decoded payloads.

Studio follow-up: current frontend source and test files are synced; typecheck and 110 frontend checks pass there. Two visual-fixture inventory checks cannot run because those image baselines were excluded from the source-only transfer (all 112 pass locally). Studio switched its preview API/RPC proxy to the reviewed container. Anonymous external preview requests returned 403, so access through the authenticated Studio preview still needs the user check. Public Vercel publication remains pending.
