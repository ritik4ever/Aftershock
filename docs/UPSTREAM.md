# Upstream sources and attribution

| Source | Inspected pin |
| --- | --- |
| [Workshop](https://github.com/forshtat/mempool-workshop) | `bcfe02a196ca97b6fb0d1044db9d0b4c673831fc` |
| [Sidecar](https://github.com/forshtat/mempool-workshop-sidecar) | `2e22ff0a2898e69ea4bf5275bce1be8581a8582a` |
| [ethrex fork](https://github.com/forshtat/ethrex/tree/eip8141-tracer) | `9aa3645d795945c64400f41a70aace0edfa7f383` |

Aftershock reuses `@forshtat/hegota-support` 0.0.1 and `/rpc` for signing/wire encoding. No second codec or upstream generated library is vendored. Workshop contracts/artifacts are reused for the sponsor case; see [contract provenance](CONTRACT_FIXTURES.md).

Key sidecar sources: `FrameTxMempoolEntry.canReplaceWithTTL`, `frameTxSlotKey`, `checkNonceKeyConflict`, `MempoolService/obligations.ts`, `checkBalanceObligations`, `enforceBalances`, `validators/frameTx.ts` and `utils/validationPrefix.ts`. Ethrex keyed encoding is in `crates/common/types/transaction.rs`; execution/recent-root behavior is in the VM.

Mining setup adapts the pinned sidecar's `test/e2e/kurtosis/eip8141-single-node.yaml` and [ethereum-package](https://github.com/ethpandaops/ethereum-package/tree/b5b3af65248f11702216e377d0377bcd8ccf4caf) launch configuration. The [genesis generator](https://github.com/ethpandaops/ethereum-genesis-generator/tree/1e01e5d2a15704c22794f6450a7233e97399ee04) and Lighthouse are upstream infrastructure. Exact image digests are in the setup guide and source constants.

Workshop instructions/configuration take precedence over stale AI-generated website guidance: use its faucet, `workshop.config.json5` and private `.workshop-state.json`; never retrieve shared genesis keys. Keep its Yarn lock separate from Aftershock's npm lock.

Aftershock is MIT licensed. Support package, sidecar and main Solidity files have MIT licensing; the pinned workshop root has no repository-wide license declaration. Do not infer broader rights from individual SPDX headers. Source inspection, public observations and isolated execution are distinct evidence classes; image labels remain trusted local metadata.
