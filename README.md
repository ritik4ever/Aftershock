# Aftershock

Find the failures before they reach Ethereum.

[Website](https://aftershock-sepia.vercel.app/) · [Demo walkthrough](docs/DEMO_GUIDE.md)

Aftershock runs stateful EIP-8141 Frame Transaction tests against a real isolated ethrex/sidecar stack. It checks payer solvency, keyed nonces, replacement and lifecycle behavior through a CLI and browser workspace, with fresh execution and live public inspection separated from recorded reports.

Test your own signed Frame Transaction or deployed sponsor-devnet contract through **Test yours**. These are live, bounded dry runs with downloadable assertions, separate from the isolated lifecycle suites. [Input format and limits](docs/USER_INPUT.md).

Deploy your compiled contract and execute ordered calls, mined transactions and Frame Transactions through **Contract lab**. Supply your own assertions; [plan format and supported account conventions](docs/CONTRACT_LAB.md).

## Run

For browser-only use, open the website; supported hosted tests need no local installation. To run the source, use a Linux/WSL checkout and an installed Node version manager:

```sh
git clone https://github.com/ritik4ever/Aftershock.git
cd Aftershock
nvm install
nvm use
npm ci --ignore-scripts
npm run --silent aftershock -- help
npm run --silent aftershock -- serve --port 4323
```

Open http://127.0.0.1:4323. Restart an old viewer process after updating code. **Start fresh isolated run** executes a fixed scenario on your WSL/Docker stack, polls actual setup stages and completed checks, reconnects after a page refresh and opens its newly saved report. Progress includes timestamps and safe failure guidance; it is not an estimated percentage. One job runs per viewer process; allow cleanup to finish before stopping it. The UI accepts no scripts, endpoints or signing keys. If the port is occupied, restart the old process or select another port.

Local execution additionally requires Docker and the pinned images/artifacts in [setup](docs/REPRODUCIBILITY.md). `npm ci` installs JavaScript dependencies only. Check readiness with `npm run --silent aftershock -- doctor --local`; a prerequisite PASS is not a scenario PASS. `tsx: not found` means dependencies are unavailable in the current checkout. Aftershock is run from source, not a published npm CLI package.

## Hosting on Vercel

Import the repository with framework **Other**, Node **24.x**, build command `npm run build:static` and output directory `dist`. `vercel.json` supplies build settings, security headers and the read-only `/api/live` and bounded `/api/test` dry-run functions; live checks need no environment variables. Optional browser execution uses `/api/runner` and the server-only GitHub token in [remote setup](docs/REMOTE_RUNNER.md). **Check network now** and **Inspect transaction now** query the fixed sponsor gateway at request time. Pending/missing receipts and upstream errors remain unavailable; saved results are never substituted. No signing keys, arbitrary transaction submission or Docker controls are exposed on Vercel.

Without remote execution configured, the hosted **Run a new test** section links to the local companion at port 4323. With the server-only GitHub token configured, supported scenarios and bounded custom contract plans execute on disposable GitHub-hosted Linux VMs. Visitors need no access code or local Docker. Capacity is shared: four starts per hour, checked on a best-effort basis, and one active workflow; other starts are refused while busy rather than added to an application queue. Setup and mining take several minutes. Vercel serves the UI/API; GitHub runs Docker.

The seven exported reports are genuine earlier runs, labeled **Recorded real run**; refreshing that list is not a new test. Remote results are shown separately and are not automatically added to archive comparisons. Artifacts expire after five days, so download reports. To rebuild the static viewer locally, run `npm run build:static` with no existing `dist`. Deploy the repository root.

Development uses a separate WSL build checkout at `/home/ritik/aftershock-build`; other users can choose any Linux-home checkout. Dependencies are specific to each checkout.

## Real evidence

Our public transaction was admitted and mined on chain **1337**, block **2020**, with **both frames successful**:

`0x5609b38df43a2dc3eb354913434354a2cc656eac8cb5074b99ebb9d265f7b3d9`

[Explorer](https://explorer.altmempool.wtf/tx/0x5609b38df43a2dc3eb354913434354a2cc656eac8cb5074b99ebb9d265f7b3d9?node=https%3A%2F%2Faltmempoolgateway.forshtat.com%2Frpc) · [Mined capture](docs/evidence/public-mined-2026-11-06.json) · [Earlier admission/timeout capture](docs/evidence/public-admission-2026-11-06.json)

This workshop baseline proves public submission/execution. Aftershock's original work is multi-step scenario automation, assertions, evidence and replay. Public history can disappear; its source commit is unknown.

## Test engine

Prepare the pinned sources/images using [setup instructions](docs/REPRODUCIBILITY.md), then run:

```sh
npm run --silent aftershock -- scenarios
npm run --silent aftershock -- run paymaster-solvency --local --mine
npm run --silent aftershock -- run keyed-nonce-lifecycle --local --mine
npm run --silent aftershock -- run staked-storage-boundary --local --mine
```

Mining fixtures need several minutes. Original suites without `--mine` report BLOCKED for omitted mining. The separate TTL case is admission-only. Fixtures use fresh private accounts, internal Docker networks and cached images; no host ports are published.

```sh
npm run --silent aftershock -- report <run-id> --format json
npm run --silent aftershock -- report <run-id> --format md
npm run --silent aftershock -- evidence <run-id>
npm run --silent aftershock -- check-evidence <run-id>
npm run --silent aftershock -- replay <run-id> --plan
npm run --silent aftershock -- replay <run-id> --local --mine
npm run --silent aftershock -- compare <baseline-id> <rerun-id>
```

Replay normally creates fresh state. TTL genesis reset and checkpoint-enabled keyed mined reset have extra requirements in the setup guide. Offline checks cover selected outputs, not full scenario revalidation.

## Checks and limits

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm audit
```

Executed checks and integration results are in [TESTING_REPORT](docs/TESTING_REPORT.md). User-provided hosted reports and screenshots demonstrate fresh payer, keyed-nonce, TTL and custom counter execution; the counter report records admission, mined frames, storage/read-back assertions and cleanup. This is scoped evidence, not exhaustive visual or compatibility testing. Recheck changed controls after deployment/restart.

This is a research tool, not a security certification. The pinned sidecar has separate dependency advisories and a reproduced Cancelled explorer inconsistency. Thirteen historical private reports fail current validation and remain preserved. Broader lifecycle edges, full raw traces and exact historical replay are outside verified coverage.

Keep `.local/`, wallets, credentials, raw logs and generated reports private. Commit only individually reviewed evidence. Uploaded hosted plans and artifacts may be public: do not submit secrets or private code. Explorer transaction JSON is neither a deployment plan nor encoded `0x06` bytes; historical environment reconstruction is not supported.

## Documentation

- [Scope and scenarios](docs/PROJECT_SPEC.md) · [Architecture](docs/ARCHITECTURE.md)
- [Setup and replay](docs/REPRODUCIBILITY.md) · [Testing results](docs/TESTING_REPORT.md)
- [Protocol differences](docs/PROTOCOL_COMPATIBILITY.md) · [Upstream attribution](docs/UPSTREAM.md)
- [Contract decision](docs/CONTRACT_FIXTURES.md) · [Threat model](docs/THREAT_MODEL.md)
- [Demo](docs/DEMO_GUIDE.md) · [Submission](docs/SUBMISSION.md) · [AI assistance](docs/AI_USAGE.md)

[MIT license](LICENSE). The official codec, workshop contracts, sidecar, ethrex and consensus software are reused and attributed; their protocol work is not claimed as Aftershock's invention.
