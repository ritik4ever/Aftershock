# Environment, 2026-11-05

The research/pre-commit sections below are historical snapshots. The latest implemented state and checks are recorded in the CLI/core integration checkpoint at the end.

## Observed tooling

| Check | Result |
| --- | --- |
| Windows checkout | C:\Users\ritik\Desktop\Aftershock, cloned from ritik4ever/aftershock |
| Branch | feat/research-foundation; no staging/commits/pushes performed |
| Windows Node / npm / Yarn | v23.6.1 / 10.9.2 / 1.22.22 |
| Windows Git | 2.42.0.windows.2 |
| Windows Bun / Forge | Commands unavailable |
| Windows Docker CLI | 29.7.2; daemon connection failed (Linux engine pipe missing) |
| WSL | Ubuntu running on WSL2, Linux home /home/ritik |
| Ubuntu Node / npm / Yarn / Git | v18.19.1 / 10.9.2 / 1.22.22 / 2.43.0 |
| Ubuntu Bun / Forge / Docker | Bun and Forge absent; Docker WSL integration unavailable |

The WSL Node version is below the workshop's >=20.12 floor. npm/Yarn versions alone do not establish that they use a compatible Linux runtime. Windows Node 23 satisfies that numeric floor but is not the chosen long-term build environment. No tools or packages were installed.

## Live read-only diagnostics

Run `node scripts/probe-devnet.mjs` from this checkout. To preserve a fresh capture, use `node scripts/probe-devnet.mjs --save docs/evidence/<new-name>.json`; existing files are never overwritten. The script contacts one fixed public gateway, performs three reads, rejects redirects and bounds each response to 1 MiB and each request to 15 seconds. It validates and exports allowlisted explorer/config fields. Unknown protocol versions, malformed results and cross-response chain disagreement cannot produce a successful exit. No signer or private state is involved.

Initial manual calls returned HTTP 200 and JSON-RPC results for all three methods: chain 0x539 (1337), explorer protocol 1/version v4.1.1, empty source commit, manual bundling and faucet enabled. minUnstakeDelay was 0. The script capture in docs/evidence records its own observation time and responses; history sequence values may differ from earlier reads.

This proves connectivity and advertised explorer capability only. No transaction was constructed, funded or sent. No lifecycle assertion passed.

## Provisioning before integration

Keep actual builds in a Linux-home checkout after this research checkpoint has been manually committed. Do not move or overwrite this Windows checkout. With nvm already available in Ubuntu, the intended runtime commands are:

```sh
nvm install 24
nvm use 24
node --version
npm --version
npm install --global yarn@1.22.22
```

nvm presence and the Node download have not been verified; these are proposed commands, not completed installation. If nvm is absent, establish its official installation path before running anything. Re-check the pinned dependencies' engine requirements and record the exact installed Node patch.

For the independent pinned workshop checkout: `yarn install --frozen-lockfile`, then `yarn typecheck` and `yarn test` before `yarn step_1_check --json` and `yarn step_2_tx_first --json`. The last two create private state and send ordinary permitted devnet transactions; use fresh keys and faucet funding. These commands have not been run.

For isolated tests, start Docker Desktop's Linux engine and enable Ubuntu WSL integration; verify `docker info` in Ubuntu. Install Bun only when the pinned sidecar build is needed, after selecting and verifying an exact compatible version. No Bun version is established yet, so no install command is prescribed. Follow the pinned sidecar/ethrex build instructions and isolate all networking before tests. Foundry stays optional until fixture contracts need compilation.

## Validation scope

Research commands: clone, source/lockfile reads and three RPC calls succeeded. Some exploratory rg commands used missing candidate paths and one regex failed; corrected searches located the actual source files. Missing-tool probes failed as listed above; shell aggregate exit status is not evidence that every tool exists.

Application typecheck, lint, formatting tools, engine unit/integration suites, CLI scenario smoke tests, web build and UI navigation are not applicable yet: there is no application scaffold. The dependency-free probe has its own Node unit tests. No independent audit, dependency security check or full MVP completion is claimed.

Completed checkpoint checks:

| Command / check | Actual result |
| --- | --- |
| node --check scripts/probe-devnet.mjs | exit 0 |
| node scripts/probe-devnet.mjs --save docs/evidence/devnet-probe-2026-11-05.json | exit 0; three HTTP 200 results saved |
| node scripts/probe-devnet.mjs --invalid | exit 2 as expected, before network requests |
| Node assert script: capture fields, config allowlist, exact prompt-copy SHA-256, secret-shaped values and whitespace | exit 0 |
| git check-ignore on seven representative private/generated paths | exit 0; all seven ignored |
| git diff --check | exit 0; Windows CRLF conversion warning only |
| git diff --cached --stat | empty; no staged files |

