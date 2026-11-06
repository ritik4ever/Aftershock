# Reproducing the baseline

This guide covers the workshop baseline, Aftershock's read/evidence integration and private admission/mined lifecycle commands. Exact historical replay remains unfinished. Verified case results are listed in TEST_SCENARIOS.md.

## Environment

Use Linux-home files under WSL and the Node version from .nvmrc. Existing test checkout: /home/ritik/aftershock-build. It is a separate local clone used for builds, not a relocated Windows checkout; its Git origin points at the Windows source checkout. The agent synchronized implementation files back for manual review/commit. Never copy node_modules, reports or private workshop state into the Windows source tree. Keep the source copies synchronized before future tests; the test mirror is not automatically updated by a Windows commit.

```sh
source /home/ritik/.nvm/nvm.sh
cd /home/ritik/aftershock-build
nvm use
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm run format:check
npm test
npm audit
```

The clean install and all commands above passed on 2026-11-05. No dependency lifecycle scripts are required for these checks on the tested Linux installation.

## Official transaction path

Use a separate workshop checkout at bcfe02a196ca97b6fb0d1044db9d0b4c673831fc. Read its AGENTS.md first. The following commands were actually executed in /home/ritik/aftershock-upstream/workshop:

```sh
yarn install --frozen-lockfile
yarn typecheck
yarn test
yarn step_1_check --json
yarn step_2_tx_first --json
```

Step 1 resets progress while preserving any existing participant key. Use a dedicated checkout; do not reset somebody else's ongoing workshop. In this run, it generated a fresh throwaway account and received faucet funding. .workshop-state.json is private, kept outside Aftershock and restricted to mode 600. No genesis key was requested or used. Step 2 submitted through the normal sidecar method using the official codec.

Observed hash: 0x7fdbc4e04e6539bf4ef21c1876bb6a4e3a809c46319a1571fb61f1d0b8e1fa03. Chain 1337, block 404438; two frames succeeded. The gateway's explorer admission outcome is included, with admitted/New and included/OnChain events. This is a genuine baseline, not an Aftershock-original scenario.

## Inspect and save

```sh
npm run --silent aftershock -- doctor
npm run --silent aftershock -- inspect 0x7fdbc4e04e6539bf4ef21c1876bb6a4e3a809c46319a1571fb61f1d0b8e1fa03 --save
```

The committed docs/evidence/workshop-admission-2026-11-05.json is a filtered observation captured by the CLI, not fixture output. The command also passed after a clean install and wrote a separate ignored report. Numeric observations, node identity, events and receipts came from the real gateway. Derived consistency/check counts are labeled as derived result fields. No synthetic balances, hashes or timestamps were inserted.

Public histories are mutable and bounded; future inspection can fail after restart, expiry or reset. Running the workshop again creates a new transaction, not deterministic historical replay. Mined database/consensus snapshot restoration remains unimplemented. The admission-only TTL genesis-reset mode and its private-input prerequisites are described in README.md; it restores initial signing/genesis inputs, not historical timing. The fresh-state rerun command below supports private reports only. Unknown source commit means source-specific invariant conclusions remain INCONCLUSIVE.

## Original private admission/replacement sequences

Docker Desktop's Linux engine and Ubuntu integration are now verified. Host Bun is unnecessary: the pinned sidecar image includes Bun 1.2.23. From the Aftershock Linux-home checkout:

```sh
bash scripts/build-local-sidecar.sh /home/ritik/aftershock-upstream/sidecar
npm run --silent aftershock -- scenarios
npm run --silent aftershock -- run paymaster-solvency --local
npm run --silent aftershock -- run keyed-nonce-lifecycle --local
npm run test:integration
```

The build helper requires the clean exact sidecar commit and archives only tracked source into Docker, excluding private ignored files. Ethrex is pulled by digest, and its revision/template hash are checked. The setup preserves protocol predeploys, removes shared funded EOAs, funds fresh generated keys and starts two bounded containers on an internal network. No host ports are published; the fixed RPC program runs inside the owned sidecar container. Setup never retrieves or uses upstream genesis credentials.

The two scenario commands deliberately return native exit 3/BLOCKED while their mining branches remain unavailable. npm/WSL may normalize that nonzero status. The integration test harness directly verifies native exit 3, the expected successful admission/replacement cases, explicit blocked branch and removal of all run-owned containers/networks. Its passing result applies only to that declared subset.

