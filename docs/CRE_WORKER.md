# Portable CRE worker

The worker runs the existing compiled CRE workflow in a background container. It consumes explicit jobs one at a time and records durable state. The image is `ghcr.io/pallavi240303/bell-cre-worker`, built for `linux/amd64`. Use the published commit tag or image digest for a fixed deployment; `latest` follows successful builds from `main`.

This is native CRE CLI simulation. Dry run is the default and does not broadcast. Explicit broadcast mode can submit workflow reports through the configured simulation forwarder. Neither mode establishes a deployed live DON workflow, user consent, buyer eligibility, lender funding, borrowing or settlement transactions. Seeded or generated jobs do not authorize public actor transactions.

## Run with Docker Compose

Use a native `linux/amd64` Docker host with persistent storage. The CRE Linux binary failed under the tested Mac QEMU emulation, so ARM emulation is not a verified hosting option. No web port is exposed.

```sh
mkdir -p worker-jobs
touch .env.worker
chmod 600 .env.worker
docker compose -f compose.worker.yaml pull
docker compose -f compose.worker.yaml up -d
docker compose -f compose.worker.yaml ps
docker compose -f compose.worker.yaml logs --tail 50 worker
```

The empty jobs directory starts an idle worker. Add runtime credentials privately to `.env.worker` before running actual jobs. Compose injects this file at runtime. It is ignored by Git, excluded from the Docker build and must never be uploaded as an image build input. `CRE_API_KEY` authenticates a headless CLI without browser login, as described in [Chainlink authentication documentation](https://docs.chain.link/cre/guides/cli/managing-auth). `CRE_ETH_PRIVATE_KEY` is the dedicated report transmitter key. Provider credentials, when required by the selected workflow config, are `FINNHUB_API_KEY` and `TWELVEDATA_API_KEY`.

The image runs as UID/GID `1000:1000`. Docker initializes a new named data volume with the image's writable `/data` ownership. Keep this volume across upgrades and restarts. For an existing volume or a host bind mount, its administrator must provision it for UID/GID 1000 before starting the worker. Do not delete its state to clear a pending dispatch.

The two mounts are `/data` (persistent and writable) and `/jobs` (read only). Runtime home, CLI cache and temporary files are below `/data`. The supplied Compose file uses a read-only root filesystem, drops capabilities and waits for graceful shutdown. Run one replica for a data volume; its writer lock rejects concurrent instances. Separate data volumes cannot coordinate broadcasts, so do not run a second independent worker against the same operator workload.

## Direct container command

```sh
docker volume create bell-cre-worker-data
docker run -d --name bell-cre-worker --init \
  --platform linux/amd64 --restart unless-stopped \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --stop-timeout 120 --env-file .env.worker \
  --mount type=volume,source=bell-cre-worker-data,target=/data \
  --mount type=bind,source="$(pwd)/worker-jobs",target=/jobs,readonly \
  ghcr.io/pallavi240303/bell-cre-worker:latest
```

For a private GHCR package, authenticate the host before pulling using a GitHub token with `read:packages`, passed to `docker login ghcr.io --password-stdin`. No registry credential belongs in the worker environment. Public packages need no login. Replace the image tag with `@sha256:<published-digest>` for a pinned deployment.

## Settings and jobs

| Variable | Default | Purpose |
| --- | --- | --- |
| `BELL_WORKER_MODE` | `dry-run` | `broadcast` explicitly permits report transmission. |
| `BELL_WORKER_DATA_DIR` | `/data` | Durable dispatch state and private runtime files. |
| `BELL_WORKER_JOBS_DIR` | `/jobs` | Directory of immutable JSON jobs. |
| `BELL_WORKER_POLL_MS` | `5000` | Poll interval in milliseconds. |
| `BELL_WORKER_ENV_FILE` | unset | Optional runtime-only `.env` file readable by UID 1000. |

If using `BELL_WORKER_ENV_FILE`, mount that private file read only in addition to the two directories and set its path, for example `/run/secrets/bell-worker.env`. On Linux, provision ownership and mode so only UID 1000 and the host administrator can read it. Do not put credentials in a job, CLI argument, build argument or Dockerfile.

Each `*.json` job has exactly these fields:

```json
{
  "id": "operator-approved-report-1",
  "notBefore": "<Unix seconds as a decimal string>",
  "expiresAt": "<Unix seconds as a decimal string>",
  "config": { "...": "complete existing CRE workflow config" }
}
```

The snippet describes the shape; its placeholders are not an executable job. Supply a complete config validated by the existing [workflow schema](../cre/bell-market-event/src/schema.ts), including explicit evidence and the configured prior reference session. Publish a complete file atomically into `/jobs` (write outside that directory, then rename it into place). IDs are unique, up to 48 safe characters. Keep IDs and config immutable after first discovery; duplicate IDs, changed configs, symlinked files and expired jobs fail closed.

The public Arc deployment identity is pinned to `deployments/arc-optional-cover.json`. The current receiver is a simulation receiver, so every job uses `mode: "replay"`. Supplied replay observations have a precomputed expected report hash. A config with `dataSource: "quote-snapshot"` preserves the existing workflow's native Finnhub/Twelve Data acquisition: supply its `quote` settings and provider keys at runtime. The worker does not fetch those quotes itself. It freezes the config, WASM and source state, learns a bounded structured report identity from the native execution, then validates exact canonical calldata and events. This is execution evidence rather than an independent attestation of a provider response.

The unchanged workflow still applies freshness, market calendar, corporate action, independent-source and reopen benchmark rules. Quote observations retain the provider's actual timestamp. A first reopen without the required configured prior benchmark remains rejected. Configure reviewed operator setup separately; the worker does not silently create or roll sessions, invent observations or rewrite their timestamps. If a quote broadcast crashes before its report identity is durably recorded, the global pending block remains; it is never automatically rerun.

To enable broadcasting, place the dedicated transmitter key and headless CRE API key in `.env.worker`, explicitly set `BELL_WORKER_MODE=broadcast` in that same file, and recreate the container. Use a transmitter already authorized by the pinned receiver/forwarder setup. Treat the mode switch as permission to submit the queued reports. Dry-run records are durable; use a separately reviewed new job ID for any subsequent explicit broadcast job.

```sh
docker compose -f compose.worker.yaml up -d --force-recreate worker
```

Compose reads the mode and optional poll interval from `.env.worker`. An absent mode defaults to dry run. For direct `docker run`, append `--env BELL_WORKER_MODE=broadcast` before the image name, or set it in the runtime env file.

## Status and reconciliation

```sh
docker compose -f compose.worker.yaml exec worker \
  node --import tsx services/cre-worker/main.ts --health
```

Container health describes worker readiness. It is not proof of report acceptance. The durable state distinguishes dry runs, rejected/expired jobs, unresolved dispatches and canonically accepted reports.

An interrupted or ambiguous broadcast blocks further broadcasts globally, including other job IDs and restarts. Stop the running worker before acquiring its data volume for reconciliation:

```sh
docker compose -f compose.worker.yaml stop worker
docker compose -f compose.worker.yaml run --rm --no-deps worker \
  --reconcile operator-approved-report-1
docker compose -f compose.worker.yaml up -d worker
```

Reconciliation only reads the chain and updates local evidence. It never resubmits the report. Acceptance requires exact canonical transaction, report hash, deployment identities and receiver/oracle/forwarder events. CLI exit code zero alone is insufficient. An unresolved dispatch stays blocked; do not delete the journal, change the ID or create another data volume to bypass it.

A killed or crashed container can leave `/data/.lock`. Recovery fails closed when the previous process cannot be proved dead across container boundaries. First stop every worker sharing that volume and verify the old container is stopped. Only then remove the stale lock directory with this one-off command, preserving `state.json`, pending records and all run evidence:

```sh
docker compose -f compose.worker.yaml run --rm --no-deps --entrypoint node worker \
  --input-type=module -e 'import {rm} from "node:fs/promises"; await rm("/data/.lock", {recursive:true, force:true});'
```

Run reconciliation before starting the worker again. Never clear a lock while an old worker might still be running.

## Build and publish

```sh
docker build --platform linux/amd64 -f Dockerfile.worker \
  --target runtime -t bell-cre-worker:test .
```

The build compiles the existing workflow to `/app/workflow.wasm` and runs worker tests. It uses Node `22.22.0`, Bun `1.3.14`, CRE CLI `1.39.0` (the older-glibc Linux binary for Debian Bookworm) and Javy `8.1.0`. SDK and npm dependency versions and integrity hashes come from the existing lockfiles. Tool downloads use official versioned releases and SHA-256 checks. The file-specific Docker ignore list and explicit copies exclude environment files, keys, journals, runtime indexes, contracts, engine and frontend source.

Official tool provenance: [Node image](https://hub.docker.com/_/node), [Bun release](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14), [CRE release](https://github.com/smartcontractkit/cre-cli/releases/tag/v1.39.0), [CRE manual installation and glibc selection](https://docs.chain.link/cre/getting-started/cli-installation/macos-linux), [Javy release](https://github.com/bytecodealliance/javy/releases/tag/v8.1.0).

The GitHub Actions workflow builds and tests before publishing the same image as `latest` and the full commit SHA. Its native integration fixture submits only to an owned local Anvil node using an inert fixture key, then checks canonical receiver, oracle and forwarder evidence. The fixture installs the actual public Arc forwarder's 3,692-byte runtime code, pinned by Keccak-256 `0x49ea1cbbe8b5373ef58e65cfa39a1c0f9832088a2d17b4e6698c242b9e54680f`, at its local forwarder address. This fixture is stored in `services/cre-worker/test/arc-forwarder.json`; it is included only in the test build stage, while production verification pins the same code identity.

CI also checks the container's nonroot startup, writable volume, health, graceful stop and restart. Pull requests build and test without publishing. Publication uses only the job's ephemeral `GITHUB_TOKEN` with `contents:read` and `packages:write`; no Chainlink, RPC provider or operator secret is needed by CI. The publication step records the pushed registry digest and pulls it back for verification.
