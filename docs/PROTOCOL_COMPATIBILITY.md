# Protocol compatibility

Source inspection, public observation and private integration are separate evidence classes. Pins and implementation paths: [UPSTREAM](UPSTREAM.md). Private admission/replacement behavior is verified; public source identity remains unknown.

| Topic | Draft / website description | Pinned implementation / observation |
| --- | --- | --- |
| Entity execution budgets | Draft 100k unstaked / 1M staked; landing-page description 250k / 2.5M | Neither pair is the sidecar's structural rule: validate() calls validateStructuralRules() unconditionally, with no stake override for the prefix bounds below |
| Prefix bounds | Rule sets differ | Total prefix execution plus signature cost <=100k; prefix state <=500k, enforced before signature and entity-compliance checks |
| IDs | BUDGET-010, STORAGE-021, REPUTATION-220 | Source uses gas-limit, storage, prefix, OP-011 and other IDs; preserve actual returned IDs |
| Pending cap | Draft describes 4 per key and 64 per unstaked sender | Dedicated unstaked linear sender bucket: 4, with stake/whitelist exceptions. Self-relay is gated through payer reputation, not that flat bucket. Keyed own-sender entries bypass the count cap but not ban/throttle restrictions; third-party entity limits remain |
| Identity | Sender, key set and sequence | Also chain-scoped; exact ordered key-set slot; overlapping other slots conflict |
| Reputation labels | ACTIVE / THROTTLED / BANNED | Explorer wire: ok / throttled / banned |
| Unstake delay | Draft 86,400 seconds | Source default and public skandha_config: 0; workshop requests 86,400 |
| Replacement | Version-specific lifecycle rules | Both fee thresholds use integer 11/10; TTL and terminal-state exceptions apply |
| Solvency | Do not assume accounting model | Aggregate per-account local obligations with callback; replacement excludes old entry; Submitted cannot be evicted by balance enforcement |
| State limits | Draft differences page describes removal of state cap | Pinned prefix validator retains state cap; distinguish execution/state gas |

The draft/landing comparisons above are summaries of the [documentation differences table](https://docs.altmempool.wtf/project/differences/), not separately pinned ERC draft research. They are SPEC_DIFFERENCE candidates, never automatic vulnerabilities.

## Wire and evidence boundaries

- Configured gateway is https://altmempoolgateway.forshtat.com/rpc. The documented path is /rpc/; the configured /rpc responded successfully. No direct miner connectivity is assumed.
- Sidecar eth_sendFrameTransaction takes signed JSON via the official encoder. Ethrex simulation takes raw type-0x06 RLP. They are different interfaces. The pinned workshop and Aftershock's private scenarios exercise normal sidecar submission. Public CLI doctor/inspect commands remain read-only.
- Do not implement ERC-4337 methods or privileged relay calls. Live read verification also covers skandha_explorer_getTransaction, skandha_frameTransactionStatus and eth_getFrameTransactionReceipt. Only the separate official workshop invoked the public faucet and public transaction submission. Aftershock submits scenario transactions only to owned private fixtures.
- Sidecar receipt status is success/reverted; per-frame statuses also include skipped. Raw execution receipts use 0x1/0x0 instead. Confirmed in packages/types/src/executor/validation/frameTxReceipt.ts and ReceiptService/index.ts, and in the real successful response. The adapter must not compare sidecar status to 0x1.
- Explorer requires enablement; history is bounded and volatile. Track bootId and sequence bounds, preserve cursors, limit pages to 200. Included is not execution success; skipped/waived reports do not independently prove enforcement.
- Use bigint or hex for amounts, fees, sequences and nonce keys. Validate numeric metadata separately.
- Live explorer returned version v4.1.1 and an empty commit. Source-dependent lifecycle claims remain unverified against that node. Manual bundling can delay mining; never invoke shared bundling controls to force progress.

Source references for the confirmed structural gate: [validate()](https://github.com/forshtat/mempool-workshop-sidecar/blob/2e22ff0a2898e69ea4bf5275bce1be8581a8582a/packages/executor/src/services/UserOpValidation/validators/frameTx.ts#L310) and [validateStructuralRules()](https://github.com/forshtat/mempool-workshop-sidecar/blob/2e22ff0a2898e69ea4bf5275bce1be8581a8582a/packages/executor/src/services/UserOpValidation/utils/validationPrefix.ts#L282). This contradicts descriptions suggesting larger staked prefix budgets for this exact implementation; it is not a tested runtime exploit.

Private integration verifies signed JSON admission, raw-RLP simulation, replacement, keyed conflicts, canonical frame inclusion and mined balance transitions against pinned processes. Negative admission cases require the inspected code/channel/message family: -32602 for balance obligations, keyed conflict, duplicate and fee bump; -32500 for the native Nonce mismatch rejection after inclusion. An unrelated error never counts as a successful rejection. Non-mining runs still block their omitted mined actions.

Separate private mining verification now covers a successful ordinary Frame Transaction after staged Fulu/Gloas/Heze activation. The pinned ReceiptService throws -32000 with transaction receipt not found for the requested hash while no receipt exists, rather than returning null; the mining poll recognizes only that exact response as unavailable and retries within its bound. This behavior does not establish that an unknown hash is pending.

The RPC wire for eth_getFrameTransactionByHash represents submittedTime/lastUpdatedTime as hex despite numeric internal TypeScript fields. A genuine response probe established this and the mined payer report preserves the observed hex values. Ordering uses BigInt(submittedTime ?? lastUpdatedTime). Manual sidecar mode still reconciles blocks in the inspected service implementation; it only disables relaying. Both original mined suites rely on that executable behavior, not the stale contrary comment in an upstream test header.

Both suites have passing --local --mine runs for their declared scope. Open: full documentation-family mapping, operator overrides, submitted-entry and terminal-status exceptions, exact TTL-boundary coverage, fuller evidence and exact snapshot replay. No draft/implementation discrepancy is labeled an exploit.
