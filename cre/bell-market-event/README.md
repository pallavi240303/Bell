# BELL market event workflow

One CRE workflow accepts live or replay observations, validates them against Arc state, and submits a typed market-event report to the configured receiver. It does not calculate debt, exercise collateral, or settle loans. Those operations remain in the existing contracts.

## Verification

Install Node 22+, Bun >=1.2.21, and the CRE CLI. The verified toolchain was SDK **1.23.0**, Bun **1.4.4**, CRE CLI **1.39.0**, and Javy **8.1.0**. The previously reported CLI 1.3.14 was not present in this environment. SDK and dependencies are isolated here; use `npm ci` with the checked-in package lock. Do not add the SDK to the root TypeScript project.

From this directory:

```sh
npm ci
npm run check:toolchain
npm test
npm run typecheck
npm run build
npm run test:integration
```

`npm test` runs Node behavior tests and the official SDK's Bun test runtime. The latter exercises HTTP consensus, EVM reads, report signing, and EVM Write with capability mocks. `npm run build` invokes the official SDK compiler and produces `dist/workflow.wasm`; it does not simulate or deploy. The integration test executes the shared workflow through a test-only FFI boundary, passes the bytes through the real `SimulationMarketEventReceiver`, and proves settlement rejects before a valid benchmark and succeeds afterward. It compares all bytes and the hash with Solidity `abi.encode` and rejects a duplicate nonce. Its configured test contract acts as the receiver's forwarder; no receiver binding or authority is bypassed.

The sanitized results are in `artifacts/verification.json`. They are local evidence, not evidence of an Arc deployment or successful CLI simulation.

## Inputs and authoritative state

`src/schema.ts` defines the common `ObservationBundle`. `fixtures/reopen.json` uses synthetic UTC epoch integers around 1000; it has no real calendar date, is consumed by tests, and intentionally expires under today's runtime clock. It is not a canned successful live response.

Live mode uses four configured **public HTTPS** endpoints. Each endpoint must return one normalized, immutable JSON observation:

- Calendar: `kind`, `assetId`, `sessionId`, `configHash`, `observedAt`, `validUntil`, `status`, `scheduledOpen`, `scheduledClose`, `scheduledReopen`.
- Primary benchmark: `observedAt`, `price` (integer cash units per share, matching the contract).
- Secondary benchmark: `observedAt`, `price`, `corroborated` (explicit independent confirmation for an extreme move).
- Corporate action: `observedAt`, `action`, `actionId`, `multiplierNumerator`, `multiplierDenominator` (cumulative multiplier, not an inferred per-event ratio).

All integer amounts/timestamps are unsigned decimal strings. `kind` uses the Solidity enum: scheduled=1, close=2, reopen=3, corporate action=4, halt=5. Status is `SCHEDULED`, `OPEN`, `CLOSED`, or `HALTED`. Corporate actions are none=0, split=1, reverse split=2; other actions cannot be submitted. Asset-level reports use a zero session ID. Schedule open/close must match the oracle facts; the calendar supplies the official later reopen time. The oracle does not expose a separate scheduled-reopen timestamp, so this calendar field remains an external evidence requirement.

Live observations derive provider IDs and URLs from configuration and hashes from the actual response bytes; response-supplied identity/hash claims cannot override them. HTTP requests use identical-response consensus, a five-second timeout, and a 32 KiB response cap. Providers therefore need stable responses for the selected event. Reopen always requires different configured provider IDs, URL origins, response hashes, fresh observations at or after reopen, and configured price agreement. Moves strictly greater than the configured extreme threshold also require the secondary's explicit corroboration. Configuration identifies independent providers; operators must verify they are independent upstream sources.

Replay replaces only the input adapter with `config.replay`, an object using exactly the same bundle schema. It uses the same runtime clock, Arc reads, validation, encoding, and submission. Both modes read the receiver's oracle/forwarder, the oracle's bound receiver, asset nonce/hash/config/active session, session facts, finalized benchmarks, latest corporate action, and registry configuration. Each snapshot pins all calls to one finalized block. Chain ID/name/selector must agree with the SDK's capability network registry. Live mode also checks receiver workflow ID and owner.

