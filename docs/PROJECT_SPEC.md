# Aftershock project spec

Status: private mining fixture checkpoint, 2026-11-05. Both original suites exercise real private nodes using the official signing/wire codec, and a separate mining smoke test verifies ordinary inclusion. Original mined-state branches remain blocked; neither full suite is claimed complete.

Aftershock will run reproducible multi-step Frame Transaction scenarios, check version-specific invariants and export evidence through a CLI. A local read-only report UI comes last. The contribution is lifecycle automation, explicit assertions and reproducible reports; transaction sending, admission debugging, keyed nonces and recent roots already exist upstream.

## Proposed source-backed invariants

Both suites target sidecar commit `2e22ff0a2898e69ea4bf5275bce1be8581a8582a`; links and qualifiers are in [UPSTREAM](UPSTREAM.md).

### Paymaster obligations

With the balance callback enabled, admission must reject a candidate whose per-account pending obligations exceed the current account balance, excluding the entry it replaces. Payer obligations use simulation maxCost when available, otherwise the lower frame-limit estimate; sender obligations add top-level frame values. Self-pay combines both. This is local bookkeeping, not a chain escrow or a guarantee across other nodes.

After a controlled balance decrease, the enforceBalances stage cancels eligible New entries newest first until its obligation total fits or no eligible entries remain. Earlier reconciliation stages can already cancel or include entries; assert ordering only among entries still present when enforceBalances starts, not across the entire block pass. Pending and Submitted obligations count but are not evictable by this stage; do not assert universal post-block solvency when non-evictable entries alone exceed the balance. Equal timestamps require additional investigation before asserting an exact eviction order.

Test sequence: create independently valid funded payer transactions; admit a fitting set; reject an over-budget candidate; replace one entry and verify the old obligation is excluded; perform a normal fixture-authorized balance change locally; observe block reconciliation, cancellations and the surviving set. Include a balance-preserving control. A separate fresh-account mining smoke fixture is implemented; the balance-change fixture and exact reset/replay strategy remain unfinished.

### Keyed nonce identity and replacement

For the same chain and sender, a pending keyed transaction sharing any key with another slot must be rejected. An identical ordered key set and sequence is the same slot and follows replacement rules. Disjoint keys may coexist subject to all remaining admission rules.

Before TTL expiry, with a live predecessor, replacements must meet both integer thresholds `oldFee * 11n / 10n` for priority and maximum fees. This truncates; do not substitute floating-point percentages or ceiling arithmetic. Identical transaction hashes are duplicates while live. TTL and terminal-status exceptions must be separate cases.

Precisely, pending means status < OnChain. Duplicate rejection still includes OnChain; the fee bypass is status > OnChain, not >= OnChain. TTL bypass requires a strict elapsed-time comparison `> ttl * 1000`, measured from lastUpdatedTime rather than initial admission. Passing this replacement check does not bypass simulation, nonce or balance checks.

Test sequence: admit disjoint keys; attempt an overlapping different slot; attempt an insufficient bump; accept a sufficient bump; observe predecessor replacement; include or cancel a predecessor and retest the slot under the actual onchain nonce state. Never infer acceptance solely from different keys or higher fees.

## Delivery and evidence

Current layout: packages/core, packages/cli, tests, scripts and docs. Strict TypeScript, Zod scenario/RPC/report schemas, an official-codec signing adapter, private Docker fixture orchestration and one npm lockfile are implemented. The application has no alternate codec. A separate mining smoke fixture is available through test:mining; integration of mined lifecycle assertions and apps/web remain planned.

Every run needs unique ID, seed, pinned source versions, actual node identity, chain ID, endpoint class, ordered actions, raw redacted responses, history continuity, receipts, expected/observed assertions and a reproducer. Verdicts: PASS, FAIL, INCONCLUSIVE, BLOCKED, SPEC_DIFFERENCE. FAIL means the defined invariant failed in that environment; it is not an automatic exploit claim. A version mismatch or missing history prevents a conclusive source-specific PASS.

Completed: compatible tooling, genuine workshop baseline, read-only inspector, real isolated admission/replacement subsets for both original suites and a separately verified private mining/inclusion smoke fixture. Next: connect mined balance transitions/evictions and included/dropped predecessor assertions to that fixture, then exact replay and remaining evidence features. UI remains last.

## Current scope state

- Implemented: CLI doctor/inspect/versions/help/scenarios/run --local/report; original admission/replacement sequences, source-backed definitions, private fixtures, official-codec signing, filtered case evidence and JSON/Markdown scenario reports with integrity checks.
- Tested: 34 unit/bootstrap tests, two real private admission/replacement integration tests and one real private mining/inclusion test; typecheck, lint and formatting passed. Application npm audit is clean; the separately pinned sidecar has upstream advisories. See ENVIRONMENT.md.
- Blocked: mining-dependent branches keep each full suite BLOCKED. Public node commit is unknown. Exact replay is not implemented.
- Verified baseline: real workshop transaction on chain 1337, block 404438, two successful frames. This is upstream functionality, not Aftershock originality.
- Planned: mining/state-transition coverage, terminal/TTL exception integration, complete raw redacted evidence/replay, UI, independent audit and judge demo. Current reports are filtered projections, not complete raw execution traces.
- License: MIT, selected after the user delegated the choice to Codex.
