# Scope and scenarios

Aftershock is a fixed-scenario runner, invariant checker and evidence viewer for pinned EIP-8141 infrastructure. It does not implement a new wallet protocol or transaction codec.

| Scenario | Real actions and assertions | Coverage limit |
| --- | --- | --- |
| `paymaster-solvency` | Shared EOA payer; aggregate rejection; replacement accounting; mined top-up/control/drain; newest eligible New-entry cancellation and surviving obligation | Not contract paymaster-policy coverage; Pending/Submitted obligations may not be evictable |
| `keyed-nonce-lifecycle` | Disjoint keys, overlap/duplicate rejection, independent fee thresholds, replacement, mined predecessor/next sequence and stale rejection | Broader terminal/status edges excluded |
| `keyed-replacement-ttl` | Below-bump rejection before expiry, acceptance after actual expiry, duplicate handling and TTL refresh | Admission-only; not exact live boundary testing |
| `cancelled-replacement` | Mined payer drains/restorations; Cancelled replacement and identical resubmission within TTL; renewed live guards | Known explorer mismatch remains FAIL |
| `staked-storage-boundary` | Existing artifacts; unstaked rejection; real stake; same post-stake candidate rejected canonically and included through sidecar | Adapted workshop demo, not a third original suite |

The first two are the original stateful suites. Their non-mining mode remains BLOCKED for omitted mined actions. The CLI runs actual node transactions; mocks are confined to unit tests.

Reports identify source pins, environment, ordered actions, observations and verdicts. PASS requires sufficient evidence for declared checks; FAIL is not automatically an exploit. Missing/ambiguous evidence is BLOCKED or INCONCLUSIVE. SPEC_DIFFERENCE distinguishes rule variants.

Implemented: CLI, scoped real integration, JSON/Markdown export, bounded RPC journals, selected offline checks, fresh-state reruns, TTL genesis reset, keyed mined checkpoint reset, local browser execution and public read-only live inspection. Hosted records remain genuine historical captures. New stateful runs require the owned local companion; a public remote Docker runner is not provisioned. Outside coverage: recent-root lifecycle suite, every terminal/Pending/Submitted edge, full raw request reconstruction and exact historical timing.

[Results](TESTING_REPORT.md) · [Protocol rules](PROTOCOL_COMPATIBILITY.md) · [Contract decision](CONTRACT_FIXTURES.md)