The secret-pattern check is narrow and does not replace reviewing the exact files before staging. The untouched user prompt retains its original Markdown formatting.

## Pre-commit review

The original capture was compared with the actual successful tool output from its creation; its recorded values match. A fresh native-HTTPS capture is retained separately as devnet-probe-2026-11-05-review.json. It again returned chain 1337, version v4.1.1, the same bootId, empty commit and minUnstakeDelay 0; latestSeq advanced from 300 to 307. These are genuine gateway responses, not generated fixture data. Neither file is cryptographically attested or transaction-admission proof. The config result is intentionally a selected projection, not a complete raw config response.

Review fixes: validate and allowlist results; reject chain disagreement; redact arbitrary error text; test response limits/timeouts, malformed responses and missing methods; expand private/generated-file ignores; correct stake-dependent sender limits, strict TTL/OnChain boundaries and reconciliation-stage ordering; confirm the unconditional structural prefix gas gate. The sample-report negation originally overrode some earlier secret ignores; moved it before those exclusions and verified nested sample secrets remain ignored. Removed the non-executable Bun placeholder recipe. No dead code, commented-out implementation or unnecessary dependencies were found. The original requirements prompt is intentionally retained for AI disclosure; overlapping docs serve separate spec, safety, compatibility, provenance and setup roles.

Run `node --test tests/probe-devnet.test.mjs`: 10 tests passed, 0 failed. These use unit-test transports and never write public evidence. Both JavaScript files passed `node --check`.

Final review validation exited 0: all 14 repository files scanned for private-key blocks, 32-byte hex values, common provider tokens, JWTs, credentials in URLs and literal credential assignments; no matches found. Confirmed 33 private/generated paths ignored and five intended public/example paths allowed, including nested sample-report cases. Nine local Markdown links resolve; both captures parse and match the recorded successful observations; the prompt is byte-identical to the user's original. The index is empty and upstream source checkouts have no changes. These checks reduce accidental disclosure risk but cannot prove arbitrary text contains no secret.

This is a complete research/diagnostic checkpoint, not a complete integration setup: compatible Linux tooling, an isolated node deployment, real transaction admission and the testing engine remain next-milestone work. No UI work has started.

## CLI/core integration checkpoint

Both research commits were manually made by the user (433d541 and a3d76a5). The prompt folder remains deliberately untracked. No agent staging, commits or pushes occurred.

Found an existing /home/ritik/.nvm installation and provisioned Node 24.22.2/npm 11.19.1 using nvm install 24, with matching download checksum. Installed Yarn 1.22.22 in that Node installation. nvm's initial iojs release-list request stalled; terminated only that request, after which the Node download completed. Linux npm/yarn now resolve inside nvm rather than to Windows executables. These supersede the earlier unsourced-shell version observations.

Created a local Linux build clone at /home/ritik/aftershock-build and a separate pinned workshop clone at /home/ritik/aftershock-upstream/workshop. Implementation files were synchronized back to the original Windows IDE checkout for manual review/commit. No node_modules or wallet state was copied back.

The workspace installs Zod 4.6.7, TypeScript 5.9.3, tsx 4.23.15, @types/node 24.10.0, Prettier 3.9.10 and Oxlint 1.91.0, pinned in one npm lockfile. Initial older choices exposed a Zod advisory and a vulnerable minimatch dependency through ESLint/typescript-eslint. Updated Zod and selected the smaller Oxlint toolchain; removed the unused ESLint setup. This avoids a forced incompatible minimatch major override. Final npm audit and pinned-workshop yarn audit both report zero vulnerabilities. The [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) was inspected during the dependency decision.

| Actual command / check | Outcome |
| --- | --- |
| Workshop yarn install --frozen-lockfile | exit 0; no source/lock changes |
| Workshop yarn typecheck | exit 0 |
| Workshop yarn test | exit 0; 57 tests passed |
| Workshop yarn audit --json | exit 0; zero vulnerabilities |
| Workshop yarn step_1_check --json | exit 0; fresh account funded by faucet |
| Workshop yarn step_2_tx_first --json | exit 0; block 404438, two successful frames |
| App npm ci --ignore-scripts | exit 0; clean locked installation |
| App npm run typecheck | exit 0 |
| App npm run lint | exit 0; zero warnings/errors |
| App npm run format:check | exit 0 |
| App npm test | exit 0; 13 core/RPC/CLI tests plus 10 bootstrap tests |
| App npm audit | exit 0; zero vulnerabilities |
| CLI doctor | exit 0; chain agreement, source commit unknown |
| CLI inspect real hash --save | exit 0; consistent successful receipt/admission observation, ignored report created |
| Explorer transaction route | HTTP 200; interactive browser view not tested |

