# Aftershock judge demonstration

Target: Ethereum Foundation, Best Use of the Frame Transaction Alternative Mempool. Intended event track: ETHGlobal Mumbai 2026 Classic; registered track and dashboard deadline are **NOT VERIFIED**. November 7, 2026 at 09:00 IST is tentative information from the user, not a verified cutoff.

## Prepare before recording

Use the Linux checkout, installed locked dependencies and cached pinned images documented in README/REPRODUCIBILITY. Obtain the separate workshop and sidecar Git sources at the pins in UPSTREAM. The sponsor demo reads only the pinned Git objects for `ViolatingWallet`, `Foreign` and the registry creation bytecode; it does not compile or modify those repositories.

Default source root is `../aftershock-upstream` relative to Aftershock. If yours differs, export `AFTERSHOCK_UPSTREAM_ROOT=/your/source/root` containing `workshop/` and `sidecar/`. Missing pinned objects produce BLOCKED before container creation. No wallet key or public RPC is required.

```sh
npm run --silent aftershock -- run staked-storage-boundary --local --mine
npm run test:sponsor
npm run --silent aftershock -- report <actual-run-id> --format json
npm run --silent aftershock -- report <actual-run-id> --format md
npm run --silent aftershock -- evidence <actual-run-id>
npm run --silent aftershock -- serve
```

Use the actual UUID printed by your successful run. Cold staged mining takes several minutes; prepare the report before the video and explain that delay. Restart an older viewer process after updating code. Open http://127.0.0.1:4318, refresh Runs and select that report. A local report's transaction hashes have no public explorer URL; do not fabricate one. The separate public workshop baseline and genuine explorer link are in README.

## Show the evidence

1. Show the isolated environment, pins and deployed runtime-code sizes. The wallet starts with zero stake; record its actual account nonce and balance.
2. Show foreign validation storage rejected by canonical `eth_sendRawTransaction` and the unstaked sidecar. A correct policy rejection is a passing assertion, not an exploit finding.
3. Show a clean wallet frame transaction calling the real registry's `addStake`. Verify the successful frame receipts, stake/delay/withdrawal fields, registry balance increase and wallet nonce/balance change.
4. Show the newly signed, current-nonce foreign-read candidate rejected canonically, then **the same signed candidate** admitted through `eth_sendFrameTransaction` and included by the sidecar's automatic private relay. Require successful frame receipts and unwaived storage checks.
5. Show the recipient's actual one-wei increase and wallet nonce increment, then export the immutable report and projected RPC journal.

The before-staking candidate and staking transaction share the original wallet nonce; after staking, the candidate uses the next observed nonce. Do not claim those before/after candidates have the same hash. The canonical-versus-sidecar comparison *after* staking does use the same candidate/hash.

## Three-minute human narration outline

- 0:00–0:25: “Aftershock tests what happens after a transaction is constructed: admission, changing state and lifecycle rules.” Name the original shared-payer and keyed-nonce scenario automation.
- 0:25–1:00: Show the real run and pinned versions. Explain foreign storage and why the canonical policy rejects it.
- 1:00–1:45: Show zero stake, the mined staking transaction and actual state changes.
- 1:45–2:20: Show the identical post-stake candidate rejected canonically and admitted/included by the alternative mempool; inspect receipts and storage checks.
- 2:20–2:50: Export the report. Show keyed checkpoint replay separately if time permits; explain that it restores initial disk state, not historical clocks or later block hashes.
- 2:50–3:00: State limits: research tool, pinned rule variant, private keys/validators only, self-review by the implementing agent.

Record your own voice and explain the code/trade-offs in your own words. Hide `.local/`, terminals containing wallet/generator logs, personal tabs and credentials. Check text legibility, audio, video duration and upload permissions. Recording, upload and dashboard submission remain user actions; no video is claimed to exist.
