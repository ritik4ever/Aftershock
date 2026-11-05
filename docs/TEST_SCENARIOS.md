# Actual scenario coverage

Both suites use real pinned private ethrex and sidecar processes, the official codec, a fresh genesis and fresh private accounts. Their results are not generated from a local mempool model. Current fixture chain is 9. Public chain 1337 remains a separate baseline observation.

| Suite | Implemented and observed | Outside current coverage |
| --- | --- | --- |
| paymaster-solvency | Sponsored EOA admission, aggregate rejection, replacement accounting, mined top-up/control/drain, distinct New-entry order, newest cancellation by balance enforcement and covered survivor | Submitted/Pending eviction exceptions, exact replay |
| keyed-nonce-lifecycle | Disjoint keys, overlapping/duplicate rejection, independent fee components, replacement, successful canonical inclusion, stale-sequence rejection, next-sequence inclusion and disjoint survivor | Terminal/TTL exceptions, exact replay |

The actual tested shared-payer maximum cost was 662874000000000 wei and its balance 1000000000000000 wei: one fits and two do not. Replacement is admitted only while the new single obligation fits. These are observed fixture values, not general network constants.

Checks compare the node response and expected rejection family; an unrelated RPC failure never counts as a successful negative test. Failed setup, invalid response shape or unavailable prerequisites remain blocked/inconclusive. Failed checks dominate blocked branches. Case timestamps, source rule/commit, image IDs, genesis fingerprint, errors, hashes, bootId and reproducer are retained in filtered reports.

Without --mine the suites remain BLOCKED for omitted mining actions; test:integration verifies that subset and explicit block. With --local --mine, both currently declared action sequences have genuine passing runs. test:lifecycle checks all declared actions and owned-resource cleanup through the native CLI. Unit-format reports are labeled MOCK_UNIT_TEST and are never committed as live evidence. PASS applies to the declared scope, not all protocol edge cases.

Reviewed captures: [shared payer](evidence/isolated-paymaster-solvency.json) and [keyed nonces](evidence/isolated-keyed-nonce-lifecycle.json). These were emitted by real integration runs, then copied separately from ignored private outputs.

Solvency source: MempoolService/obligations.ts and service.ts checkBalanceObligations. Key/replacement source: checkNonceKeyConflict, frameTxSlotKey and FrameTxMempoolEntry.canReplaceWithTTL at sidecar 2e22ff0a2898e69ea4bf5275bce1be8581a8582a. Prefix/role validity and execution simulation remain the actual upstream node's responsibility; Aftershock does not emulate them.

The keyed suite also rejects the identical live transaction as DUPLICATE. Its base maximum/priority fees are 2000000000/1000000000 wei. The 2100000000/1100000000 candidate meets only the priority threshold; the 2200000000/1050000000 candidate meets only the maximum threshold. Both are rejected as FEE_BUMP. The 2200000000/1100000000 candidate meets both thresholds and replaces the base. Each submitted fee pair is recorded in the refreshed real captures. These independent negative cases check both fee conditions, rather than lowering both at once. TTL and terminal-status exceptions remain untested.

Separate infrastructure coverage: npm run test:mining starts a real fresh-account chain with staged consensus forks and automatic sidecar bundling. Its verified run admitted transaction 0x106a4388d914d57533fa0fd28c0e634b548aaea0635a1f42518c412c30385629 and mined it in block 69 with both frames successful. [Mining capture](evidence/isolated-mining-inclusion.json) retains filtered block observations, runtime identities and receipt. This is ordinary inclusion coverage, not a third original suite or completion of either suite above. Receipt polling retries only the exact source-backed missing-receipt error; it never treats an arbitrary RPC error as successful evidence. No explorer lifecycle timeline or exact replay is claimed for this smoke test.

Verified original mined captures: [payer lifecycle](evidence/mined-paymaster-solvency.json) and [keyed lifecycle](evidence/mined-keyed-nonce-lifecycle.json). In the payer run, the final balance was 957995172897999 wei versus older/newer maximum costs of 729187800000000/662874000000000 wei. Each entry individually fit, but their 1392061800000000 wei total did not. The one-wei control preserved both New entries; the subsequent drain cancelled the newest with the source-specific balance-enforcement reason. An earlier revalidation cancellation would be INCONCLUSIVE for this ordering assertion, not an enforcement violation.

In the keyed run, replacement 0x63872db0dcc2a3242916629d16a4cf14e737f37b7d48cc0a7cba8ec3c0cfd7fa executed in block 67. A fresh higher-fee stale sequence was rejected with -32500/NONCE_MISMATCH; sequence 1 was then admitted and executed in block 68. Both inclusions had two successful frames, and the disjoint key remained New. History continuity and report action completeness were checked. These are private local transaction hashes, not public-explorer links.

Mempool entry timestamps are hex on the actual RPC wire. Ordering uses BigInt(submittedTime ?? lastUpdatedTime), matching the inspected fallback without losing precision. Reports preserve those fields as hex. State assertions remain non-atomic observations; no exact snapshot replay or complete raw RPC trace is claimed.


Fresh-state mined regression reruns now cover both suites through the native replay command, with all declared actions passing and stable environment fields matching their reviewed baselines. [Keyed comparison and fresh report](evidence/replay-keyed-nonce-lifecycle.json) and [payer comparison and fresh report](evidence/replay-paymaster-solvency.json) retain the actual new runs and checksum links. The tests also reconstruct the same comparison with the offline compare command and verify cleanup. New hashes, genesis fingerprints and some gas/cost observations differ; VERDICTS_MATCH does not mean identical execution. Exact snapshot replay and broader protocol edges remain outside this coverage.
