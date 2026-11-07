# BELL workspace implementation

Approved design: the UI prompt in this conversation. Light surfaces; existing fonts, logo, navigation shell, footer, dither and staircase transition retained.

Implementation reuses React, motion and existing icons. Shared controls compose official shadcn Button, Input, Card, Dialog, Select, Tooltip and Accordion components with BELL styling; notifications use Sonner. `components.json` records the registry configuration. The original large dither footer, click sparks, card spotlight/tilt, reveal, typed text and rolling numbers are retained alongside the original page transitions and fonts. Contracts, backend source, financial calculations and Git history are unchanged.

- [x] Add tested transaction lifecycle notifications and snapshot-based demo progress.
- [x] Add shared wallet dialog, review dialog, toasts, contextual information and balance display.
- [x] Build a shared position/offer workspace and concise borrowing, buyer and lender forms.
- [x] Apply light theme, preserve brand shell and simplify landing content.
- [x] Run frontend tests/typecheck/build; start local server and verify integrated views.

Review focus: disconnected and wrong actor states; unknown balances; submitted transactions before receipt; confirmed receipts with delayed indexing; expired sessions and absent CRE evidence.

Execution: inline because side conversations prohibit agents. Keep edits uncommitted. Use actual snapshot values only; no fabricated replay outcomes. Browser validation follows integration.

## Local preview

Run the existing read service with an isolated cache:

```sh
PORT=8788 BELL_INDEX_PATH=/private/tmp/bell-ui-local-index/index.json node --import tsx scripts/serve-deployment.mjs
```

Run the frontend against it:

```sh
VITE_RPC_URL=/rpc BELL_API_ORIGIN=http://127.0.0.1:8788 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open http://127.0.0.1:5173 in the browser with your wallet extensions. The read service verifies the Arc deployment before serving state; public RPC reads can be slow. Unknown values remain unavailable.

## Verification

- Frontend regression tests: 107 passed, including initial wallet authorization events, conflicting account events, actor mismatch recovery, removal of stale reconnect warnings during balance loading, and selected-asset metadata without substituting another loan.
- TypeScript, generated ABI check and production build passed. Build retains a large-chunk warning.
- Targeted browser checks: desktop and mobile workspace/wallet/tooltips/evidence, plus a desktop supply → loan → two buyer offers → cover → settlement → claim sequence with 12 actual Anvil wallet submissions. No public actor transactions were signed.
- Existing browser tests tied to removed advanced-input UI and old visual snapshots have not been migrated or claimed passing. The new workspace suite is `tests/browser/workspace.spec.ts`.
- CRE remains operator-run; the UI shows accepted reports and labels simulation inputs. No automatic CRE execution or wallet impersonation was added.
- A prior read-only browser check loaded a verified Arc snapshot without JavaScript errors. The current lender flow watches the connected address through the existing API; it has no predefined participant addresses. The local proxy preserves the original host for same-origin validation.
- Footer/shadcn restoration: production build and desktop/mobile workspace checks passed. Separate keyboard checks verified Select open/select/Escape behavior inside the wallet dialog at 1440px and 390px widths, with no page errors or horizontal overflow. The five desktop action cards fit a 1366×768 viewport. This does not verify the outstanding public-wallet connection issue or a live Arc replay.
- Typography and source review: visible text is at least 12px, navigation/headings use dark text, Activity uses shadcn Card and the workspace log uses shadcn Accordion. Contract links come from the deployment manifest; token symbols/pause state and reference prices come from the verified contract snapshot. Activity includes an asset selector when multiple assets exist. Receiver mode comes from accepted report events; absent facts remain unavailable. The local 12-transaction browser replay passed again after these UI changes; no public actor transactions were signed.

- Native browser cursor restored; enabled buttons and links use a pointer. The main action card keeps the same desktop width and left edge when offers are hidden. Demo guidance and the loan summary span the workspace above the aligned action/offer row. Header and workspace share the same content width.

## Address-based wallets and the lender walkthrough

- Connections use the actual wallet address. There is no predefined participant list, named identity mapping, or lender-address requirement. Choose MetaMask/Rabby and grant account access; the header and review dialog show the returned address.
- Guided demo currently focuses on the lender: connect → supply or withdraw → confirmed result. Borrow/Offer/Claims remain available in App. No public funds are moved automatically.
- Supply uses an exact USDC approval when needed, followed by the pool deposit transaction. Over-balance and malformed amounts are blocked.
- Withdrawal redeems owned pool shares. The estimated USDC return comes from a read-only simulation of the deployed `redeem` function at the verified snapshot block; frontend code does not duplicate conversion math. Inputs, wallet changes, and snapshot changes invalidate the preview. The signing path still simulates and validates the exact transaction again.
- Lenders have no personal health factor in this pool. Shares and available cash govern redemption; the cover window does not lock lender withdrawals. Supply and redeem expose ordinary credit and liquidity risk.
- Connected-address USDC, pool shares, liquid pool cash, total assets and outstanding debt come from verified snapshots. Missing data stays unavailable. The confirmed transaction includes its hash, with an explorer link on Arc.
- Dynamic address pinning remains available for actions on an existing owner's loan. It never assigns a named role or changes the extension's active account. Account/chain/provider changes invalidate unsigned consent and financial previews.
- Public MetaMask/Rabby signing and public Arc replay remain separate from isolated local tests.

## Workspace motion

- Existing Motion library animates the action content’s measured height over 220ms, without scaling text or retaining an outgoing form. No new dependency or financial behavior change.
- Shared 140–220ms transitions cover control colors/borders, pressed buttons, selected offers, status badges, dropdown icons and the health bar. Short entrances and Radix accordion height animations soften content changes.
- Reduced-motion mode uses intrinsic height immediately and disables these animations. Existing page transitions, fonts and footer remain intact.
- Browser sampling confirmed intermediate heights with motion enabled and immediate resizing with reduced motion; neither mode produced page errors or horizontal overflow. Production build and type checks passed.
- Desktop/mobile workspace and keyboard checks passed after explicitly applying reduced motion for final-geometry measurements. All five desktop action cards retain their original settled dimensions and fit the laptop viewport.

## Informational landing page

- Replaced the hero dashboard card with a locally bundled, generated indigo shield protecting metallic stock-token plates under falling-market pressure, with cash reserves beneath it. The earlier liquid-ribbon illustration remains as an unused asset. A brief light sweep and entrance settle to a static image; reduced motion skips both. The illustration is conceptual, not a live financial result.
- Added five concise sections: the market-close problem, four-step lifecycle, borrower/buyer/lender roles, CRE and Arc responsibilities, and healthy/settlement/deadline outcomes. Content preserves optional cover, funded limits and buyer/lender risk.
- Supporting cards and FAQs use the existing shadcn components. Fonts, navigation, page transition and original shared dither footer are preserved.
- Ondo Finance is the current landing-page reference: spacious hero composition, strong heading hierarchy and white cards grouped on neutral rounded surfaces. BELL retains its own typography, indigo accent and economic claims; no Ondo metrics, endorsements or product claims are copied.
- Production build and type checks passed. Desktop/mobile browser inspection confirmed the image loads, all five sections render, text is at least 12px, no horizontal overflow or page errors occur, and the primary CTA opens the guided demo. Contract and backend behavior were not changed.


## Lender flow verification

- Frontend tests: 111 passed, including exact withdrawal inputs, contract-derived previews, insufficient shares/liquidity, stale preview rejection and wallet identity changes.
- Browser workspace suite: 6 passed, 2 intentionally skipped duplicate mobile scenarios. Desktop and mobile each performed an exact approval, supply and withdrawal on an isolated Anvil chain; redemption also succeeded after the market-close report. Cash and share balances matched the contract reads after the round-trip.
- Insufficient pool liquidity blocked withdrawal before signing and displayed the decoded contract reason. The test-wallet bridge preserves Anvil revert data and error codes rather than replacing them with a generic failure.
- The existing 12-transaction browser sequence passed: supply, ordinary loan, buyer offers, optional cover, settlement and claim collection. Desktop cards fit the laptop viewport; mobile checks found no horizontal overflow.
- ABI freshness, TypeScript, production build and diff whitespace checks passed. The existing large-bundle warning remains. The local frontend and proxied deployment manifest both returned HTTP 200.
- No contracts, backend production logic, financial formulas, public deployments or Git commits changed for this lender flow. Public MetaMask/Rabby signing on Arc remains unverified by these local tests.