The first typecheck of artifact tests caught a too-narrow inferred UUID argument type. Broadened that input boundary to string and kept runtime UUID validation; the final clean-install typecheck passed. Test transports never submit transactions or write live evidence. Unit artifact tests leave only isolated /tmp/aftershock-* outputs; CLI --save writes under ignored reports/.

Evidence: docs/evidence/workshop-admission-2026-11-05.json. It records the CLI's real gateway reads and derived consistency results. The later smoke observation is separately retained only in the Linux checkout's ignored reports directory. The sidecar still advertises an empty source commit, so no source-specific invariant PASS is claimed.

Remaining blockers: Docker daemon is unavailable and Ubuntu Docker integration/Bun are absent. No isolated ethrex/sidecar stack exists yet, so original paymaster balance transitions and keyed-nonce replacement integration have not run. The scenario runner, complete report/replay features and UI remain planned. No web build or UI navigation applies to this checkpoint.

Final source review covered all 35 repository files, found no credential-pattern matches or unexpected key/hash-shaped literals, resolved all 13 local Markdown links and confirmed normalized source parity with the tested Linux mirror. Public transaction hashes are expected evidence, not private keys. Evidence exports contain no signing fields. Rechecked private/generated-file ignores and the empty staging index. JavaScript syntax validation and git diff --check passed. MIT licensing was selected after the user delegated that decision; license metadata is included in the lockfile.

## Isolated scenario-engine checkpoint

The user explicitly requested continued implementation, using the OpenCode document only as a review checklist. Prior CLI work was still uncommitted; preserved it and continued on the same branch. No Git staging/commits/pushes were performed.

Started the installed Docker Desktop hidden, then verified daemon/Ubuntu connectivity (29.7.2). Built the exact sidecar source through its Bun 1.2.23 Dockerfile and tested the tracked-source archive build helper. Pulled ethrex by immutable digest; OCI revision and --version match the source pin. A host Bun/Rust installation was unnecessary for this container path.

First setup attempts correctly stopped at prerequisites: a Windows-CRLF genesis hash mismatch, then ethrex automatic P2P address discovery on an internal network. Verified LF-normalized source identity and disabled execution P2P explicitly. Docker's internal network did not publish host ports, so the final implementation uses no published ports at all and executes a fixed fetch program inside the owned sidecar container. Failed setup reports remain ignored; no failed prerequisite was counted as a passing node test.

Final real runs verify shared-payer aggregate obligations/replacement and keyed-nonce conflicts/fee-bumped replacement. Both full suites return BLOCKED because a non-mining fixture cannot exercise mined balance changes, per-block eviction or included/dropped predecessors. Case timestamps, exact source rules, image/process IDs, genesis fingerprints, observed errors/hashes and remaining limitations are captured. No mock node was substituted.

| Check | Actual outcome |
| --- | --- |
| npm install --ignore-scripts with official codec/viem | exit 0 |
| npm run typecheck | exit 0 |
| npm run lint | exit 0; no warnings/errors |
| npm run format:check | exit 0 |
| npm test | exit 0; 30 unit/bootstrap tests |
| npm run test:integration | exit 0; two real isolated admission/replacement subsets passed, each full suite explicitly BLOCKED |
| bash -n scripts/build-local-sidecar.sh | exit 0 |
| build-local-sidecar.sh against pinned checkout | exit 0 |
| npm audit | exit 0; zero application vulnerabilities |
| Pinned upstream sidecar bun audit --json | exit nonzero; 49 package groups / 234 advisory records, including 11 critical and 115 high records |

The upstream audit includes the pinned lockfile and does not establish which findings are reachable in production runtime. Its scope differs from the clean application npm audit. Do not deploy this experimental sidecar publicly or claim dependency security is resolved; preserve the pinned source for reproducible testing and track upstream remediation separately.

The integration harness verifies complete run-owned container/network teardown. Ignored .local/ retains private mode-restricted keys/config/logs for diagnosis; no private state is copied to the reviewed evidence directory. Exact replay and mining infrastructure remain unfinished, and UI work has not started.

Final review scanned 47 source/artifact files, resolved 17 local Markdown links, verified private-output ignore rules and confirmed parity with the tested Linux mirror. The credential-pattern check's only candidate was the explicit unit-test-placeholder used by the redaction test; no credentials were found. Both reviewed integration captures contain only public hashes/observations and show all implemented cases passing with the mined branch BLOCKED. Native report JSON/Markdown exports and scenarios CLI smoke checks passed. No run-owned containers/networks remain, and the staging index is empty. Shell/JavaScript syntax and git diff --check passed.
