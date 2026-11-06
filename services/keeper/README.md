# Keeper service

The keeper indexes canonical chain evidence, refreshes contract state, prepares exact unsigned actor transactions, and verifies local replays. Contracts alone authorize money movement. The Task 10 engine is used only to check a one-receipt replay against those contract results.

Run from the repository root, using its pinned dependencies:

```sh
forge build
node --import tsx --test services/keeper/test/*.test.ts
npm run verify:replay
node --import tsx services/keeper/cli.ts replay path/to/input.json
RPC_URL=http://127.0.0.1:8545 node --import tsx services/keeper/cli.ts serve deployments/runs/local.json
```

`forge build` must create the current Foundry artifacts. ABIs and tuple fields come from those artifacts; missing artifacts fail explicitly. No nested package or dependencies are needed. Local tests need permission to bind loopback sockets and start Anvil. Each replay starts its own temporary port, uses only unlocked Anvil actors after all local gates, and waits for its own process to exit on completion or failure. No private key is read by the replay.

The server binds loopback port 8787 (`PORT` can override it). `GET /state` refreshes an authoritative snapshot, `GET /events` returns ordered canonical logs, and `GET /health` describes the signing boundary. `POST /prepare` accepts explicit caller, chain ID, allowlisted contract/method and exact arguments, or an exact approval purpose and amount. It returns unsigned calldata for the connected wallet. There is no transaction-send, report-authority, key-loading, funding, or claim-withdrawal automation endpoint.

All financial JSON inputs and outputs use unsigned decimal strings, including small ABI integers. For example:

```json
{"chainId":"5042002","from":"0x0000000000000000000000000000000000000001","contract":"manager","method":"repay","args":["1","1000000"]}
```

Preparation returns `chainId`, `from`, `to`, `data`, `value: "0"`, `sourceBlock`, and `sourceBlockHash`. The wallet should refresh/simulate again before signing. Arbitrary calldata, destination overrides, key fields, noncanonical integers, out-of-range ABI values, and chain mismatches are rejected. Cash approvals target the pool for deposits, the book for offer funding **and premiums**, and the manager for repayment. Stock approvals target the vault for collateral and backing. `CommitmentBook.reserveOffer` performs the premium pull itself.

A deployment manifest requires decimal-string positive `chainId` and `deploymentBlock`, distinct nonzero addresses keyed by `manager`, `book`, `pool`, `vault`, `cash`, `stock`, `oracle`, `registry`, `receiver`, and optionally `eligibility`, plus a 32-byte `codeHashes` entry for every address. Missing components/hashes, extra fields, invalid domains, duplicate addresses, and a deployment block after the source block are rejected. Set the starting block to the block where all components are deployed and bound, before any actor actions. Startup verifies all runtime code hashes at one checked block; actor and settlement preparation repeat that verification at their source block. The local helper records runtime hashes. This check does not establish compiler-artifact freshness. Use a separate ignored store for each deployment. The default store is `services/keeper/runs/index.json` and rejects a different identity.

The indexer fetches every block, including empty blocks, orders logs by transaction/log index, deduplicates by block hash/log index within the pinned deployment, and atomically publishes each block, projection, evidence and cursor through fsync/rename. On reconnect it compares canonical hashes, removes orphan records to the common ancestor, and backfills gaps. If no retained ancestor remains it rebuilds from the deployment block. It is a single-writer local store; do not run multiple server processes against the same path.

Events discover identifiers, not balances. `OfferPosted` is followed by `getOffer`; pool deposits/redemptions are reflected by reads even without a custom pool event. Transfer/Approval and protocol event addresses discover lenders, share recipients, payers and other relevant actors without a manual watch list. Explicit wallet watches remain available to snapshot/indexed-state callers. Snapshots include receipts, debt records/live debt, claims, offers, cash/stock balances, allowances, credits, pool NAV/supply/active IDs, backing, registry versions, session facts, benchmarks, and corporate-action/asset state. API reads use the same checked indexed block as their captured discovery logs, even if the head advances afterward. A replaced source block fails and requires a fresh index sync. Grouped reads use one block number, and the hash is checked around them. Block number, hash, and timestamp accompany every snapshot. Empty blocks refresh debt/NAV. History scans are intentionally simple and can be expensive for a large deployment; no arbitrary multi-receipt engine projection is claimed.

`settler.ts` exports the permissionless monitor. Its read callback must obtain coherent contract observations; its submit callback is a separately configured permissionless authority. It considers only `settle` and `terminalSettle`, never prices or allocations. An active receipt at or beyond its immutable deadline takes the terminal path even without a report or during a halt. Before deadline it requires an accepted, matching, unprocessed benchmark. Success, revert, and replacement are followed by a fresh observation. A pending handoff is never automatically funded or withdrawn by the monitor.

`anvil.ts` guards any local key loader with explicit local mode, configured and actual chain 31337, a loopback RPC, and successful `anvil_nodeInfo`. Arc mode rejects before any loader runs. Production actor writes belong to the connected wallet; report-forwarder authority remains separate.

`fixtures/replay.json` contains only actor addresses, funding/consent, ordered buyer terms, schedule/report facts, timing and requested actions. It contains no monetary output expectations. Every report explicitly supplies its reference, kind, asset/session IDs, observation/validity/session times, benchmark price, corporate action/action ID, multiplier, halted flag and source hashes. The strict replay schema currently supports only session kinds 1/2/3 and no corporate action; missing, extra, malformed or unsupported fields are rejected before transactions. Values are preserved in the payload; only schema version and runtime chain/oracle/config identity and nonce/state linkage are bound by the runner. Editing the buyer configurations and matching borrower consent changes real onchain results without source edits. The verification command runs three configurations, repeats the first economic configuration, and runs terminal settlement without a reopen report. The local receiver is `SimulationMarketEventReceiver` with its configured forwarder; reports are labeled local supplied facts, never live evidence.

Ignored `evidence/runs/keeper-*.json` files record canonical input/config hashes, deployment/code hashes, calldata, simulations, transaction receipts/events, coherent before/after snapshots, exact engine checks, same-timestamp conservation, report payload/hash/reference, and exact expected-revert bytes. Failed simulations retain attempted calldata in `data`; `revertData` and `expectedRevertData` separately record actual and engine-predicted errors. The three distinct outcomes are checked using actual remaining debt as well as complete outcome hashes. Evidence rejects secret-bearing field names and is created without loading secrets.

Task 11's CRE authentication/live-endpoint gates still apply. This keeper does not claim a successful CRE CLI simulation, provide market facts for a live deployment, bypass receiver authentication, or broadcast to Arc. Root integration/e2e placeholders remain explicit failures; only `verify:replay` is implemented here.