Private generated genesis/config/keys/logs stay under ignored .local/<run-id>/. Reports stay under ignored reports/<run-id>.scenario.json. Reviewed real captures are copied separately into docs/evidence; do not copy private fixture directories. Artifact unit tests stay in /tmp and label their format-only reports MOCK_UNIT_TEST.

```sh
npm run --silent aftershock -- report <run-id> --format json
npm run --silent aftershock -- report <run-id> --format md
```

The report command validates schema, containment, checksum and verdict/action consistency before export. Fresh-state reruns use fresh private keys and a new genesis fingerprint; they do not restore a snapshot. The seed identifies action order only. Add --mine to select the mined lifecycle branches; otherwise the run retains the explicit blocked mining step.

## Private mining fixture

With the sidecar/execution images already prepared, pull the two additional immutable images and run the explicitly separate test:

```sh
nvm use
docker pull ethpandaops/ethereum-genesis-generator@sha256:51decce4284d8498dabfa38ae13ddce84cbf8c7be4f33a32b798ce10c9868e77
docker pull ethpandaops/lighthouse@sha256:dd7e92e2e9c3127750e9bff5f8a0efec686f296445a44ef5d9c1eb750e8906b0
npm run test:mining
```

This test creates chain 9 with 32 fresh validators, six-second slots, Fulu at genesis, Gloas at epoch 1 and Heze at epoch 2. Genesis is scheduled 60 seconds after generation begins. Readiness requires a non-genesis execution block at least 396 seconds after the genesis timestamp. Allow several minutes; a running container alone is insufficient. It then submits an ordinary signed Frame Transaction to the private sidecar and requires transaction success and two successful frame receipts.

The generator runs offline with network=none. It uses a fresh validator mnemonic, disables derived EOA premine and funds only the five generated fixture accounts. Source-defined one-wei reserved low-address allocations and protocol contracts remain. The builder deposit inhibitor is armed before generating the consensus genesis. Runtime configuration uses full execution sync, disabled EL P2P/CL discovery, an internal four-process network and no published ports. test:mining uses automatic bundling; original --mine suites use manual bundling. Reconciliation still runs in manual mode at the pinned source. Keyed transactions are then submitted through ordinary eth_sendRawTransaction; the payer test uses ordinary EIP-1559 transfers. Aftershock never invokes a privileged relay method or bundling-control RPC.

Generator logs, mnemonic-containing metadata, JWT and validator keystores stay in private ignored .local/. Generator output directories/files use modes 700/600 and are assigned to the WSL user. The generator container is tracked for teardown even if generation fails. The smoke capture is written under .local/mining-results/; lifecycle test captures go under .local/lifecycle-results/. Review these separately before publishing. Scenario exceptions also write a private diagnostic file when possible; arbitrary error text is not exported. Kurtosis is not required.

```sh
npm run --silent aftershock -- run paymaster-solvency --local --mine
npm run --silent aftershock -- run keyed-nonce-lifecycle --local --mine
npm run test:lifecycle
```

Each suite starts its own fresh chain, so the sequential lifecycle test takes two fork warmups. Independent suites can be selected with the installed tsx test runner's --test-name-pattern option. Fixture creation uses --pull never; missing images produce a blocked prerequisite instead of downloading dependencies. Obtain approval before any package installation or external deployment. No reinstall was performed for the 2026-11-06 checkpoint; the existing tree was checked with npm ls --all.

Teardown runs on ordinary completion and handled exceptions. A hard process kill can interrupt it; inspect the exact aftershock.run label from that run's report before removing any leftover resources. Never use global Docker pruning or remove other runs' containers/networks. .gitattributes keeps shell helpers LF-terminated when checked out on Windows.


## Fresh-state rerun and comparison

```sh
npm run --silent aftershock -- replay <run-id> --plan
npm run --silent aftershock -- replay <run-id> --local
# For a baseline originally run with --mine:
npm run --silent aftershock -- replay <run-id> --local --mine
npm run test:replay
npm run --silent aftershock -- compare <baseline-run-id> <rerun-run-id>
npm run test:replay:mining
```

Use a run ID saved under the current Linux checkout's reports directory, not an arbitrary path or the plain docs/evidence captures. The plan command is offline and verifies the immutable envelope before checking source pins, the exact current scenario definition and private fixture requirements. Mock/public reports, altered definitions and unsupported fixtures are refused. Execution uses the built-in runner only; saved reproducer text and observations are never executed. Fixture mode must match before Docker starts. Missing cached images do not trigger downloads.

