# Arc Studio build record

[BELL workspace and build thread](https://studio.arc.io/app/bb079c72-6d74-4e95-a4ce-8703ca67cca9?thread=d4a3ec1a-b139-4e7e-ab46-9b7dbd36e961).

## Source and build

The approved source-only transfer completed in three batches of 90, 90 and 82 files. No env files, API keys, private keys, login tokens or signed transaction journals were uploaded. The original 262-file source inventory totals 2,721,937 bytes. Its SHA256 manifest is `143d0f5c2f8998fa091efafb7a685cc89b4dd044f6eab700f4fa526d414abce4`.

All 259 text files matched their approved SHA256 values after a fresh pull following the build. Both fonts and the hero image matched their original size, header and SHA256 inside the sandbox. The CLI's ordinary pull converts these three binaries through UTF-8, so their downloaded hashes are not used as integrity evidence. No supplied BELL source was changed in Studio. Subsequent local documentation updates are separate from this frozen source bundle.

Eleven unrelated scaffold files that interfered with the build were inventoried, hash-verified and preserved outside the app in `/home/sandbox/bell-scaffold-quarantine/`. No approved source path was removed. The default build then passed without skip flags or relaxed TypeScript checks.

| Check inside Studio | Recorded result |
| --- | --- |
| `forge build` | Pass, solc 0.8.24 |
| Browser ABI check | Pass |
| Root `tsc --noEmit` | Pass |
| CRE `tsc --noEmit` | Pass |
| CRE Solidity integration | Pass, 1 test |
| `vite build` | Pass |
| Frontend tests | 47 passed |
| Engine tests | 23 passed |
| Keeper tests | 36 passed |
| CRE unit / SDK tests | 172 / 15 passed |
| Owned local replay | 9 runs, 342 transactions, exact parity |
| CRE WASM build | Pass |

The sandbox forbids npm, so the installed binaries and Bun were used instead of claiming that `npm ci` ran. The WASM SHA256 matches the locally verified build: `7ac149c12e919aba1add22a086f6e252a58c88b8838a5fff1a3f9a380f303fcf`.

The mixed sandbox contract run recorded 408 passing tests and four `EngineDiff` failures caused by Linux's per-argument size limit in `vm.ffi`. Assertions were not weakened and those failures are not described as passes. The local full contract suite passed 350 tests separately. Browser, E2E and visual evidence comes from the local checkout; those suites and the native CRE CLI were unavailable in Studio. No monolithic all-green Studio verification is claimed.

## Preview and public reads

Open the preview inside the linked Studio workspace; its bare hostname requires Studio access. An ignored sandbox wrapper imports the unchanged Vite configuration, allows the exact preview hostname and routes `/rpc` to Arc Testnet. `/api` routes to the read-and-prepare keeper. No server-held actor signing is enabled.

The corrected manifest is chain `5042002`, deployment block `71021459`. Deployment code and binding checks passed. Public state reads returned HTTP 200 in 30.4 and 68.4 seconds; `/api/state` through Vite returned HTTP 200 in 43.5 seconds. These are observed slow reads, not a latency guarantee.

The first state response and its 11-event response share canonical block `71030708`, hash `0x44d029e218f49b9065150c3876e655452fbbda9dc47560cd783d09d9cb89a3b5` and timestamp `1793969137`. The snapshot contains both configured assets, simulation receiver mode, no loans/offers/receipts/claims, and zero pool supply. No index cursor, deployment block or canonicality check was bypassed. The existing index caught up without a backend source change.

The embedded preview renders the existing design. Its rendered network verification badge and wallet interactions remain unverified: the desktop browser controls could not reliably interact with that embedded frame. API availability alone does not establish frontend transaction readiness. Connected actors must sign their own transactions. Use the [local wallet runbook](DEPLOYMENTS_AND_DEMO.md) for the verified local flow and the separate [public CRE evidence](../deployments/arc-optional-cover-runtime-evidence.json) for the four accepted Arc reports.

No Git commit, push or GitHub synchronization was performed. Explorer source verification, connected-wallet public financial replay and the submission video remain outstanding. This build record is not an independent security audit or a production deployment claim.
