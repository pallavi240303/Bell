# Browser application

Run `npm run abi:generate` after `forge build`, then `npm run dev`. The development server proxies `/api` to the read-and-prepare keeper on loopback port 8787 and `/rpc` to the local chain on port 8545. Start the keeper with `RPC_URL` and its deployment manifest using `services/keeper/cli.ts serve`.

For another deployment, serve the keeper and public RPC through the same origin, or supply the public `VITE_RPC_URL` at build time. The public `/manifest` contains addresses and code hashes only. Never supply a signer or bearer credential to the browser.

Connect an EIP-1193 wallet on the manifest chain. Each actor panel has a collapsed exact-input section for approvals and complete consent/offer terms. HTTP integers are canonical decimal strings. Supply is in cash units; redemption takes pool shares. The borrower selects whole lots in order and supplies complete consent; generated ABI tuples determine hashing and calldata. No detached signature is requested.

Every actor write independently verifies the manifest, account, chain, source block, target, value and calldata, simulates, requests a wallet transaction, waits for its canonical receipt or replacement, then refreshes the coherent snapshot. Missing or failed snapshots display unavailable values. The control and replay panels read accepted evidence and cannot forward reports or change token/clock state.

Verification:

- `npm run build:frontend`: ABI freshness, typecheck and production build.
- `npm run test:frontend`: transport, wallet, controller and ABI checks.
- `npm run test:browser`: isolated local contracts with connected-wallet actor paths and settlement boundaries.
- `npm run test:visual`: immutable approved screenshot comparisons at both viewport sizes. Remaining comparison failures are recorded in the task report; do not update baselines to hide them.

The root integration and end-to-end verification commands remain explicit incomplete gates. A live deployment and the complete multi-wallet replay require separate verification.