The new run is saved independently. Standard output links both run IDs and report checksums and compares action verdicts and stable environment fields (images, chain, isolation, client version, TTL and fixture/bundling modes). Genesis, keys, hashes, network names and timings intentionally change. Raw observations are not compared; VERDICTS_MATCH is not proof of identical execution. A changed environment is reported separately and returns native exit 1. Matching BLOCKED runs return 3; matching conclusive PASS runs with the same stable environment return 0. Other outcomes return 1. A report/plan export returns 0 when valid regardless of its historical verdict.

The comparison itself is printed, not persisted as a third artifact; retain stdout if needed. The offline compare command reconstructs it from the two saved IDs, checking both envelopes and returning 0 for a successful export even when recorded verdicts differ or are BLOCKED. Both underlying reports remain immutable. Checksums are not authorship attestations. Exact historical replay still requires a pinned snapshot/reset strategy and remains unfinished. test:replay exercises two genuine non-mining fixtures, mode rejection, report checksums, offline comparison and teardown. test:replay:mining reruns each reviewed mined capture on a fresh fixture, checks the resulting action verdicts and stable environment, validates the saved report, checks offline comparison and confirms teardown. Existing imported baseline envelopes must match the reviewed capture exactly; a missing envelope is saved from that capture without overwriting an existing file. The tests are fresh-state regression comparisons, not snapshot restoration. Actual executions and outcomes are recorded in ENVIRONMENT.md.


## Projected RPC evidence

```sh
npm run --silent aftershock -- evidence <run-id>
```

New scenario reports embed ALLOWLISTED_RPC_PROJECTIONS_V1. Each entry records a completion-order sequence, local capture time, sidecar/execution channel, readiness/scenario purpose, method, digest of request parameters and a validated projected result or normalized failure. Supported hash-based reads also retain the requested transaction hash. Request bodies are not exported. Receipt fields, per-frame execution/state gas, lifecycle checks/events, entry timestamps, balances and simulation maxCost remain available as exact hex/decimal strings. Waived checks and the balance-enforcement marker are normalized flags derived from omitted text, not independent assertions.

Each step's evidenceThrough cursor references entries accumulated since the preceding step through that cursor; setup/readiness calls can precede the first action. It is a completion-order association, not an atomic snapshot or exact request-start ordering. Derived assertion summaries remain in steps; they are separate from node response projections.

The collector is scoped to one asynchronous run, bounded at 256 entries and 65,536 compact entry bytes, and records omitted/unavailable counts explicitly. On overflow it preserves the prefix and counts all later omissions. Projection failures and unrecovered scenario transport/schema failures prevent PASS. Only readiness eth_chainId failures can recover, and only after a later successful readiness response of 0x9 on the same channel; the failed attempts remain in the journal. Missing required scenario responses still block the runner. Complete means the declared filtered recording is complete under those rules; it does not mean every raw node field, pre-capture history or fixture operation is recorded.

Old reports remain unchanged and readable without this optional journal. evidence exports null with native 3 for them. Existing reports are never upgraded by inventing observations. JSON contains the projected response bodies; Markdown shows recording completeness/counts and points to JSON. Export exit 0 means the journal was exported, not that its run passed. Final pretty JSON writes and reads both enforce a 1 MiB report limit. SHA-256 detects changes, not malicious evidence authorship.


## Offline selected-output consistency checks

```sh
npm run --silent aftershock -- check-evidence <run-id>
```

This command reads the existing UUID-scoped immutable report, verifies its checksum/schema and compares selected asserted output fields with its projected RPC journal. It makes no RPC calls and does not start Docker. The requirements output reports private endpoint class, chain/version assertions, current built-in definition, journal presence/completeness and the saved run verdict. Saved metadata is not binary or operator attestation.

Current coverage is two keyed inclusion checks (successful two-frame receipts, block/status summary and included lifecycle evidence) and seven payer checks: canonical receipt status/block/gas for three transfers, the initial cost/balance boundary, distinct pending-entry timestamps, eviction statuses/enforcement marker/dropped admission, and recorded simulation-cost multiset plus post-drain balance arithmetic. Simulations are compared as a multiset because completion order does not identify their redacted transaction inputs. Each check lists its source RPC sequence IDs. Additional coverage is three TTL output checks (live predecessor, replacement timestamp/history and active successor) and nine Cancelled checks (four transfer receipts, two cancellations, replacement/reactivation timing and the recorded explorer verdict). Only the explorer consistency step may have its recorded FAIL checked against saved responses; other non-PASS steps remain insufficient. Covered steps still have selected fields only: the new cancellation transfer checks cover receipt status/block/gas, not their balance/cost summaries or transfer values. Unsupported steps are explicitly not reevaluated.

