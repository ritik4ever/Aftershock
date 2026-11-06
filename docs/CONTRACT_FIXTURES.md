# Contract fixture decision

No new Solidity is required for current coverage. Sources use the [workshop/sidecar pins](UPSTREAM.md).

| Case | Reused capability | New fixture |
| --- | --- | --- |
| Payer solvency / Cancelled | Fresh EOA payment signature; ordinary mined top-up/drain/restoration; balance and simulation maxCost reads | Not needed; not a contract sponsorship-policy test |
| Keyed lifecycle / TTL | Official keyed fields and ethrex nonce-manager predeploy; admission, canonical inclusion and nonce-slot reads | Not needed |
| Staked storage | Workshop `Foreign` and `ViolatingWallet`; sidecar registry creation bytes and `addStake(uint32)` | Not needed |

Workshop `contracts/src/` also contains `ExampleWallet` and `SponsorPaymaster`. The sponsor approves broadly and has no withdrawal/quota mutation suitable for the EOA solvency sequence. Optional `contracts/fork/` compiler experiments are not adopted.

The sponsor runner reads pinned `contracts/artifacts/Foreign.json`, `ViolatingWallet.json` and sidecar `deploy/predeploy/src/protocols/staking-registry-deployment.ts`. It verifies creation receipts, addresses, nonempty runtime, actual nonce/balance and mined staking state. Tested runtime sizes were registry 1259, Foreign 76 and wallet 2027 bytes. Addresses are per-run, not constants.

`ViolatingWallet(address owner,address foreign)` is creation-funded. HegotaSupport creates seven helpers, so its observed initial nonce was 8; always read actual nonce. Ordinary transfers to validation wallets may fail; creation value is the supported funding path. The EIP-8141 sentinel is not an ERC-4337 EntryPoint contract.

Workshop artifact file SHA-256:

| File | SHA-256 |
| --- | --- |
| Foreign.json | `59330a8c0e039bb14e7c635bd436bd57898275ea2ba8d1d629ca05603af37e7c` |
| ViolatingWallet.json | `9b64a7dac94427cc0319243e76c88f230dfd4cd6882e95ad68e712ee5614deab` |

Main workshop build uses Foundry with vanilla solc 0.8.28, via-IR/Cancun and artifact export. Aftershock reuses committed creation artifacts; no local compilation or source-to-bytecode equivalence is claimed. The registry comment and bytecode compiler metadata differ. No Foundry installation was needed.

[Real sponsor capture](evidence/staked-storage-boundary.json). Solidity SPDX headers/support package/sidecar are MIT; workshop root licensing is unspecified. No contract source or artifact is vendored.
