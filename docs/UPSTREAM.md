# Upstream research

Inspected 2026-11-05. Source snapshots were cloned outside the project under the Windows temporary directory `aftershock-upstream`. They are research checkouts, not dependencies or vendored code. Clone again at the exact pins if temporary files disappear.

| Project | Inspected commit | Dependency policy |
| --- | --- | --- |
| [Workshop](https://github.com/forshtat/mempool-workshop/tree/bcfe02a196ca97b6fb0d1044db9d0b4c673831fc) | bcfe02a196ca97b6fb0d1044db9d0b4c673831fc | Yarn Classic, yarn.lock, Node >=20.12 |
| [Sidecar](https://github.com/forshtat/mempool-workshop-sidecar/tree/2e22ff0a2898e69ea4bf5275bce1be8581a8582a) | 2e22ff0a2898e69ea4bf5275bce1be8581a8582a | bun.lock; package scripts use Bun |
| [Ethrex tracer branch](https://github.com/forshtat/ethrex/tree/9aa3645d795945c64400f41a70aace0edfa7f383) | 9aa3645d795945c64400f41a70aace0edfa7f383 | Rust execution client; not built |

## Implementation evidence

All sidecar paths below are relative to the pinned [source tree](https://github.com/forshtat/mempool-workshop-sidecar/tree/2e22ff0a2898e69ea4bf5275bce1be8581a8582a).

| Rule family / concern | Inspected source |
| --- | --- |
| SOLVENCY behavior | packages/executor/src/services/MempoolService/obligations.ts; service.ts checkBalanceObligations and enforceBalances |
| LIFECYCLE behavior | packages/executor/src/entities/FrameTxMempoolEntry.ts canReplace/canReplaceWithTTL; MempoolService/service.ts validateReplaceability; BundlingService/reconciliation.ts calls enforceBalances per block |
| LOCAL pending limits | MempoolService/constants.ts and reputation.ts checkEntityCountInMempool; checkNonceKeyConflict in service.ts |
| REPUTATION behavior | services/ReputationService.ts; MempoolService/reputation.ts; modules/explorer.ts converts internal OK to wire `ok` |
| Callback wiring | packages/executor/src/executor.ts passes publicClient.getBalance to MempoolService |
| EIP-8250 identity | MempoolService/utils.ts frameTxSlotKey; service.ts keyed conflict handling; entities/FrameTxMempoolEntry.ts sameNonceKeys |
| EIP-8272 admission | UserOpValidation/validators/frameTx.ts records recent-root simulation failures; packages/types/src/explorer/index.ts defines recent-root rule |
| Prefix gas | UserOpValidation/validators/frameTx.ts validate() unconditionally calls validateStructuralRules(); utils/validationPrefix.ts enforces 100,000 execution including signature cost and 500,000 state prefix bounds, without stake override |
| Explorer evidence | docs/sidecar_explorer.md and packages/types/src/explorer/index.ts |

The SOLVENCY/LIFECYCLE/LOCAL/REPUTATION names are documentation families, not literal sidecar verdict IDs. Do not invent a one-to-one rule-ID mapping. The older `docs/plans/2026-09-02-erc7562-native-aa-mempool-spec.md` is a plan, not executable enforcement. No standalone erc-7562.md exists at repository root in this snapshot.

Ethrex `crates/common/types/transaction.rs` defines keyed fields, strictly increasing keys, serialization and key-set hashing. `crates/vm/levm/src/vm.rs` checks declared recent-root references against committed storage. These were inspected, not executed. Optional recent-root lifecycle scenarios remain deferred.

## Workshop baseline and locked versions

Read [AGENTS.md](https://github.com/forshtat/mempool-workshop/blob/bcfe02a196ca97b6fb0d1044db9d0b4c673831fc/AGENTS.md), README, package.json, workshop.config.json5 and yarn.lock. The checkout has steps 1 through 13. Use the package scripts directly, keep config in workshop.config.json5 and generated private state in .workshop-state.json. Funding uses the faucet. Do not run the reputation mutation steps on shared endpoints under Aftershock's stricter boundary.

Resolved in this snapshot's yarn.lock: hegota-support 0.0.1, viem 2.57.11, tsx 4.23.15, TypeScript 7.0.2, Vitest 5.0.5, Vite 7.3.7 and @types/node 26.6.5. These are inspected lockfile entries, not locally installed or validated dependency versions. Check registry availability, engine compatibility and install results before adopting them. Official JSON wire encoding comes from @forshtat/hegota-support/rpc.

Source confirmation: src/lib/frameTx/codec.ts imports @forshtat/hegota-support/tx; build.ts binds toWire from /rpc; send.ts sends [toWire(tx)] to the configured gateway. src/lib/frameTx is a directory, not a single frameTx.ts file. Aftershock's local adapter now calls the same official library/profile directly; it does not import upstream built lib artifacts or implement another codec. The pinned workshop was installed with yarn install --frozen-lockfile under Linux Node 24.22.2; typecheck and all 57 tests passed, then steps 1 and 2 genuinely funded and mined a transaction. No upstream source or lock changes were needed.

The private execution image is ghcr.io/forshtat/eip8141-devnet@sha256:c9a7770f892e02255999e1c0ffd596ecee704d9175c2480811ccdcfa1c2224c6. Its OCI revision and --version identify ethrex 9aa3645d795945c64400f41a70aace0edfa7f383. Its genesis template matches the pinned source after LF normalization (SHA-256 5fe93acb7674db5d809aae4d66bff742121ed718bcddd327efcb8c1a9e631fb4). Only that genesis file is read from the image; bundled upstream key files are never used.

The sidecar is built from its exact pinned Git archive with scripts/build-local-sidecar.sh and labeled with the source revision; no untracked private config enters the build context. The upstream Dockerfile uses Bun 1.2.23. Build inputs include distribution package repositories, so image bytes may differ across builds; actual process image IDs are recorded. Source IDs/image metadata are trusted local-build provenance, not cryptographic source attestation.

## Web references and limitations

- [Documentation home](https://docs.altmempool.wtf/) warns that content is AI-generated; [differences](https://docs.altmempool.wtf/project/differences/) marks unresolved source discrepancies. Treat these as unverified descriptions until checked against implementation.
- Read [RPC reference](https://docs.altmempool.wtf/reference/rpc-methods/), [explorer API](https://docs.altmempool.wtf/reference/explorer-api/) and [quickstart](https://docs.altmempool.wtf/guides/quickstart/). The quickstart's npm/shared-key setup conflicts with the pinned workshop. Follow its current AGENTS.md, lockfile and faucet path instead.
- [Public devnet guide](https://docs.altmempool.wtf/guides/devnet/) failed retrieval through the web tool. Inspected the pinned sidecar deploy/devnet/devnet-readme.md as fallback; its older direct endpoint differs from workshop gateway configuration. That document contains public operator credentials; none are retained here or used.
- [EIP-8141](https://eips.ethereum.org/EIPS/eip-8141) is a draft. Its live text is not a pin for the running fork.
- [ETHGlobal Mumbai prizes](https://ethglobal.com/events/mumbai/prizes) accepts a real admitted transaction link or submitting code for the Frame Transaction Alternative Mempool category. A real baseline transaction link and filtered admission/receipt evidence now exist; this alone does not establish original lifecycle testing or overall sponsor readiness.

## Recreate source snapshots

Run in a separate research directory, not inside the application workspace:

```sh
git clone https://github.com/forshtat/mempool-workshop.git workshop
git -C workshop checkout --detach bcfe02a196ca97b6fb0d1044db9d0b4c673831fc
git clone https://github.com/forshtat/mempool-workshop-sidecar.git sidecar
git -C sidecar checkout --detach 2e22ff0a2898e69ea4bf5275bce1be8581a8582a
git clone --branch eip8141-tracer https://github.com/forshtat/ethrex.git ethrex
git -C ethrex checkout --detach 9aa3645d795945c64400f41a70aace0edfa7f383
```
