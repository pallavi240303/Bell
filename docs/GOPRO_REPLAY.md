# GoPro historical replay

Owner-approved scope: finish address-based lender supply/redemption first; then healthy and unhealthy existing-loan cover using the same historical GoPro path. Preserve current design and all contracts. No Playwright, public actor signing, git writes or deployment changes in this task.

## Implementation plan

- [x] Verify the existing lender controls with frontend unit tests.
- [x] Retrieve earlier origination and eligible cover-window observations from Twelve Data and Yahoo.
- [x] Add a replay-only historical HTTP adapter to the existing CRE workflow, retaining original timestamps and response hashes.
- [x] Exercise both loan principals through unchanged contracts and exact engine parity; retain transaction evidence.
- [x] Expose the walkthrough using existing frontend components and address-based signing.
- [x] Run non-browser tests, TypeScript and builds; document manual local steps and any public deployment gaps.

## Historical evidence

NASDAQ GPRO, USD, America/New_York. Friday September 4 through Tuesday September 8, 2026. Monday was Labor Day ([Nasdaq holiday notice ETS2026-47](https://www.nasdaqtrader.com/TraderNews.aspx?id=ETS2026-47)). [Yahoo historical listing](https://finance.yahoo.com/quote/GPRO/history/) provides the daily context; preserved provider responses below back the exact intraday observations.

- Origination reference: Friday 10:30 EDT, open of the minute/hour bar, $1.9699 in both providers. Only the opening field is consumed; the later bar high/low/close is not available at origination.
- Cover reference: Friday 14:30 EDT, open of the minute/hour bar, $1.775 in both providers. This is inside the LIVE contract window [14:00,15:30), before Friday's closing price exists.
- Friday daily close: $1.70, contextual only, never used for pre-close admission.
- Reopening: Tuesday 09:30 EDT, daily open $1.565. A provider daily open is a historical regular-session benchmark, not certification of a licensed official auction feed.
- Archive records are in cre/bell-market-event/fixtures/gpro. Provider retrieval credentials are excluded.

Both proposals use 10 whole mock shares. Suggested principals are 10 USDC and 11.80 USDC. The latter originates below 60%, remains cover-eligible at the verified window observation, and crosses 75% at reopening. Principal, offers and premiums are demo inputs; they are not historical loans. Interest, eligibility, cash exercise and residual debt are determined by contracts. Changing inputs may change outcomes.

The REPLAY deployment uses its existing 600/60-second cover offsets. Runtime session times are explicitly mapped from the historical sequence; historical dates remain separate provenance. This is CRE local simulation with historical HTTP observations and a simulation receiver, not live DON operation or live stock prices. The mock token's actual on-chain symbol remains unchanged.

## Run locally, lender first

From `/Users/pallavi/Documents/bell-2`:

```sh
npm run build:frontend
npm run build:cre
node --import tsx scripts/gpro-demo.ts
```

Prerequisites: Foundry/Anvil and CRE CLI installed, a working browser CRE login, and `TWELVEDATA_API_KEY` in the ignored local `.env`. This operator deliberately does not inherit a stale `CRE_API_KEY` override. Deployment approval is not needed for local simulation. The API key is copied only into a permission-restricted temporary environment file and removed on normal shutdown. No credentials belong in the frontend or hosted configuration.

The operator prints the frontend URL (`http://127.0.0.1:8789`), its fresh local wallet RPC URL and evidence directory. Add that exact RPC to the wallet as chain 31337; it is a newly owned Anvil node, not Arc Testnet. Do not connect to a previous local node by mistake. Contract and wallet transaction hashes are real local hashes, not public explorer transactions.

1. Open the frontend in the browser with MetaMask/Rabby. Select Demo, initially Lender. Connect any chosen public address.
2. In the operator terminal, enter `fund YOUR_PUBLIC_ADDRESS`. This issues local test assets and gas only. No wallet approval, supply, loan or offer is signed by the operator.
3. Supply e.g. 50 USDC through the frontend: approve the exact amount, then supply. Try withdrawing some owned pool shares and inspect the estimated contract return, confirmed hash and refreshed balances. There is no lender health-factor restriction; actual share ownership and available USDC govern withdrawal.
4. Fund borrower and buyer addresses with the same command. Each address signs its own transactions; there is no fixed list or named-wallet mapping. A single buyer can post several lots.
5. Enter `originate` in the operator terminal. Native CRE schedules the compressed session and fetches the earlier GPRO price from Twelve Data and Yahoo. The close is about ten minutes later; do not start until wallets and the lender are ready.
6. Select Borrower in the existing Demo controls. Choose lower-debt inputs, click **Fill proposed loan inputs**, approve 10 mock shares, and borrow 10 USDC. For a same-session comparison, repeat with higher-debt inputs (11.80 USDC, another 10 shares). The input buttons do not create transactions or select outcomes. You may use separate borrower addresses or the same borrower for both loans.
7. Enter `cover` after ordinary borrowing. CRE fetches the Friday 14:30 historical reference. Each buyer address must be enabled by `eligible YOUR_PUBLIC_ADDRESS` after origination. This is local mock-policy setup, not identity verification.
8. Select Buyer, connect its address and post independently chosen funded lots. An illustrative pair for **each** loan is 5 shares at 1.70 USDC and 5 shares at 1.65 USDC, with a 0.01 USDC premium per lot and maximum borrower LTV of 75%. Use expiry beyond reopening but within the demo report deadline (the operator prints exact UTC times). Four separate lots are needed to cover both loans at once; a reserved lot cannot back both. Funds and premiums remain editable demo choices.
9. Switch back to the borrower and select each ordinary loan. Choose its funded offers, approve its premium and buy cover before the displayed cutoff. Cover must attach before the window closes. Existing loan ID, principal and original interest basis remain intact.
10. At/after the printed close, enter `close`, then at/after the printed reopen enter `reopen`. These execute the actual CRE CLI. The operator refuses an early close/reopen; it does not bypass timing rules. The previous finalized context is a supplied bootstrap using Friday’s verified $1.48 daily open, not a CRE-authenticated prior session. Calendar and no-corporate-action context are explicit replay inputs; price HTTP observations are fetched by CRE.
11. Select each loan and settle its cover through the wallet. Compare actual buyer cash applied, continuing debt and claims. Lower/higher debt are proposed inputs, not promised results if you changed offers, principal or collateral.
12. Buyers collect their actual claims/premiums. Lender may redeem available shares before or after the closure. Enter `quit` to stop only this demo's local node and service.

The public Arc website and deployed addresses are unchanged. This local run does not claim public-wallet replay or a new Arc deployment. Reusing GPRO on Arc needs a separately reviewed asset/session configuration and public actor signatures; do not relabel the earlier asset.

## Repeatable verification

```sh
node --import tsx --test services/keeper/test/gpro.test.ts
node --import tsx scripts/gpro-demo.ts --verify
```

The first command uses the preserved historical responses and compares actual Anvil transactions to the existing engine exactly. The second fetches external prices inside native CRE, broadcasts reports through the official mock forwarder, checks canonical oracle receipts, and exercises both debt levels. Only isolated public test accounts sign in automated verification. Neither command uses Playwright. Keep `proof.json`, `cre-proof.json` and redacted CRE logs from the printed evidence directory; never publish its temporary `.env`.

## Verified result

[Saved local transaction evidence](../deployments/gpro-local-verification.json) records five canonically accepted native CRE reports, the operator transaction hashes and hashes of the preserved provider responses. This is local chain evidence, not Arc explorer evidence.

| Actual loan principal | Buyer cash used at settlement | Continuing debt |
| --- | --- | --- |
| 10 USDC | 0 USDC | 10.000004 USDC |
| 11.80 USDC | 4.052371 USDC | 7.747633 USDC |

These are observed results for the recorded test inputs and clock, not frontend constants. The archived replay also exercises lender redemption while the market is closed and buyer claim withdrawal. Contract/engine settlement parity passed in both paths.

Validation passed: 112 frontend tests; 178 CRE unit and 15 SDK tests; 28 root unit and 23 engine tests; 14 deployment tests; 8 worker verification tests; both archived GoPro transaction replays; 17 optional-cover and 16 pool Solidity tests; TypeScript, frontend build and CRE WASM build. The live HTTP/native CRE proof above also passed. No Playwright or connected-wallet signing was performed.

Use this local operator for historical GPRO. The generic hosted CRE worker explicitly rejects this mode instead of silently substituting its fixture input. Manual MetaMask/Rabby signatures and public Arc configuration are separate checks still required before claiming a hosted GoPro demo.

## Hosted Arc extension — approved implementation

Use the existing Arc pool, stock token, registry and simulation receiver. Register GPRO under its own asset identity without changing bytecode. The local operator prepares replay sessions and sends native CRE reports to Arc; the hosted application reads canonical state and connected addresses sign all financial actions. Do not start the timed session until the user has supplied liquidity and prepared wallets.

- Correct stock units and order the action tabs Lend, Borrow, Offer, Claims; keep cover reachable beside Borrow.
- Add a restartable Arc GoPro operator with chain/code/owner checks, credential-free evidence, exact receipt checks, and no actor signing or USDC minting.
- Verify the operator configuration/receipts and frontend without browser automation, register the public asset and publish source-only through Studio.
- Check hosted health, manifest, assets and JavaScript. Public actor transactions remain user-signed.
