# Ethereum Foundation sponsor alignment

Target: **Best Use of the Frame Transaction Alternative Mempool**, ETHGlobal Mumbai 2026. Official criteria were read on 2026-11-06 at https://ethglobal.com/events/mumbai/prizes (Ethereum Foundation section).

The published qualification asks for real alternative-mempool usage demonstrated by an admitted-transaction explorer link **or working submission code**, and an explanation of design, code and trade-offs. It lists developer tooling and rule-testing tools as relevant areas. This document maps technical evidence; it is not an eligibility approval or judging outcome.

| Criterion | Aftershock evidence / limit |
| --- | --- |
| Genuine submission | Official `@forshtat/hegota-support` signing and RPC encoding, real `eth_sendFrameTransaction` in the private runner; genuine public workshop baseline in README |
| Original contribution | Shared-payer obligation/eviction sequence, keyed replacement/inclusion sequence, immutable evidence/reporting, selected offline checks and checkpoint-backed reruns |
| Alternative-mempool relevance | New staked-storage demo tests canonical/unstaked rejection, real staking and post-stake sidecar admission/inclusion; final native result is recorded in TESTING_REPORT |
| Reused functionality | Wallet, Foreign, registry, codec, execution client, sidecar and consensus images are attributed upstream; the storage/staking demonstration is adapted from workshop steps 6–8 |
| Explainability | Source pins, rule qualifiers, real transactions, receipts, state observations and exclusions appear in reports and DEMO_GUIDE |
| Safety | Internal disposable networks, fresh keys, no published ports, fixed CLI methods, read-only viewer, redacted evidence |
| Honest findings | The existing Cancelled explorer inconsistency remains FAIL; passing a reproducer does not turn the invariant green |

No new Solidity is necessary for this demonstration. It reuses precompiled creation bytes from the pinned Git sources. Local compilation is not claimed. The registry source comment's compiler version and bytecode metadata differ; provenance is the exact committed artifact, not a verified compiler reconstruction.

## User confirmations still required

- Registered event track: intended Classic, **NOT VERIFIED** in the private Hacker Dashboard.
- Exact submission cutoff: **NOT VERIFIED**. The discussed November 7, 2026 09:00 IST time must be checked there; public sources conflict.
- Team/member eligibility, any Classic build-window rules and all required dashboard fields: **NOT VERIFIED**.
- Public repository includes the final reviewed commits, correct visibility and license: user must verify after manual push.
- Demo recording/upload, human explanation and AI-disclosure fields: not submitted by Codex.

Do not claim higher-than-100k validation-prefix coverage: the inspected pinned sidecar's structural prefix bound remains 100k execution. The sponsor demo uses stake-gated foreign storage instead. Do not describe the pinned ERC-8421-style implementation as identical to every current draft.
