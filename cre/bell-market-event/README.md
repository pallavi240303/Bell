# BELL market event workflow

One CRE workflow validates market observations against pinned onchain state and sends schema1 reports to the configured receiver. All reports retain the same21-word /672-byte envelope. Debt, custody, cover and settlement remain in contracts.

## Toolchain and verification

Pinned SDK1.23.0, viem2.38.5 and zod3.25.76 are isolated in this package. Verified tooling is Node22+, Bun1.3.14 (minimum1.2.21), CLI1.39.0 and Javy8.1.0. Use the checked-in package lock; no root SDK dependency is needed.

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run test:integration
npm run test:cli:local
```

The unit suite includes one owned-Anvil deployment check. SDK tests use the genuine SDK runtime with capability mocks. Build produces `dist/workflow.wasm`; build success alone is neither simulation nor deployment. Solidity/FFI integration checks exact bytes through the actual simulation receiver/oracle, ordinary borrowing, a newer reference used for later cover and an independent reopening benchmark. No forwarder/receiver authorization is bypassed.

`test:cli:local` starts and owns a fresh loopback Anvil31337, verifies the existing four local-control gates, deploys the unmodified official CLI mock-forwarder artifact, and uses the SDK's native `anvil-devnet` selector7759470850252068959. Its temporary project supplies an explicit forwarder override; it does not impersonate Arc or weaken chain checks. The script uses only a deterministic inert local test account, funded on its owned node. Its temporary `.env` is deleted afterward; it never reads the owner's root `.env`, provider keys or deployer key. Production default CLI limits remain enabled. The proof separates a no-broadcast dry run from actual local CLI transactions, verifies `ReportProcessed`, `ReceiverReportAccepted` and `MarketEventAccepted`, and retains actual hashes and exact engine parity. Local script actors do not establish interactive wallet consent. The official fixture/license/provenance live in `fixtures/cli/`.

## Report kinds and authority

Kinds remain scheduled1, close2, official reopening benchmark3, corporate action4, halt5, with ordinary MARKET_PRICE appended as6. The encoder and valid old1–5 golden bytes/hashes remain unchanged. `keccak256(payload)` is the oracle's report hash. Forwarder metadata is outside this payload.

MARKET_PRICE is an asset-level report: outer bundle/report.sessionId is zero. Its calendar must independently retain inner assetId/sessionId/configHash identifying the active scheduled session. Both price observations name that same active session. The active oracle schedule is authoritative even when configured `sessionId` selects a different historical target; kinds1–3 retain their configured target semantics.

Ordinary price acceptance requires an effective exact config, nonhalted asset, active SCHEDULED session, and both current execution and source observations in `[scheduledOpen,scheduledClose)`. Both price sources must be fresh, nonfuture, positive and within uint96, with different configured provider IDs, normalized HTTPS origins and raw-response hashes, plus configured price agreement. The primary's actual timestamp becomes report.observedAt, strictly newer than the stored reference. Both price observations must not precede the latest corporate action. Validity is inclusive at execution and cannot exceed observedAt+1800; freshness cannot exceed1800 even if configuration is looser.

Corporate evidence must match the accepted current action/hash and cumulative multiplier, or NONE/zero action ID and1/1 before any action. Accepted monetary multiplier components are1..uint64.max; the wire fields remain uint128. A true halt invalidates the old reference permanently until another qualifying newer report; unhalt does not revive it. Repayment and collateral addition availability remains contract policy, independent of this producer.

`latestReference` is inspectable historical storage, not by itself authority for a loan. Contract consumers use `requireFreshReference`. A MARKET_PRICE changes neither session phase nor benchmark storage. There is no `ReferenceAccepted` event: acceptance is proven by existing `MarketEventAccepted(kind6,asset,session0,nonce,reportHash)`, the full stored reference and canonical asset/schedule state. A successful forwarder transaction alone is insufficient.

The older `referenceSessionId` lookup remains a **different finalized official benchmark**, used only for kind3 extreme-move policy. It is never a fallback ordinary reference. A first ordinary loan can bootstrap from two qualifying current sources without a historical benchmark; kind3 still requires its separately configured finalized historical reference.

## Sources and current quotes

All normalized integer amounts/timestamps are canonical unsigned decimal strings. Configured normalized endpoints are public credential-free HTTPS DNS URLs; credentials, query/fragment ambiguity and numeric/IP origin aliases reject. Response-provided provider ID/URL/hash cannot override configured identity or the digest of actual response bytes. A source cannot be treated as independent merely because its URL spelling differs.

Normalized calendar responses include kind, assetId, sessionId, configHash, observedAt, validUntil, status, scheduledOpen/Close/Reopen. Primary/secondary responses name assetId/sessionId and actual observedAt/price; kind3 can additionally require explicit secondary extreme-move corroboration. Corporate responses name assetId, actual as-of observedAt, action/actionId and cumulative multiplier. Kind6 fetches both prices and current corporate/calendar facts. Missing or conflicting identities reject; they are not filled from another provider.

The checked-in example URLs remain **unconfigured examples**. This stage does not establish production calendar/corporate endpoints, economic independence of upstream vendors, a successful live feed or an official historical reopening auction. Replay fixtures are explicit supplied observations, including synthetic times; stale fixtures reject under a real clock.

`dataSource: "quote-snapshot"` uses exact current NVDA quotes from fixed Finnhub and Twelve Data endpoints. Numeric lexemes convert to6-decimal integer units without floating point arithmetic. Finnhub `t` and Twelve Data `timestamp` remain actual provider timestamps; no runtime/calendar time substitution occurs. Stale or future quotes reject, including last-trade quotes over a closure.

Live kind6 may use current quotes only with actual current public calendar/corporate facts from the configured reader; it has no replay fallback. Quote binding must name the independently checked active session. Quote APIs do not emit BELL session hashes: their binding comes from the fixed NVDA request plus actual observation time inside the authenticated calendar. Current quotes are ordinary reference evidence, never official historical reopening proof. Existing kind3 current-quote snapshots remain explicitly replay/simulation-only; live kind3 rejects before credentials are requested.

Secret IDs are fixed to `FINNHUB_API_KEY` and `TWELVEDATA_API_KEY`. Credentials enter only the official fixed quote request plans: Finnhub header `X-Finnhub-Token`, Twelve Data `apikey`. The code rejects non200 responses, including redirects. Keep real values only in the owner's ignored `.env` and approved secrets mappings; no value belongs in tracked JSON or evidence. This stage uses inert SDK fixtures and local CLI keys only, with no genuine provider request claim.

## Canonical reads, resources and errors

`marketSnapshot(assetId,sessionId,referenceSessionId)` is a bounded read-only66-word /2112-byte aggregate of normalized asset state, target/active sessions, target/reference benchmarks, corporate fact and ordinary reference. It preserves the assetState default nonce1 and all standalone getter semantics, including inspectable expired/invalidated facts. It does no financial computation or state mutation. CRE retains dedicated raw assetState reads, all receiver/oracle/forwarder/workflow identity pins, registry identity and one finalized-block pin for the first snapshot.

Before submission a second finalized header/assetState read must preserve nonce/hash and byte-identical raw asset state. Advancement produces a no-write result; inconsistency fails closed. Facts are cached only within the invocation. Time/decision validation runs again immediately before one submission.

Fully populated successful paths use11 chain reads live /9 replay, including both headers and the final raw guard. Live kind6 uses4 HTTP requests and5 consensus calls including report signing; replay fixtures use no HTTP and1 consensus. Quote snapshots additionally need2 secret requests; successful secrets are cached only for that invocation. Cumulative before-dispatch counters prevent retries exceeding default15 chain reads,15 HTTP,50 consensus or5 secrets. There is at most one write. The aggregate is composed from small ABI tuples to avoid Javy recursion at subscription.

HTTP observation size is checked using the SDK's actual protobuf consensus encoding, with headroom below25kb, including escaped/multibyte input. This workflow-boundary cap does not arbitrarily shrink the independent32KiB quote parser. Request encoding also remains below120kb. Raw capability failures are converted to fixed codes before consensus/logging. No resource limit is raised.

`submitted` requires both transaction success and explicit receiver execution success. Receiver reverts return `reverted`; missing confirmation returns `unknown`. Ambiguous writes are never retried. Logs expose only finite codes, mode/source labels, hashes, nonce and permitted transaction evidence. Do not use `--verbose` or `--engine-logs` with provider credentials: underlying CLI logs may contain authenticated requests.

Public corrected-Arc evidence and any production DON deployment remain separate gates. CLI simulation/local broadcast is not a production DON claim.
