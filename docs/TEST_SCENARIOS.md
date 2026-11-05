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
