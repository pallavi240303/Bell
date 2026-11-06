# BELL CRE worker: Coolify hosting handoff

This package runs only the background CRE worker. It does not serve the website. No public port, domain, registry username or registry password is needed.

## Server and image

Use one native Linux/amd64 server and one worker replica. Install Docker/Coolify on the server. The image is public:

```text
ghcr.io/pallavi240303/bell-cre-worker:latest
```

The supplied Compose file pins this exact release instead:

```text
ghcr.io/pallavi240303/bell-cre-worker@sha256:11aea662fefedb9d453e7041a50d62831c26101657bc380ea12b26579bb046a9
```

## Absolute storage paths

| Server path | Container path | Access |
| --- | --- | --- |
| `/opt/bell/cre-worker/data` | `/data` | Read/write; preserve state across deployments |
| `/opt/bell/cre-worker/jobs` | `/jobs` | Read only inside worker; administrator supplies job JSON files |

Run these commands on the deployment server before deploying:

```sh
sudo install -d -m 0755 /opt/bell /opt/bell/cre-worker
sudo install -d -o 1000 -g 1000 -m 0700 /opt/bell/cre-worker/data /opt/bell/cre-worker/jobs
```

The image runs as UID/GID 1000:1000. Do not replace the container paths with server paths in the environment variables. Do not delete the data directory on redeploy; it contains the dispatch journal and restart protection. Do not run parallel replicas or overlap old and new worker containers on that directory.

## Coolify settings

1. Project -> New -> Docker Compose Empty.
2. Paste the complete `compose.coolify.worker.yaml` file from this handoff.
3. Leave domains and published ports empty. Leave registry credentials empty.
4. Open Environment Variables and enter the values listed below. They are runtime values; do not add them to image build arguments or paste secret values into Compose source.
5. Save, deploy and confirm the worker is Healthy. The image has its own Docker health check; no HTTP health endpoint is needed.

## Environment variables

The attached `cre-worker.env.example` lists the editable variables. Do not deploy literal placeholder text as a key.

```dotenv
BELL_WORKER_MODE=dry-run
BELL_WORKER_POLL_MS=5000
CRE_API_KEY=
CRE_ETH_PRIVATE_KEY=
FINNHUB_API_KEY=
TWELVEDATA_API_KEY=
```

- `BELL_WORKER_MODE`: start with `dry-run`. Switch to `broadcast` and redeploy only for an explicitly authorized Arc report run. Dry run never broadcasts.
- `BELL_WORKER_POLL_MS`: leave at `5000`.
- `CRE_API_KEY`: valid Chainlink Organization CRE API key, required for executing jobs in this clean hosted container. Browser login on Pallavi's laptop is not inherited by the server. API-key access approval is still pending; empty jobs can start idle without this key.
- `CRE_ETH_PRIVATE_KEY`: dedicated report-signing key required for broadcast. Its public address must have the required permissions and enough Arc Testnet USDC for gas. Never use Alice, Rahul or Meera's keys here.
- `FINNHUB_API_KEY` and `TWELVEDATA_API_KEY`: required only for quote-snapshot jobs. Supplied replay-fact jobs do not require them.

These are fixed in Compose; leave them unchanged:

```dotenv
BELL_WORKER_DATA_DIR=/data
BELL_WORKER_JOBS_DIR=/jobs
```

No `PORT`, frontend variables, database, Redis, custom RPC variable or GitHub token is required. The Arc deployment identity and RPC are pinned in the worker. Actual secret values are supplied privately by Pallavi through Coolify; this handoff contains none.

## Verify startup

In Coolify's container terminal, run:

```sh
node --import tsx services/cre-worker/main.ts --health
```

Exit code 0 means worker readiness. Empty job directories produce an idle worker; there is no public webpage to open. Healthy does not mean a market report was submitted.

## Adding actual jobs

Pallavi supplies complete, validated, immutable job JSON files for the intended fresh replay session. Hosting does not create sessions or job files automatically. No generic job in this handoff is ready to broadcast.

Install each supplied file atomically; `job-source.json` is the administrator's actual supplied file, and IDs/configs must not be reused with different content:

```sh
sudo install -o 1000 -g 1000 -m 0600 job-source.json /opt/bell/cre-worker/jobs/.incoming
sudo mv /opt/bell/cre-worker/jobs/.incoming /opt/bell/cre-worker/jobs/job-unique-id.json
```

The worker ignores `.incoming` and reads completed `*.json` files. Add jobs only after valid authentication is configured; otherwise a due job can be recorded as rejected/failed. Never edit or requeue a dispatched job to force another transaction. A pending dispatch blocks subsequent broadcasts and must be reconciled using the instructions in `CRE_WORKER.md`.

## Scope of verification

The public image passed Linux build, 16 worker tests, image-boundary checks, health, graceful shutdown, persistent-volume restart, registry pull-back and public pull-access verification. Native CRE simulation and canonical acceptance/restart were verified locally using browser authentication. An authenticated job on this hosted server remains to be tested after credentials and a fresh explicit job are supplied.
