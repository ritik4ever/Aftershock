# Reproducing the baseline

This checkpoint proves ordinary workshop admission and Aftershock's read/evidence integration. It does not reproduce an original local lifecycle scenario.

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

Public histories are mutable and bounded; future inspection can fail after restart, expiry or reset. Running the workshop again creates a new transaction, not deterministic historical replay. No snapshot reset strategy or replay command is implemented. Unknown source commit means source-specific invariant conclusions remain INCONCLUSIVE.

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

The report command validates schema, containment and checksum before export. No exact replay command is provided yet: each rerun uses fresh private keys and a new genesis fingerprint. The seed identifies action order only. Mining-dependent state transitions require the separate pinned consensus/execution setup described by upstream test/e2e/ethrex-mining-devnet.sh; that stack is not provisioned here.

Teardown runs on ordinary completion and handled exceptions. A hard process kill can interrupt it; inspect the exact aftershock.run label from that run's report before removing any leftover resources. Never use global Docker pruning or remove other runs' containers/networks. .gitattributes keeps shell helpers LF-terminated when checked out on Windows.
