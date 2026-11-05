# Aftershock project spec

Status: scoped mined lifecycle checkpoint, 2026-11-06. Both original suites have passing real private --local --mine runs using the official codec. This completes their currently declared actions, not every protocol edge case or exact replay. Non-mining runs remain BLOCKED for their omitted mined branches.

Aftershock will run reproducible multi-step Frame Transaction scenarios, check version-specific invariants and export evidence through a CLI. A local read-only report UI comes last. The contribution is lifecycle automation, explicit assertions and reproducible reports; transaction sending, admission debugging, keyed nonces and recent roots already exist upstream.

## Proposed source-backed invariants

Both suites target sidecar commit `2e22ff0a2898e69ea4bf5275bce1be8581a8582a`; links and qualifiers are in [UPSTREAM](UPSTREAM.md).

### Paymaster obligations

With the balance callback enabled, admission must reject a candidate whose per-account pending obligations exceed the current account balance, excluding the entry it replaces. Payer obligations use simulation maxCost when available, otherwise the lower frame-limit estimate; sender obligations add top-level frame values. Self-pay combines both. This is local bookkeeping, not a chain escrow or a guarantee across other nodes.

After a controlled balance decrease, the enforceBalances stage cancels eligible New entries newest first until its obligation total fits or no eligible entries remain. Earlier reconciliation stages can already cancel or include entries; assert ordering only among entries still present when enforceBalances starts, not across the entire block pass. Pending and Submitted obligations count but are not evictable by this stage; do not assert universal post-block solvency when non-evictable entries alone exceed the balance. Equal timestamps require additional investigation before asserting an exact eviction order.

Verified sequence: fit one obligation, reject aggregate overspend, replace it without double-counting, top up the payer and admit a second obligation, confirm distinct entry ordering, mine a small balance-change control, then mine a larger drain leaving each entry individually affordable but their sum unaffordable. The newest New entry is cancelled by balance enforcement while the older one survives and fits. Ordinary EIP-1559 transfers use fresh fixture keys; no contract deployment or privileged/admin RPC is needed. Submitted-entry cases and exact reset/replay remain unfinished.

### Keyed nonce identity and replacement

For the same chain and sender, a pending keyed transaction sharing any key with another slot must be rejected. An identical ordered key set and sequence is the same slot and follows replacement rules. Disjoint keys may coexist subject to all remaining admission rules.

Before TTL expiry, with a live predecessor, replacements must meet both integer thresholds `oldFee * 11n / 10n` for priority and maximum fees. This truncates; do not substitute floating-point percentages or ceiling arithmetic. Identical transaction hashes are duplicates while live. TTL and terminal-status exceptions must be separate cases.

Precisely, pending means status < OnChain. Duplicate rejection still includes OnChain; the fee bypass is status > OnChain, not >= OnChain. TTL bypass requires a strict elapsed-time comparison `> ttl * 1000`, measured from lastUpdatedTime rather than initial admission. Passing this replacement check does not bypass simulation, nonce or balance checks.

Verified sequence: admit disjoint keys, reject overlaps/duplicates and independently insufficient fee components, replace the base, submit it through ordinary canonical eth_sendRawTransaction, observe successful inclusion, reject a stale sequence, then admit and mine the next sequence. The disjoint key remains New. Actual sidecar/execution responses and explorer continuity are checked; acceptance is never inferred solely from keys or fees.

## Delivery and evidence

Current layout: packages/core, packages/cli, tests, scripts and docs. Strict TypeScript, Zod scenario/RPC/report schemas, an official-codec signing adapter, private Docker fixture orchestration and one npm lockfile are implemented. The application has no alternate codec. CLI --mine runs the mined branches; test:mining separately checks automatic relaying. apps/web remains planned.

Every run needs unique ID, seed, pinned source versions, actual node identity, chain ID, endpoint class, ordered actions, raw redacted responses, history continuity, receipts, expected/observed assertions and a reproducer. Verdicts: PASS, FAIL, INCONCLUSIVE, BLOCKED, SPEC_DIFFERENCE. FAIL means the defined invariant failed in that environment; it is not an automatic exploit claim. A version mismatch or missing history prevents a conclusive source-specific PASS.

Completed: compatible tooling, genuine workshop baseline, read-only inspector, both declared private mined lifecycle suites and the automatic-relaying smoke test. Next: fuller evidence and snapshot replay features, then UI. Fresh-state rerun/comparison is now implemented separately from exact historical replay. Current reports are filtered projections, not complete raw execution traces.

## Current scope state

- Implemented: CLI doctor/inspect/versions/help/scenarios/run --local [--mine]/report/replay --plan or --local [--mine]/offline compare; original admission/replacement/mined sequences, private fixtures, official signing, filtered evidence and JSON/Markdown reports with checksum and cross-field consistency checks.
- Tested at the prior mined checkpoint: 40 unit/bootstrap tests, two private admission/replacement tests, both mined lifecycle tests and the automatic-relaying smoke test. Application audit is clean; pinned sidecar advisories remain unresolved. See ENVIRONMENT.md.
- Blocked: a run without --mine omits mined checks and remains BLOCKED. Public node commit is unknown. Exact replay is not implemented.
- Verified baseline: real workshop transaction on chain 1337, block 404438, two successful frames. This is upstream functionality, not Aftershock originality.
- Planned: terminal/TTL/submitted-entry exceptions, fuller redacted evidence/replay, UI, independent audit and judge demo.
- License: MIT, selected after the user delegated the choice to Codex.

Fresh-state rerun checkpoint: replay validates a saved private report and current scenario definition before running a new fixture. It compares action verdicts and stable environment fields, preserves BLOCKED and saves the new run separately. It does not restore snapshots, execute saved scripts, compare raw observations or authenticate evidence authorship. See REPRODUCIBILITY.md for commands and scope.

Offline comparisons reconstruct verdict/environment differences from two immutable saved reports without contacting Docker or RPC. Export success is separate from the runs' invariant verdicts. Report reads reject non-regular files, bound actual reads, avoid following replaced leaf symlinks on Linux, and do not create a missing report directory. Actual mined replay validation is recorded in ENVIRONMENT.md and TEST_SCENARIOS.md.

At the preceding rerun checkpoint: 43 unit/bootstrap tests, one real non-mining replay integration case and both genuine mined replay cases passed. Both new mined runs matched baseline action verdicts and stable environment fields while using fresh genesis/accounts. This verifies fresh-state reruns only; snapshot restoration and fuller raw evidence remain planned.


The projected RPC evidence milestone adds bounded per-run journals and offline evidence export. New reports retain actual receipt gas/statuses, lifecycle projections and normalized RPC errors separately from derived assertions, with per-step completion-order cursors. Missing journals in historical reports stay absent. Captures still omit payloads/logs/arbitrary text and are not full raw transcripts; snapshot replay remains unfinished. Current validation outcomes are recorded in ENVIRONMENT.md.

Current verified checkpoint: 51 unit/bootstrap tests, both private admission/replacement cases, one non-mining replay/export case and both full mined CLI suites passed. New mined journals contain actual projected receipts and lifecycle evidence with zero omissions. Recorded startup failures are retained and explicitly recovered; no required scenario evidence is waived. See TEST_SCENARIOS.md for the genuine captures.
