# Submission brief

**Aftershock — Find the failures before they reach Ethereum.**

A developer testing tool for EIP-8141 Frame Transaction lifecycle rules: execute controlled sequences, compare source-backed expectations with actual node observations, and export reproducible reports through a CLI and local viewer.

Original contribution: shared-payer obligation/eviction and keyed replacement/inclusion automation, invariant assertions, evidence, selected offline checks and replay. Codec, contracts, execution client, sidecar and consensus software are attributed upstream. The storage/staking demo adapts workshop examples.

Stack: TypeScript/npm workspaces, Node, Zod, viem, official hegota-support codec, pinned Docker fixtures and static HTML/CSS/JavaScript. See [architecture](ARCHITECTURE.md), [real results](TESTING_REPORT.md) and [AI disclosure](AI_USAGE.md).

## Sponsor alignment

Target: Ethereum Foundation — **Best Use of the Frame Transaction Alternative Mempool**, ETHGlobal Mumbai 2026. The [official criteria](https://ethglobal.com/events/mumbai/prizes) welcome developer/rule-testing tooling and require an admitted transaction link or working submission code, plus explanation of design/trade-offs. README links our genuine successful public transaction. The isolated sponsor demo shows stake-gated state access and same-candidate canonical rejection/alternative inclusion. This is technical alignment, not eligibility approval.

## Remaining checklist

- Confirm registered track (intended Classic), exact private-dashboard deadline, team eligibility and required fields. No deadline is assumed.
- Review/publish the code and MIT license manually; exclude private generated state and prompts.
- Record/upload the human-narrated [demo](DEMO_GUIDE.md), verify access/duration and complete required AI disclosure honestly.
- Submit manually and confirm dashboard acceptance.

Keep known limits visible: pinned research rules, self-review only, upstream Cancelled finding/advisories, partial offline checking and limited historical replay. No production-security, independent-audit or prize-approval claim is made.
