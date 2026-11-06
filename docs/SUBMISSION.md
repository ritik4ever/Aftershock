# Aftershock submission draft

**Name:** Aftershock  
**Tagline:** Find the failures before they reach Ethereum.  
**Repository:** https://github.com/ritik4ever/Aftershock  
**Target:** Ethereum Foundation — Best Use of the Frame Transaction Alternative Mempool.

Aftershock is a developer testing tool for Ethereum Frame Transaction lifecycle rules. It executes controlled multi-step scenarios against an isolated EIP-8141-aware ethrex and sidecar, checks actual admission/state/receipt observations, and exports immutable JSON/Markdown reports through a CLI and local read-only viewer.

## Problem and contribution

One successful transaction says little about a wallet/paymaster's behavior after competing admissions, replacements, balance changes or nonce progression. Aftershock automates those sequences and records expected-versus-observed outcomes with explicit evidence limits.

Original work is the shared-payer obligation/eviction and keyed replacement/inclusion orchestration, scoped invariant assertions, projected RPC journals, report integrity, selected offline consistency checks and reset/rerun comparisons. The official codec and underlying protocol implementations are reused. The sponsor's storage/staking example is adapted from upstream workshop contracts/steps, not claimed as a new wallet or staking protocol.

## Architecture and stack

TypeScript/npm workspaces; Node 24.22.2; Zod; viem; official hegota-support codec; pinned ethrex/sidecar/Lighthouse Docker fixtures; static HTML/CSS/JavaScript report viewer. Core owns validated fixed scenario actions; CLI owns orchestration; viewer exposes read-only local report APIs. See ARCHITECTURE, THREAT_MODEL and UPSTREAM for boundaries and provenance.

## Evidence and demonstration

Use DEMO_GUIDE for actual commands and recording instructions, SPONSOR_COMPLIANCE for qualification mapping, and TESTING_REPORT for the latest executed checks. Genuine public baseline evidence and its explorer URL are in README. Private run hashes are evidence of local integration and must not be given invented public explorer links.

## AI assistance

Codex authored and revised application code, tests and documentation, researched pinned source, ran integration tests and reviewed its own changes. It is now the sole implementation/review agent. No independent external audit is claimed. OpenCode was previously supplied only as review context and is no longer in the workflow. The user made scope, safety, repository and Git decisions; see AI_USAGE. Prompt publication remains deferred by the user's explicit instruction and must be resolved before any disclosure requiring the actual prompts.

## Public repository and submission checklist

- Review all diffs, source attribution, license and genuine evidence. Keep reported limitations visible.
- Manually commit/push the reviewed milestones; inspect the public repository afterwards. Codex does not do this.
- Exclude `.local/`, `.env`, private keys, wallet/generator state, raw logs, dependencies and unredacted reports. The report directory is not safe to publish wholesale.
- A clean application dependency installation was verified offline in a separate Linux checkout after user approval; the final suite also passes there. Provisioning an empty OS/WSL/Docker host remains unverified.
- Confirm registered track, private-dashboard deadline, team eligibility and required submission fields.
- Record/upload the human-narrated demo; confirm its actual duration and access permissions.
- Complete dashboard AI disclosure and decide how to publish the deferred prompts.
- Submit manually and verify dashboard acceptance. No acceptance, prize eligibility approval or submission is claimed here.

## Limitations

Pinned research rule variants; local-build metadata is trusted rather than cryptographically attested; public node commit is unknown. Current payer suites use EOAs and do not establish contract-paymaster policy coverage. Mined reset supports checkpoint-enabled keyed-nonce baselines; exact wall-clock replay and wider protocol edges remain out of scope. The upstream Cancelled explorer FAIL and separate sidecar dependency advisories remain disclosed. The implemented MVP passed the Codex self-review/quality checks recorded in TESTING_REPORT, and the user confirmed desktop/mobile flows. These are self-review and manual QA, not an independent security audit or automated visual test.
