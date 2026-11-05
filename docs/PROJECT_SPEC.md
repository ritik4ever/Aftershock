# Aftershock project spec

Status: core CLI, both declared private mined suites, fresh-state reruns, projected RPC evidence and selected offline consistency checks are implemented. UI and exact snapshot replay remain planned. PASS covers the declared live checks, not every protocol edge case. Non-mining runs remain BLOCKED for omitted mined actions.

Requirements now follow the user-approved Version 2 master specification. The source-based [contract audit](CONTRACT_FIXTURES.md) maps every declared action and records why no new Solidity is required for current coverage. A future contract-based sponsorship predicate needs its own justified scenario and integration evidence; contract count is not a milestone.

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

Current layout: packages/core, packages/cli, tests, scripts and docs. Strict TypeScript, Zod schemas, the official-codec signing adapter, private Docker orchestration and one npm lockfile are implemented. No alternate codec or web UI exists.

Run reports record unique ID, seed, pinned source versions, observed environment/image identity, chain, ordered actions, assertions, verdicts and a reproducer. New reports also retain bounded allowlisted RPC projections with actual receipts, lifecycle fields, normalized failures and per-step completion-order cursors. Node observations remain separate from derived summaries. Payloads, signatures, logs and arbitrary server text are omitted; full raw transcripts and private-state snapshot restoration are unfinished. Historical reports are not retroactively populated.

Verdicts are PASS, FAIL, INCONCLUSIVE, BLOCKED and SPEC_DIFFERENCE. FAIL means a defined check failed in that environment, not an automatic exploit finding. Missing required evidence, history gaps or incompatible versions prevent conclusive source-specific PASS. Private image/source provenance is trusted local-build metadata, not cryptographic attestation. Public node source commit remains unknown.

Offline check-evidence rechecks selected saved outputs and explicitly lists unsupported steps. CONSISTENT is scoped file consistency, never a new live PASS or full scenario revalidation. Redacted signatures, transfer values, account-query targets, fee/nonce semantics and simulation-to-transaction associations cannot be reconstructed. Fresh-state replay uses new keys/genesis; it is not exact historical replay.

## Current scope

- Implemented: doctor, inspect, versions, scenarios, run --local [--mine], report JSON/Markdown, replay planning/reruns, offline compare, evidence export and selected evidence consistency checks.
- Verified: both original mined suites and fresh-state reruns have genuine scoped passing captures. Current commands/results and historical live executions are recorded in ENVIRONMENT.md and TEST_SCENARIOS.md.
- Baseline: the real upstream workshop transaction on chain 1337 executed in block 404438 with two successful frames. This is upstream functionality, not Aftershock originality.
- Contract scope: no custom Solidity contracts or deployed contract-based paymaster fixture. Current scenarios use fresh EOAs and attributed upstream protocol predeploys; the shared payer has a separate payment signature. The declared suites work without custom contract deployment, and do not establish contract-based paymaster coverage.
- Remaining: terminal/TTL/submitted-entry edges, exact snapshot/reset replay, fuller raw evidence where safely exportable, local read-only UI, independent review and judge demo/submission documents. Existing sidecar dependency advisories remain unresolved.
- License: MIT, selected after the user delegated the choice.
