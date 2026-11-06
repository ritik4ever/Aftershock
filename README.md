# Aftershock

Find the failures before they reach Ethereum.

[GitHub repository](https://github.com/ritik4ever/Aftershock)

Aftershock is a stateful scenario runner for Ethereum Frame Transactions and alternative-mempool lifecycle rules. It runs original shared-payer and keyed-nonce scenarios against private ethrex/sidecar processes and inspects public admission/receipt evidence. Use `--local --mine` for mined lifecycle checks; a local read-only report viewer is available. Current verified coverage and remaining limits are recorded in [TEST_SCENARIOS](docs/TEST_SCENARIOS.md).

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

A separate admission-only TTL case is available with the same cached private stack:

```sh
npm run --silent aftershock -- run keyed-replacement-ttl --local
npm run test:ttl
```

It verifies a 30-second local TTL, below-bump rejection before expiry, live duplicate rejection after expiry, replacement after expiry and fee rejection after timestamp refresh. It makes no mining or exact-boundary claim. See [coverage](docs/TEST_SCENARIOS.md).

A separate cancellation/readmission case uses the cached mining stack:

```sh
npm run --silent aftershock -- run cancelled-replacement --local --mine
npm run test:cancelled
```

It drains/restores a fresh EOA payer through mined transfers and checks Cancelled fee exemptions, identical reactivation and live guards. It also checks explorer metadata against the active entry. A scenario FAIL remains a finding even when its regression test successfully reproduces the pinned behavior. See [compatibility notes](docs/PROTOCOL_COMPATIBILITY.md) and [actual results](docs/ENVIRONMENT.md).

## Local report viewer

```sh
npm run --silent aftershock -- serve
# Optional: serve --port 4320
```

Open http://127.0.0.1:4318 from the Linux-home checkout. The loopback-only viewer reads validated local reports and four clearly labeled reviewed examples, counting each run ID once. It supports filtering, scenario prerequisites, action timelines, RPC journals, JSON/Markdown exports, selected evidence checks, fresh-state replay guidance and compatible-run comparison. It exposes no transaction, shell, file-write or Docker controls and does not check live node connectivity. Stop with Ctrl+C. API/security and script interaction tests pass; the user manually verified Scenarios, Runs, Compare and Markdown downloads. Automated visual/mobile QA remains unverified. Exact snapshot replay and the remaining live protocol edge cases are still unfinished. `npm run test:upstream-rules` separately exercises exact TTL, status and integer fee boundaries in the cached pinned sidecar image with networking disabled; these are source-method tests, not live admission evidence.

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

Without `--mine`, the two original lifecycle suites report **BLOCKED** because the selected fixture does not produce blocks. Native CLI exit 3 communicates BLOCKED. Those two integration tests verify the admission/replacement subset and the explicit blocked branch.

A separate `npm run test:mining` checks automatic sidecar inclusion. The original suites use manual sidecar bundling with block reconciliation and ordinary execution-client submissions:

```sh
npm run --silent aftershock -- run paymaster-solvency --local --mine
npm run --silent aftershock -- run keyed-nonce-lifecycle --local --mine
npm run test:lifecycle
npm run test:fixtures
```

These commands use fresh private ethrex/Lighthouse/validator/sidecar stacks and wait several minutes for staged forks. They require cached images from the commands in [Reproducibility](docs/REPRODUCIBILITY.md#private-mining-fixture). Image pulls are disabled during fixture startup. No Kurtosis runtime is required. Agents must obtain approval before installing dependencies or deploying externally; existing disposable local tests are authorized.

`test:fixtures` additionally checks native nonce-manager runtime/storage, keyed inclusion and a real EOA balance decrease. It does not deploy workshop contracts. The [contract decision](docs/CONTRACT_FIXTURES.md) explains why the current suites need no new Solidity and identifies coverage limits.

```sh
npm run --silent aftershock -- report <run-id> --format json
npm run --silent aftershock -- report <run-id> --format md
npm run --silent aftershock -- replay <run-id> --plan
npm run --silent aftershock -- replay <run-id> --local [--mine]
npm run --silent aftershock -- replay <run-id> --plan --reset
npm run --silent aftershock -- replay <run-id> --local --reset
npm run --silent aftershock -- compare <baseline-run-id> <rerun-run-id>
npm run --silent aftershock -- evidence <run-id>
npm run --silent aftershock -- check-evidence <run-id>
```

Reports use exclusive writes, validated IDs and SHA-256 integrity checks. Integrity detects accidental changes; it does not authenticate a report's author. `replay --plan` reads a saved report offline. `replay --local` reruns its current built-in scenario in fresh isolated state; `--mine` must match the original fixture mode. It saves a new run and prints linked checksums, action verdicts and stable environment differences. Matching BLOCKED results remain BLOCKED. The offline `compare` command reconstructs a comparison from two saved reports without Docker or RPC; its exit 0 means the export succeeded, regardless of the recorded verdicts. This is a fresh-state rerun, not exact historical replay; no snapshot is restored. See [scenario coverage](docs/TEST_SCENARIOS.md).

`replay --local --reset` supports newly recorded, complete admission-only `keyed-replacement-ttl` runs. It reads the original disposable keys from private Linux `.local/<run-id>/keys.json`, reconstructs the pinned genesis, requires identical cached image IDs, and starts new isolated containers with empty state. The comparison requires matching genesis, observed initial block and all five signed submission request digests. Missing/unsafe private inputs block the run; mismatched inputs cannot pass. Keep `.local/` private and out of Git. Historical reports without initial-state evidence are unsupported. This is initial-genesis reset, not mined database/consensus snapshot restoration or exact historical timing. Run `npm run test:reset` for the real isolated integration check.

`npm run test:checkpoint` exercises the separate library-level mined checkpoint capability on a fresh Linux fixture. It stops and copies execution, beacon, validator and sidecar runtime directories together, rejects corrupted snapshot data, restores the saved block/balances/nonce, checks that a later control receipt disappears, and resumes mining a genuine frame transaction. Verified on 2026-11-06 in isolated run `01d55dbd-0479-4044-9674-7a7c0d81663f`: restored block `0x44` after a control transfer at `0x45`, then observed two successful frame receipts at the new `0x45`. Private snapshots and capability observations remain under ignored Linux `.local/`. This is a pre-scenario checkpoint primitive; mined CLI replay and exact historical timing are still unfinished.

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

Remaining work: exact replay, fuller redacted evidence, remaining OnChain/Finalized/Reverted and Submitted/Pending cases and exact TTL-boundary coverage. Public node source commit remains unknown. UI work follows the core engine checkpoints.

The upstream workshop, sidecar and codec are existing projects credited in UPSTREAM.md. No upstream protocol implementation is vendored. The mining fork schedule and builder-predeploy workaround are adapted from the attributed upstream fixtures. Aftershock is [MIT licensed](LICENSE).


New private runs include a bounded, allowlisted RPC journal: node response fields, normalized rejection codes, lifecycle checks/events, gas use and actual receipts. Steps reference the journal's completion-order sequence through evidenceThrough. The evidence command exports this journal offline after validating the saved envelope. Historical runs without a journal return evidence: null and native exit 3; they are never retroactively filled in. A successful export exits 0 even for a BLOCKED run; inspect the report verdict separately.

The journal omits request payloads, signatures, calldata, receipt logs and arbitrary server text. Requests retain only a SHA-256 digest and a transaction hash for supported hash reads. Recording is capped at 256 entries and 64 KiB of compact entry JSON; omissions or projection failures prevent PASS. Recovered readiness failures remain visible and are accepted only after a later successful chain-9 response on the same channel. This is a filtered evidence trace, not a complete raw RPC transcript, exact replay or independent attestation.


check-evidence is an offline selected-output consistency check. It compares supported receipt, timestamp, status and cost/balance summaries with the saved journal, lists its covered checks and not-reevaluated steps, and never re-executes transactions. CONSISTENT applies only to that listed scope; fullScenarioRevalidated is always false. The native exits are 0 for consistent selected checks, 1 for a contradiction and 3 for insufficient evidence. Historical reports without journals and incomplete/non-passing runs cannot yield consistency success. Altered redacted request amounts or signatures cannot be checked from a digest. The TTL case now has three selected checks; the Cancelled case has nine. Its saved explorer FAIL can be individually consistent with recorded responses while the overall checker remains INSUFFICIENT; the original finding is preserved.
