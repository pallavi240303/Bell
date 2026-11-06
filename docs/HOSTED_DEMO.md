# Hosted wallet demo

Use the corrected manifest in `deployments/arc-optional-cover.json`. Contracts, economic rules and the existing visual design are unchanged.

## Hosting

1. Connect Vercel in the existing BELL Arc Studio project. Authorize access in your own account.
2. Publish the reviewed source using root directory `./`, the root `Dockerfile.vercel` and Container preset. Root `vercel.json` explicitly selects `container` and resets npm/static build overrides. Clear dashboard Build Command, Install Command and Output Directory overrides. Set the public project variable `PORT=3000`; allow a request duration of at least 240 seconds.
3. Do not use a static Vite-only deployment: the same server must provide `/api/*` and `/rpc`.
4. Do not upload `.env`, API keys, deployer or actor private keys, login tokens, signed journals or cached runtime data. The hosted read-and-prepare service uses the public Arc RPC and needs no signing key. CRE/operator credentials stay local.
5. Check `/healthz`, `/api/health`, `/api/manifest`, `/api/state` and the `/api/events` response pinned to that state block. Confirm chain `5042002` and the corrected manager addresses.
6. Open the deployed app in Brave. Confirm the verified Arc network badge and a real source block before signing.

The index rebuilds from actual finalized chain logs after an empty container restart. Local filesystem state is a cache, not durable evidence. A started process or successful image build alone does not prove public application readiness.

## Four wallets from the same interface

Open **WALLET & EXACT INPUTS** on the existing borrower, buyer or lender page. Select the actor and wallet extension independently; connect only the matching account. The app displays the expected public address and refuses signing for another account. Changing actor, provider, account or chain clears unfinished transaction consent.

| Actor | Public address |
| --- | --- |
| Alice | `0x3e09f39d6c3fcc3372d35c304f3435317360ef4b` |
| Rahul | `0x6da05b79d241f08a1556f7ded69ef3e74b520eca` |
| Meera | `0x51af7c2a4b952767dff9028d4415252bdde93f30` |
| Lender | `0xe3f075487d5ffb5bd7abe81d11f7927b8b8df51d` |

1. Switch between MetaMask and Rabby using the wallet selector. Select the actor account inside that extension yourself. All actors use Arc Testnet USDC for gas.
2. Lender: approve an exact amount and supply liquidity. Alice: approve collateral. Rahul and Meera: approve their chosen offer cash. Complete these before starting the timed replay window.
3. Start a fresh explicitly synthetic CRE replay session and price report using the local operator. An expired session cannot be reused. Do not start the cover clock until the wallets and hosted app are ready.
4. Alice: open an ordinary loan. Rahul and Meera: post independently configured whole-lot offers. Alice: review the selected offers, premium approval and exact consent, then attach cover to that same loan during its cover window.
5. Deliver the close/reopen reports through the local CRE workflow. Choose `settle` using the session receipt ID; use `terminalSettle` only when the contract deadline permits it. The underlying loan ID and cover receipt ID are separate identifiers.
6. Each actor approves their own transaction in MetaMask or Rabby. Record its public hash, wait for the canonical receipt, refresh and compare contract state/events. Withdraw claims and credits only from their owning actor.

The frontend and backend never sign for any actor. CRE simulation reports are labelled synthetic and do not establish live DON deployment. Keep the real connected-wallet replay evidence separate from local test-wallet results.

## Wrong build preset: forge not found

If Vercel runs the repository's `npm run build` as its platform build and then reports `forge: command not found`, it is using the standard npm build path. The intended container obtains Foundry from its first stage and compiles contracts inside Docker. Do not replace this with a frontend-only build; the same deployment must serve the keeper API and RPC proxy.

Deploy a commit containing root `vercel.json` and `Dockerfile.vercel`. Confirm the selected repository/branch is `pallavi240303/Bell`, `main`, with Root Directory `./` and Framework `Container`. Clear custom dashboard Build/Install/Output overrides and deploy the updated source. If publishing uploaded files through Studio, sync both root files into that uploaded source first. Verify the deployment log uses Docker build stages before testing the public frontend and API; configuration validation alone is not deployment proof.
