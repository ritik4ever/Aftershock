# Actual scenario coverage

Both suites use real pinned private ethrex and sidecar processes, the official codec, a fresh genesis and fresh private accounts. Their results are not generated from a local mempool model. Current fixture chain is 9. Public chain 1337 remains a separate baseline observation.

| Suite | Implemented and observed | Still BLOCKED |
| --- | --- | --- |
| paymaster-solvency | Shared EOA payer with two valid authorization signatures; one fitting admission; execution-client maxCost/balance boundary; aggregate overspend rejection; sufficient replacement; old entry removed and explorer outcome replaced | Mined balance decrease, per-block eviction ordering and submitted-entry behavior |
| keyed-nonce-lifecycle | Same sender on disjoint keys; overlapping multi-key rejection; below-minimum bump rejection; sufficient bump admission; predecessor replaced/removed | Included/dropped predecessor after an actual block transition, terminal/TTL exception integration |

The actual tested shared-payer maximum cost was 662874000000000 wei and its balance 1000000000000000 wei: one fits and two do not. Replacement is admitted only while the new single obligation fits. These are observed fixture values, not general network constants.

Checks compare the node response and expected rejection family; an unrelated RPC failure never counts as a successful negative test. Failed setup, invalid response shape or unavailable prerequisites remain blocked/inconclusive. Failed checks dominate blocked branches. Case timestamps, source rule/commit, image IDs, genesis fingerprint, errors, hashes, bootId and reproducer are retained in filtered reports.

The named full suites return BLOCKED, not PASS, while mining branches remain absent. `npm run test:integration` checks only the implemented private admission/replacement subsets and explicitly asserts the blocked branch. Unit tests remain separate from those real integration tests; format-only test reports are labeled MOCK_UNIT_TEST and never committed as live evidence.

Reviewed captures: [shared payer](evidence/isolated-paymaster-solvency.json) and [keyed nonces](evidence/isolated-keyed-nonce-lifecycle.json). These were emitted by real integration runs, then copied separately from ignored private outputs.

Solvency source: MempoolService/obligations.ts and service.ts checkBalanceObligations. Key/replacement source: checkNonceKeyConflict, frameTxSlotKey and FrameTxMempoolEntry.canReplaceWithTTL at sidecar 2e22ff0a2898e69ea4bf5275bce1be8581a8582a. Prefix/role validity and execution simulation remain the actual upstream node's responsibility; Aftershock does not emulate them.

The keyed suite also rejects the identical live transaction as DUPLICATE. Its base maximum/priority fees are 2000000000/1000000000 wei. The 2100000000/1100000000 candidate meets only the priority threshold; the 2200000000/1050000000 candidate meets only the maximum threshold. Both are rejected as FEE_BUMP. The 2200000000/1100000000 candidate meets both thresholds and replaces the base. Each submitted fee pair is recorded in the refreshed real captures. These independent negative cases check both fee conditions, rather than lowering both at once. TTL and terminal-status exceptions remain untested.

Separate infrastructure coverage: npm run test:mining starts a real fresh-account chain with staged consensus forks and automatic sidecar bundling. Its verified run admitted transaction 0x106a4388d914d57533fa0fd28c0e634b548aaea0635a1f42518c412c30385629 and mined it in block 69 with both frames successful. [Mining capture](evidence/isolated-mining-inclusion.json) retains filtered block observations, runtime identities and receipt. This is ordinary inclusion coverage, not a third original suite or completion of either suite above. Receipt polling retries only the exact source-backed missing-receipt error; it never treats an arbitrary RPC error as successful evidence. No explorer lifecycle timeline or exact replay is claimed for this smoke test.
