# Aftershock project spec

Status: research checkpoint, 2026-11-05. No scenario engine or transaction submission exists yet.

Aftershock will run reproducible multi-step Frame Transaction scenarios, check version-specific invariants and export evidence through a CLI. A local read-only report UI comes last. The contribution is lifecycle automation, explicit assertions and reproducible reports; transaction sending, admission debugging, keyed nonces and recent roots already exist upstream.

## Proposed source-backed invariants

Both suites target sidecar commit `2e22ff0a2898e69ea4bf5275bce1be8581a8582a`; links and qualifiers are in [UPSTREAM](UPSTREAM.md).

### Paymaster obligations

With the balance callback enabled, admission must reject a candidate whose per-account pending obligations exceed the current account balance, excluding the entry it replaces. Payer obligations use simulation maxCost when available, otherwise the lower frame-limit estimate; sender obligations add top-level frame values. Self-pay combines both. This is local bookkeeping, not a chain escrow or a guarantee across other nodes.

After a controlled balance decrease, the enforceBalances stage cancels eligible New entries newest first until its obligation total fits or no eligible entries remain. Earlier reconciliation stages can already cancel or include entries; assert ordering only among entries still present when enforceBalances starts, not across the entire block pass. Pending and Submitted obligations count but are not evictable by this stage; do not assert universal post-block solvency when non-evictable entries alone exceed the balance. Equal timestamps require additional investigation before asserting an exact eviction order.

Test sequence: create independently valid funded payer transactions; admit a fitting set; reject an over-budget candidate; replace one entry and verify the old obligation is excluded; perform a normal fixture-authorized balance change locally; observe block reconciliation, cancellations and the surviving set. Include a balance-preserving control. Fixture contract and deterministic mining setup are not implemented.

### Keyed nonce identity and replacement

For the same chain and sender, a pending keyed transaction sharing any key with another slot must be rejected. An identical ordered key set and sequence is the same slot and follows replacement rules. Disjoint keys may coexist subject to all remaining admission rules.

Before TTL expiry, with a live predecessor, replacements must meet both integer thresholds `oldFee * 11n / 10n` for priority and maximum fees. This truncates; do not substitute floating-point percentages or ceiling arithmetic. Identical transaction hashes are duplicates while live. TTL and terminal-status exceptions must be separate cases.

Precisely, pending means status < OnChain. Duplicate rejection still includes OnChain; the fee bypass is status > OnChain, not >= OnChain. TTL bypass requires a strict elapsed-time comparison `> ttl * 1000`, measured from lastUpdatedTime rather than initial admission. Passing this replacement check does not bypass simulation, nonce or balance checks.

Test sequence: admit disjoint keys; attempt an overlapping different slot; attempt an insufficient bump; accept a sufficient bump; observe predecessor replacement; include or cancel a predecessor and retest the slot under the actual onchain nonce state. Never infer acceptance solely from different keys or higher fees.

## Delivery and evidence

Planned layout: packages/core, packages/cli, tests, fixtures, docs and finally apps/web. Use strict TypeScript, a validated scenario schema, official codec and one npm workspace lockfile. Select and test package versions at the implementation checkpoint; no application dependencies are installed now.

Every run needs unique ID, seed, pinned source versions, actual node identity, chain ID, endpoint class, ordered actions, raw redacted responses, history continuity, receipts, expected/observed assertions and a reproducer. Verdicts: PASS, FAIL, INCONCLUSIVE, BLOCKED, SPEC_DIFFERENCE. FAIL means the defined invariant failed in that environment; it is not an automatic exploit claim. A version mismatch or missing history prevents a conclusive source-specific PASS.

Next checkpoint: establish compatible Linux tooling, install the pinned workshop with its lockfile and prove one ordinary admitted transaction. Then implement the two original isolated lifecycle suites, evidence/replay, CLI and UI in separate manual commit milestones.

## Current scope state

- Implemented: fixed-endpoint read-only diagnostic probe and research docs.
- Tested: see ENVIRONMENT.md and the captured probe evidence.
- Blocked: isolated node tests; no running local stack. Public node commit is unknown.
- Planned: genuine submitted transaction, scenario engine, report/replay, UI, audit and judge demo.
- Human decision outstanding: permissive license selection; no license is asserted yet.
