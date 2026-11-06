# Aftershock

Find the failures before they reach Ethereum.

Aftershock runs stateful EIP-8141 Frame Transaction tests against a real isolated ethrex/sidecar stack. It checks payer solvency, keyed nonces, replacement and lifecycle behavior, then exports evidence through a CLI and local read-only viewer.

## Run

Use Linux or WSL, Node from `.nvmrc` and the locked npm dependencies:

```sh
nvm use
npm ci --ignore-scripts
npm run --silent aftershock -- help
npm run --silent aftershock -- doctor --local
npm run --silent aftershock -- serve --port 4323
```

Open http://127.0.0.1:4323. An occupied port may mean the viewer is already running; choose another port if needed. The viewer reads saved reports; it does not execute transactions or control Docker.

The existing development installation is `/home/ritik/aftershock-build` in WSL. The Windows review checkout has no installed dependencies. Other machines can use any Linux-home checkout.

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

The last checkpoint passed 93 default tests and quality gates. Integration results and known failures are in [TESTING_REPORT](docs/TESTING_REPORT.md). Desktop/mobile flows were manually verified; automated visual testing is not claimed.

This is a research tool, not a security certification. The pinned sidecar has separate dependency advisories and a reproduced Cancelled explorer inconsistency. Thirteen historical private reports fail current validation and remain preserved. Broader lifecycle edges, full raw traces and exact historical replay are outside verified coverage.

Keep `.local/`, wallets, credentials, raw logs and generated reports private. Commit only individually reviewed evidence. Prompt files are excluded from Git.

## Documentation

- [Scope and scenarios](docs/PROJECT_SPEC.md) · [Architecture](docs/ARCHITECTURE.md)
- [Setup and replay](docs/REPRODUCIBILITY.md) · [Testing results](docs/TESTING_REPORT.md)
- [Protocol differences](docs/PROTOCOL_COMPATIBILITY.md) · [Upstream attribution](docs/UPSTREAM.md)
- [Contract decision](docs/CONTRACT_FIXTURES.md) · [Threat model](docs/THREAT_MODEL.md)
- [Demo](docs/DEMO_GUIDE.md) · [Submission](docs/SUBMISSION.md) · [AI assistance](docs/AI_USAGE.md)

[MIT license](LICENSE). The official codec, workshop contracts, sidecar, ethrex and consensus software are reused and attributed; their protocol work is not claimed as Aftershock's invention.
