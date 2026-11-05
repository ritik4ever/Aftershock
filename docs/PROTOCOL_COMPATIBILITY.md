# Protocol compatibility

Source inspection and public observation are separate evidence classes. Pins and implementation paths: [UPSTREAM](UPSTREAM.md). No local node behavior has been verified.

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
- Sidecar eth_sendFrameTransaction takes signed JSON via the official encoder. Ethrex simulation takes raw type-0x06 RLP. They are different interfaces. Neither submission nor simulation was exercised in this checkpoint.
- Do not implement ERC-4337 methods or privileged relay calls. Only eth_chainId, skandha_explorer_info and skandha_config were probed live.
- Explorer requires enablement; history is bounded and volatile. Track bootId and sequence bounds, preserve cursors, limit pages to 200. Included is not execution success; skipped/waived reports do not independently prove enforcement.
- Use bigint or hex for amounts, fees, sequences and nonce keys. Validate numeric metadata separately.
- Live explorer returned version v4.1.1 and an empty commit. Source-dependent lifecycle claims remain unverified against that node. Manual bundling can delay mining; never invoke shared bundling controls to force progress.

Source references for the confirmed structural gate: [validate()](https://github.com/forshtat/mempool-workshop-sidecar/blob/2e22ff0a2898e69ea4bf5275bce1be8581a8582a/packages/executor/src/services/UserOpValidation/validators/frameTx.ts#L310) and [validateStructuralRules()](https://github.com/forshtat/mempool-workshop-sidecar/blob/2e22ff0a2898e69ea4bf5275bce1be8581a8582a/packages/executor/src/services/UserOpValidation/utils/validationPrefix.ts#L282). This contradicts descriptions suggesting larger staked prefix budgets for this exact implementation; it is not a tested runtime exploit.

Open: full mapping of documented families to returned checks, execution-client operator overrides, private stack readiness and deterministic fixture design. All method shapes beyond the three diagnostics still need execution against the target version.
