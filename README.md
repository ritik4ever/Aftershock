# Aftershock

Find the failures before they reach Ethereum.

Aftershock is a stateful scenario runner for Ethereum Frame Transactions and alternative-mempool lifecycle rules. It runs original shared-payer and keyed-nonce admission/replacement sequences against private ethrex/sidecar processes, separately verifies real private mining and inspects public admission/receipt evidence. The original suites' mined lifecycle branches remain unfinished; there is no UI yet.

## Run the CLI

Use a Linux-home checkout under WSL, with nvm already installed:

```sh
nvm install
nvm use
npm ci --ignore-scripts
npm run --silent aftershock -- help
npm run --silent aftershock -- doctor
npm run --silent aftershock -- versions
npm run --silent aftershock -- scenarios
npm run --silent aftershock -- inspect 0x7fdbc4e04e6539bf4ef21c1876bb6a4e3a809c46319a1571fb61f1d0b8e1fa03 --save
```

`.nvmrc` pins the tested Node version, 24.22.2. The implementation/test checkout for this session is `/home/ritik/aftershock-build`; the Windows IDE checkout retains reviewed source files for your manual commits. Dependencies and generated wallets stay in Linux. No application environment variables or signing keys are required by the read-only CLI.

`inspect --save` creates an exclusive JSON observation under ignored `reports/`. It checks hashes, chain/payer/sender consistency, frame counts, history continuity, transaction status and each frame's receipt. Missing receipts or history are unavailable evidence, not proof of an invariant failure. Public node source identity remains unknown, so source-specific conclusions remain INCONCLUSIVE. The captured observation is a filtered projection, not a raw replay artifact.

## Real transaction evidence

Transaction `0x7fdbc4e04e6539bf4ef21c1876bb6a4e3a809c46319a1571fb61f1d0b8e1fa03` was mined in block 404438 on chain 1337; both frame receipts show success. [Captured evidence](docs/evidence/workshop-admission-2026-11-05.json) includes the actual admitted/included events and receipt.

[View in the upstream explorer](https://explorer.altmempool.wtf/tx/0x7fdbc4e04e6539bf4ef21c1876bb6a4e3a809c46319a1571fb61f1d0b8e1fa03?node=https%3A%2F%2Faltmempoolgateway.forshtat.com%2Frpc). The route returned HTTP 200; browser rendering was not checked. This is the workshop baseline, not an original Aftershock lifecycle test. History can disappear after a devnet reset.

## Checks

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm audit
```

Aftershock's tested npm lockfile reports zero vulnerabilities. Runtime libraries are Zod, viem and the official @forshtat/hegota-support codec; no alternate codec is implemented. The separate pinned sidecar has upstream dependency advisories; it is restricted to private disposable fixtures, not represented as production-safe.

## Isolated scenarios

Docker Desktop's Linux engine and WSL integration must be available. Prepare a separate pinned sidecar checkout as described in [UPSTREAM](docs/UPSTREAM.md), then run from the Linux-home Aftershock checkout:

```sh
bash scripts/build-local-sidecar.sh /home/ritik/aftershock-upstream/sidecar
npm run --silent aftershock -- run paymaster-solvency --local
npm run --silent aftershock -- run keyed-nonce-lifecycle --local
npm run test:integration
```

Each run creates its own internal network, fresh genesis-funded accounts and pinned processes; no shared genesis keys or public transactions are used. No RPC/P2P ports are published. A fixed Docker-exec transport reads the owned private network. Containers and network are removed afterwards; ignored `.local/` retains private keys/logs and `reports/` retains filtered reports. Do not publish either directory wholesale.

The current suites report **BLOCKED**, with individual admission/replacement checks passing, because mined predecessor/balance changes are not implemented in their non-mining fixture. Native CLI exit 3 communicates BLOCKED. The two integration tests pass only when those real subsets pass and the remaining branch is explicitly blocked; they do not claim full-suite completion.

A separate `npm run test:mining` test starts a fresh private ethrex/Lighthouse/validator/sidecar stack, waits beyond the staged Hegota fork and requires an ordinary Frame Transaction to execute successfully. It needs two additional pinned images and several minutes of startup; use the exact commands in [Reproducibility](docs/REPRODUCIBILITY.md#private-mining-fixture). This fixture is the prerequisite for adding mined lifecycle branches, not completion of those branches. No Kurtosis runtime is needed.

```sh
npm run --silent aftershock -- report <run-id> --format json
npm run --silent aftershock -- report <run-id> --format md
```

Reports use exclusive writes, validated IDs and SHA-256 integrity checks. Integrity detects accidental changes; it does not authenticate a report's author. Exact historical replay remains unimplemented. See [scenario coverage](docs/TEST_SCENARIOS.md).

The original dependency-free bootstrap probe is also available:

```sh
node scripts/probe-devnet.mjs
node --test tests/probe-devnet.test.mjs
```

The probe needs Node >=20.12 and no installed packages. It only reads the configured public gateway; successful diagnostics do not demonstrate admission or execution. Unit tests use test transports, never publish mock evidence, and require no network.

- [Project scope and proposed invariants](docs/PROJECT_SPEC.md)
- [Threat model](docs/THREAT_MODEL.md)
- [Pinned upstream sources](docs/UPSTREAM.md)
- [Protocol compatibility and differences](docs/PROTOCOL_COMPATIBILITY.md)
- [Environment, blockers and next setup steps](docs/ENVIRONMENT.md)
- [AI usage and user decisions](docs/AI_USAGE.md)
- [Current architecture](docs/ARCHITECTURE.md)
- [Reproducing the baseline](docs/REPRODUCIBILITY.md)

Current blockers: the original suites still need balance-change/eviction and included/dropped predecessor assertions connected to the separate mining fixture. Public node source commit remains unknown. UI work will wait for the core lifecycle integration.

The upstream workshop, sidecar and codec are existing projects credited in UPSTREAM.md. No upstream protocol implementation is vendored. The mining fork schedule and builder-predeploy workaround are adapted from the attributed upstream fixtures. Aftershock is [MIT licensed](LICENSE).