Global CONSISTENT/native 0 requires a recorded PASS with complete evidence, the expected private chain/client-pin assertions/current definition, and all selected checks consistent. A contradiction returns 1. Missing records, historical journals, non-passing runs or incompatible saved context return INSUFFICIENT/native 3. Invalid CLI arguments return 2; file/schema/integrity errors fail rather than infer a verdict. The original run is never rewritten.

This is not full scenario revalidation. Signatures, key/nonce/fee semantics, transfer values, account-query targets, simulation-to-transaction association, fixture cleanup and other unlisted actions cannot be reconstructed from redacted request digests. Coordinated falsification of both journal and summaries remains possible. No independent audit, exact replay or new live finding is implied. Regression tests deliberately alter copies of actual captures and never publish those copies as node evidence.

## Native fixture capability regression

```sh
npm run test:fixtures
```

Use the existing Linux-home dependency tree and cached mining images under the same prerequisites as the mined suites. This disposable internal-network test reads code and keyed storage, admits/mines a real keyed transaction, checks the resulting state/lifecycle and mines a native-balance transfer. Only a passing test with complete filtered recording and verified owned-resource cleanup writes `.local/fixture-capabilities-results/<run-id>.json`. This standalone infrastructure capture is not a RunReport; the CLI report/check-evidence commands do not accept it. Review and secret-check it separately before copying a filtered sample into docs/evidence. No Foundry installation or new Solidity is needed; see [contract decisions](CONTRACT_FIXTURES.md).

## Keyed replacement TTL case

```sh
npm run --silent aftershock -- run keyed-replacement-ttl --local
npm run test:ttl
```

Uses the existing two-process isolated cached-image fixture with a verified 30-second TTL; the original suites retain 300 seconds. A bounded wait is computed from the actual lastUpdatedTime with a scheduling margin; accepted replacement timestamps must differ by strictly more than the configured TTL. Missing/changed entries, clock preconditions or unrelated RPC errors cannot pass. No timestamps, chain state or sidecar status are edited. This case can PASS without --mine because its definition covers admission only. Exact boundary and terminal-status cases remain open.

The integration test checks the native CLI verdict and immutable report, evidence export equality, replay planning and cleanup. Offline check-evidence now checks three selected TTL outputs and returns CONSISTENT/native 0 for the reviewed passing capture; eight steps remain unreevaluated. The redacted journal cannot reconstruct signed fee/nonce parameters. Actual results and the filtered capture are recorded in ENVIRONMENT.md.

## Cancelled predecessor replacement/readmission

```sh
npm run --silent aftershock -- run cancelled-replacement --local --mine
npm run test:cancelled
```

Requires the same cached four-process mining fixture and several minutes of fork warm-up. Without --mine this case is BLOCKED and submits no scenario transactions. A fresh shared payer is drained by 800000000000000 wei plus actual gas, restored from a separate fresh funded EOA, then drained/restored again. Native balances, simulation maxCost, successful canonical receipts and real Cancelled lifecycle observations establish the state transitions. No contract, timestamp/status injection, admin method or public endpoint is used.

The case verifies a different below-bump replacement after the first cancellation and identical signed resubmission after the second, each within the actual 300-second lastUpdatedTime window. It then verifies live guards and checks explorer outcome separately from active status. A pinned explorer inconsistency must remain FAIL/native 1; test:cancelled can pass by accurately reproducing that known finding and verifying all other checks. This is not a green invariant run. The offline checker now covers nine selected output assertions and leaves 12 steps unreevaluated. A faithful failed explorer verdict can be individually CONSISTENT with saved responses, while the overall checker remains INSUFFICIENT/native 3 because the scenario itself is FAIL. This does not clear the upstream finding. Replay planning is checked; a fresh replay execution is not claimed here.

For this longer case only, fork readiness is polled every 15 seconds instead of the original 5-second default. Cancellation waits poll compact status responses before collecting explorer history. These changes reduce redundant observations within the existing 256-entry/65536-byte journal limit; they do not drop recorded entries, enlarge the limit or waive incomplete evidence. Every state-changing transaction and required lifecycle observation is still recorded.
