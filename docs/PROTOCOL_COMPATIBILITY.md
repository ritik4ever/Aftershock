# Protocol compatibility

Rules below describe the [pinned implementation](UPSTREAM.md), not every EIP/ERC draft.

| Topic | Pinned behavior / qualification |
| --- | --- |
| Validation budget | Structural prefix <=100k execution including signatures; <=500k state. No staking override for these bounds; do not claim >100k support from website values |
| Rule names | Preserve returned IDs such as `gas-limit`, `storage`, `prefix`, `OP-011`; documentation families are not literal verdict IDs |
| Pending identity | Chain, sender, ordered key set and sequence; intersecting distinct keyed slots conflict |
| Limits | Unstaked linear sender bucket 4 with exceptions; keyed sender entries bypass that count, not reputation/entity restrictions. Draft 4-per-key/64-per-sender is not equivalent |
| Replacement | Both fees meet `old * 11n / 10n` (integer truncation). Duplicate guard includes OnChain; terminal bypass is status > OnChain |
| TTL | Strict elapsed time > TTL*1000 from lastUpdatedTime; replacement refreshes the timestamp |
| Solvency | Aggregate local per-account obligations; exclude displaced entry. Balance enforcement evicts eligible New entries newest first; Pending/Submitted obligations can remain |
| Wire | Sidecar submission takes signed JSON; ethrex simulation/canonical submission takes raw type-0x06 RLP |
| Receipt | Missing receipt may return -32000. Inclusion is not execution success; inspect every frame |
| Reputation / delay | Explorer uses `ok/throttled/banned`; default unstake delay 0 differs from draft 86400 |

The Cancelled readmission case has active New state but explorer outcome `replaced`. Its genuine verdict remains FAIL, even when a regression test correctly reproduces it. See [capture](evidence/cancelled-replacement.json).

[Documentation differences](https://docs.altmempool.wtf/project/differences/) and [RPC reference](https://docs.altmempool.wtf/reference/rpc-methods/) warn of draft/stale guidance. No draft difference is automatically a vulnerability. The public gateway commit is empty, so public observations cannot prove source-specific invariants. Manual sidecar mode still reconciles blocks at the pinned source; it disables relaying, not reconciliation.
