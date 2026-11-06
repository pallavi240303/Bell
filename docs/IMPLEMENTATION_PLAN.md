# BELL Implementation Plan

The earlier covered-only plan is superseded by the binding [optional-cover requirements](OPTIONAL_COVER.md) and the staged [optional-cover implementation plan](OPTIONAL_COVER_PLAN.md). Use those documents with the corrected [PRD](PRD.md). This page is a delivery index, not authorization to repeat completed work or create commits.

## Current architecture and constraints

Ordinary `LoanManager.borrow` creates a durable loan before offers or a cover premium are required. Optional `CoverManager.buyCover` attaches a fully funded session receipt to that same eligible loan during its immutable window. Acceptance never borrows again, deposits collateral again, replaces the loan or resets its original 8% interest basis/prior repayments.

LoanManager coordinates debt/collateral and is the sole pool/vault authority. CoverManager coordinates session receipts and the book through guarded one-time-bound bridges. The shared BELL pool includes ordinary and covered debt, so LPs bear ordinary credit risk. Only the selected loan/session may consume its reserved buyer escrow; the separate baseline has no access to it.

Every normal outcome ends the receipt and releases unused cover. Residual debt continues ordinarily on the same loan. An active receipt reaching its deadline instead receives price-independent funded terminal closure. Buyer claims persist across either path and physical delivery may remain pending. Durable loan IDs, session receipt IDs and claim IDs remain distinct.

LIVE cover offsets are constructor-pinned at 7200/1800 seconds; REPLAY offsets are 600/60. Monetary corporate multiplier components are positive through `uint64.max`, with unchanged `uint128` wire fields and per-loan future conversion headroom alongside immutable claims.

- Money logic lives only in contracts; the engine matches exact values, errors and state.
- Preserve the approved frontend look and connected-wallet signing boundary.
- Authenticate external schedule, ordinary reference, corporate and official reopening facts through separately labelled CRE authority paths.
- A kind-6 ordinary quote is not an official kind-3 reopen.
- Mock stock/eligibility do not establish real issuer backing or production eligibility.
- Never hard-code monetary outcomes or expose keys; keep credentials in ignored `.env` files.
- No git writes or source uploads without the owner's authorization; ask before structural changes.

## Delivery sequence and evidence

The staged optional-cover plan owns task dependencies and review boundaries. Its stage reports contain scoped changes and recorded verification; none alone proves the full product release.

1. Verify durable ordinary lending, optional funded attachment, guarded settlement, exact engine parity and supported conversion bounds.
2. Verify keeper snapshots, unsigned transaction construction, coherent deployment manifests and input-driven local replay.
3. Verify CRE source/state orchestration, receiver identity, actual CLI simulation and separate ordinary-reference/reopen authority. Local CLI evidence exists; independent review remains a gate.
4. Complete frontend lifecycle migration without visual change, with distinct actor signatures and browser/E2E/visual checks.
5. Run the current root verification pipeline and retain command output; document failures without weakening checks.
6. Deploy a fresh corrected Arc topology only through authorized deployment actions; verify runtime identities and retain public wallet/report/settlement evidence.
7. Transfer source to Arc Studio only after approval, demonstrate material Studio work and retain build history/preview/video evidence.

The earlier Arc addresses implement the covered-only flow and remain historical. The corrected topology is deployed separately, with verified runtime hashes and bindings; connected public actor replay and new report evidence remain pending. Arc Studio source transfer remains unapproved. The [deployment and demo runbook](DEPLOYMENTS_AND_DEMO.md) maintains exact old addresses, public evidence and remaining acceptance steps.

## Verification commands

Run from the repository root with Node.js 22+, Foundry/Anvil and the isolated CRE package's Bun/toolchain installed:

```sh
npm ci
npm --prefix cre/bell-market-event ci
npm run verify
npm run verify:parity
npm run verify:replay
npm --prefix cre/bell-market-event run test:cli:local
```

`verify` checks formatting, TypeScript, contract build/tests, engine, frontend, keeper/CRE integration, browser, E2E, visual and frontend/CRE builds. `test:integration` is the keeper plus CRE tests and actual contract integration, not a placeholder. The explicit replay and native CLI commands retain their own transaction evidence. Running or listing a command is not a success claim; release claims require observed passing output and completion of the public delivery gates above.