`referenceSessionId` must identify a different finalized benchmark for the same asset. Missing reference data fails closed. **First-session bootstrap remains a deployment decision:** these finalized contracts expose no standalone reference-price getter, so this package does not invent a reference or silently take an unbound offchain value. The local settlement proof uses a synthetic reference matching its fixture's receipt; the SDK reader test separately proves reference-session reads. A real first-session run requires an approved reference-bootstrap procedure.

## Report, retry, and logs

The payload is exactly `Types.MarketEventReport`: 21 static ABI words / 672 bytes, in the order declared in `contracts/src/lib/Types.sol`. `keccak256(payload)` is the oracle report hash. Forwarder metadata and report IDs are not appended to this payload. Submission uses only `runtime.report` and `EVMClient.writeReport` to the configured mode-specific receiver; there is no generic call target or wallet transaction code.

Configuration hashing is `keccak256(UTF8(canonicalJSON(parsedConfig)))`: recursively sort object keys lexicographically, preserve array order, retain decimal/hex strings, and omit whitespace. The workflow config hash is observability evidence; it is distinct from the onchain registry `configHash`, which is never replaced by it.

Read retries are immediate, deterministic, and capped at three. The next configured cron invocation supplies the delay between executions. After fetching observations, the workflow rereads Arc state and reruns validation. An advanced nonce/hash or finalized fact prevents submission. Each execution attempts at most one write. An ambiguous result is `unknown`, with no automatic write retry. A later invocation consults chain state again; the receiver's nonce/hash checks remain the final duplicate guard even if finalized reads lag a pending transaction.

Logs contain only mode, config/report hashes, nonce/state hashes, source hashes, fixed decision codes, and transaction result/hash. Raw response bodies, provider URLs, request headers, exceptions, credentials, and private fixture data are not logged.

## Running the official CLI

`config.example.json` deliberately contains invalid zero deployment identities and example domains. Copy its shape to ignored `config.live.json` or `config.replay.json`, populate verified deployment/workflow/source identities, and set `mode` to match the target. For replay, add a valid `replay` bundle for the actual runtime time and oracle session. `project.yaml` supplies public Arc RPC configuration; confirm actual capability/forwarder availability for the deployment. Example selectors alone do not prove deployment access.

From this directory, after the owner has authenticated the CRE CLI and prepared real configuration:

```sh
cre workflow simulate . --project-root . --target replay-settings --non-interactive --trigger-index 0
```

Use `live-settings` for live inputs. Do not add `--broadcast` for a read-only simulation attempt. No deployments or broadcasts were performed here. The actual CLI attempt stopped before execution with `Authentication required: not logged in and no CRE_API_KEY set`. Owner login, deployment/source configuration, reference bootstrap, and the subsequent authenticated run remain external gates for Task 15. Never paste credentials into chat or tracked config.

Authenticated provider transport is deliberately unsupported. Automatic approval review rejected adding secret-to-endpoint Bearer transport because the destinations were not authorized for those credentials. The implemented schema rejects credential configuration and credential-bearing/query URLs. Authorizing concrete provider destinations is required before a future authenticated adapter is added.

## Official references

- [SDK 1.23.0 package](https://www.npmjs.com/package/@chainlink/cre-sdk/v/1.23.0) and [SDK source](https://github.com/smartcontractkit/cre-sdk-typescript)
- [CRE HTTP capability](https://docs.chain.link/cre/reference/sdk/http-client-ts), [EVM capability](https://docs.chain.link/cre/reference/sdk/evm-client-ts), and [runtime clock/report APIs](https://docs.chain.link/cre/reference/sdk/core-ts)
- [Project/workflow configuration](https://docs.chain.link/cre/reference/project-configuration-ts) and [official CLI installation](https://docs.chain.link/cre/getting-started/cli-installation/macos-linux)
- [CRE CLI v1.39.0 release](https://github.com/smartcontractkit/cre-cli/releases/tag/v1.39.0)
