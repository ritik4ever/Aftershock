# Three-minute demo

Prepare installed dependencies, pinned upstream sources and cached images using [setup](REPRODUCIBILITY.md). Mining takes several minutes; capture a genuine run before recording.

```sh
npm run --silent aftershock -- run staked-storage-boundary --local --mine
npm run --silent aftershock -- report <actual-run-id> --format md
npm run --silent aftershock -- evidence <actual-run-id>
npm run --silent aftershock -- serve --port 4323
```

1. Explain the problem: a single successful submission does not test behavior after replacements or state changes. Name the original payer/keyed suites.
2. Show the real isolated environment, zero stake and canonical/unstaked foreign-storage rejection.
3. Show the mined staking transaction and actual registry/nonce/balance changes.
4. Show the **same post-stake signed candidate** rejected canonically and admitted/included through the alternative mempool. Require unwaived storage checks and successful frame receipts.
5. Show the one-wei recipient increase, report export and original scenario evidence. Briefly show the separate public transaction linked in README.

Before/after-staking candidates have different nonces/hashes; only the post-stake canonical-versus-sidecar comparison uses the same hash. Private hashes have no public explorer links.

Record your own explanation of design and trade-offs. Keep keys, `.local/`, raw logs and personal tabs off-screen. Check audio, legibility, upload access and the dashboard's video requirements. Recording/upload are not yet verified.
