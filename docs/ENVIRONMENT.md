# Environment, 2026-11-05

The research/pre-commit sections below are historical snapshots. The latest implemented state and checks are recorded in the latest checkpoint at the end. Current repository name: ritik4ever/Aftershock (uppercase A); older entries retain their historical spelling.

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

## Independent replacement threshold follow-up

The two engine/evidence commits are present in the user checkout. Added live duplicate rejection plus separate cases where only one of the two fee thresholds is met. The official codec accepts independently specified maximum and priority fees; reports retain those input quantities as decimal strings. Both isolated integration tests passed after the changes, including native BLOCKED exit codes and owned-resource cleanup. Captures were refreshed from those real runs. No dependencies were added. Typecheck, lint, formatting, 30 unit/bootstrap tests and the application dependency audit were rerun successfully.

Docker remains available, but Kurtosis is not installed. The pinned upstream mining example uses staged consensus forks, a shared prefunded account and published ports; it was only inspected, never executed. A fresh-account, privately networked mining fixture remains necessary before mined-state assertions can run.

## Private mining fixture checkpoint

Implemented direct Docker orchestration for the unchanged pinned execution/sidecar images plus immutable genesis-generator and Lighthouse images documented in UPSTREAM.md. The generator runs offline with a fresh validator mnemonic, 32 validator keys and five fresh funded EOAs; no shared credentials are used. The runtime consists of ethrex, Lighthouse beacon/validator and sidecar on one owned internal network with no published ports. Full sync and automatic sidecar bundling are explicit. Private state remains under ignored .local/.

Installed Kurtosis CLI 1.22.2 under ~/.local/bin during research; its official release asset SHA-256 matched checksums.txt: 789be2d263e3ba731b8bc99e7bf2162f58efa8d085e481f2aecfcccbe1b46734. No Kurtosis engine/enclave was started; the implemented fixture does not require Kurtosis. Pulled genesis-generator 6.1.6 and Lighthouse focil, then pinned their resolved immutable digests. No application dependencies were added. Additional research checkouts remain outside the repository.

Prototype failures were real and corrected: an address-prefix mismatch in the predeploy patch, root-owned generated files unreadable by the WSL user, reserved one-wei precompile allocations being mistaken for unexpected EOAs, default snap sync remaining SYNCING, and the sidecar returning a receipt-unavailable error instead of null. The corrected poll retries only the exact inspected -32000 receipt-not-found response for the requested hash. Other RPC failures remain fatal. An initial prototype used the shell's Node 20 default; final checks explicitly selected nvm use 24.22.2.

Final fresh mining test: exit 0, one real integration test passed in 448980 ms. It observed blocks beyond Hegota, admitted transaction 0x106a4388d914d57533fa0fd28c0e634b548aaea0635a1f42518c412c30385629 and received a successful receipt in block 69 with two successful frames. The reviewed filtered capture is evidence/isolated-mining-inclusion.json. Runtime identities, actual generated funding/predeploy state and private file modes were separately checked against this same run. No run-owned Docker containers/networks remained afterwards.

On Linux Node 24.22.2: npm ci --ignore-scripts, typecheck, lint, formatting, 34 unit/bootstrap tests, the two ordinary private integration tests, test:mining, npm audit, CLI versions, JavaScript syntax and shell syntax checks passed. Application audit remains zero vulnerabilities; the previously disclosed pinned sidecar advisories are unresolved. Both original CLI suites still return BLOCKED because their mined balance/predecessor assertions are not yet connected to the separate mining fixture. No UI or exact replay is implemented.

The final review covered 50 source/evidence files, confirmed normalized parity with the Linux build mirror, resolved all local Markdown file links and compared reviewed files with actual generated keys/mnemonics without printing them. No generated secret appeared in the reviewed files. Refreshed evidence also passed credential-field pattern checks; ignored private paths and the empty staging index were verified. No Git staging, commit or push was performed.

## Scoped mined lifecycle and full recheck, 2026-11-06

The user approved existing disposable local tests by delegation and requested approval before package/dependency installation or deployment. No installation/reinstall or external deployment occurred. Existing dependencies passed npm ls --all (optional platform/peer packages are not required by this implementation). All four cached image references resolved before testing; fixture create/run calls now use --pull never. Node 24.22.2/npm 11.19.1 were explicitly selected. npm ci was not rerun under the new approval requirement.

Source reinspection confirmed manual bundling still performs reconciliation; only relaying is disabled. Added --local --mine to run the original scopes with manual sidecar mode. Ordinary eth_sendRawTransaction submits native frame transactions and EIP-1559 control transfers. No privileged relay or debug/bundling-control method was called by Aftershock.

The first mined payer run stopped honestly as BLOCKED after a successful top-up and second admission: entry timestamps were hex strings on the actual wire, not internal JS numbers. A fresh non-mining response probe confirmed both timestamp fields are hex. The checker now uses exact hex/BigInt ordering with the source fallback and has regression coverage. A fresh payer rerun passed all declared actions in 454781 ms; final balance 957995172897999 wei covered the older 729187800000000 wei obligation but not the combined 1392061800000000 wei. The newer entry was Cancelled with the balance-enforcement marker, the older remained New, and the one-wei control had preserved both. Reviewed capture: evidence/mined-paymaster-solvency.json.

The independent mined keyed run passed in 451415 ms. Replacement 0x63872db0dcc2a3242916629d16a4cf14e737f37b7d48cc0a7cba8ec3c0cfd7fa executed in block 67; the stale sequence was rejected with -32500/NONCE_MISMATCH, then sequence 1 executed in block 68. The disjoint key remained New. Reviewed capture: evidence/mined-keyed-nonce-lifecycle.json. These hashes belong to separate private chains, not the public explorer. Both saved CLI artifacts passed checksum, action-completeness and verdict-consistency revalidation before copying.

Exact lifecycle test invocations used the already installed runner: ./node_modules/.bin/tsx --test --test-name-pattern=paymaster-solvency tests/lifecycle.integration.ts and the corresponding keyed-nonce-lifecycle selector. These are independent selections of the same test:lifecycle file; the normal npm script runs them sequentially. The automatic-relaying test:mining also passed in 442874 ms. The two non-mining integration tests passed and retained native BLOCKED exits for omitted mined actions.

The recheck fixed acceptance of result+error RPC envelopes, constrained negative cases to their inspected method/code/message family, and added report checks for aggregate verdict, definition identity, complete PASS actions, cleanup, unique/ordered steps and chronology. The checksum is checked before semantic parsing. Private diagnostic files now preserve scenario exceptions when possible without exporting arbitrary server text. Unit/bootstrap tests total 40; typecheck, lint, formatting, JavaScript/shell syntax and application npm audit passed. Previously disclosed upstream sidecar advisories remain unresolved.

Read-only public doctor returned chain 1337, v4.1.1, empty commit, bootId bce7267923761e0d and latestSeq 1088; source identity remains unknown. No public transactions were sent. The official ETHGlobal Mumbai prize page was rechecked: the target category still accepts a real admitted transaction explorer link or submitting code, plus explanation of design/code/trade-offs. The dated workshop capture remains separate from Aftershock's original private lifecycle evidence. No UI, exact replay or independent security audit is claimed.

Final review covered 55 source/evidence files and 22 local Markdown links, confirmed normalized Windows/Linux source parity, compared reviewed files against generated private keys/mnemonics without printing them, and checked credential markers. No secrets were found. Private/report/sample-secret ignore rules, the empty staging index, complete run-owned resource teardown and git diff --check passed. Native report Markdown/JSON and scenarios exports also passed. The approval policy is recorded in AGENTS.md; prompts remain excluded from the proposed commits.


## Fresh-state rerun checkpoint, 2026-11-06 local time

Using the existing Linux-home dependency tree (Node 24.22.2, npm 11.19.1), typecheck, Oxlint, formatting and all 41 unit/bootstrap tests passed. npm ls --all exited 0 and npm audit reported zero application vulnerabilities. JavaScript syntax validation for both .mjs files and bash -n for the build helper passed. No dependencies were installed, no images were pulled and no external deployment occurred.

npm run test:replay passed its one real integration test (26.1 seconds): the keyed baseline bff66099-2628-4d41-a007-24c55acb8f2c and fresh rerun 80e27c50-6021-44c1-8169-19498be33de2 both retained BLOCKED for omitted mining, with matching action verdicts and stable environment fields. Genesis fingerprints differed. Both saved envelopes were read back and compared with CLI output; --plan succeeded and an incorrect --mine mode returned native 2 before fixture creation. Per-run Docker checks and the final global aftershock.run label inventory showed no remaining owned containers/networks.

The offline plan also validated the saved mined keyed report 3b2d8dee-6870-4ce3-9e83-af75ef4e5a4f and selected --mine. The new mined replay command was not integration-tested at this checkpoint; earlier genuine mined-suite coverage remains recorded above. No new mined PASS or exact snapshot replay is claimed. Comparison stdout is not a third persisted artifact, and the existing reports remain filtered projections rather than full raw traces. Pinned upstream sidecar advisories remain unresolved.


## Mined rerun and offline comparison checkpoint, 2026-11-06 local time

No packages/dependencies were installed and no images were pulled or external services deployed. The existing Node 24.22.2/npm 11.19.1 Linux-home tree passed typecheck, Oxlint, formatting, all 43 unit/bootstrap tests, npm ls --all and npm audit (zero application vulnerabilities). Both .mjs syntax checks and bash -n passed. New report regressions confirm FIFO rejection without a writer and no directory creation during missing-report reads; Linux opens are nonblocking/no-follow and regular-file reads remain bounded even after file growth. Pinned sidecar dependency advisories remain unresolved.

The two real mined replay cases were selected independently and executed concurrently with the installed runner:

```sh
./node_modules/.bin/tsx --test --test-name-pattern=keyed-nonce-lifecycle tests/replay-mining.integration.ts
./node_modules/.bin/tsx --test --test-name-pattern=paymaster-solvency tests/replay-mining.integration.ts
```

Both exited 0. The keyed test took 453.3 seconds and payer test 463.0 seconds; these are observed test durations, not performance benchmarks. The sequential npm run test:replay:mining script contains the same cases but was not separately executed. npm run test:replay also passed its real non-mining case (25.7 seconds), retaining BLOCKED and verifying offline comparison. The compare command validates both saved envelopes and exits 0 when it successfully exports a comparison, regardless of historical invariant verdicts.

Keyed baseline 3b2d8dee-6870-4ce3-9e83-af75ef4e5a4f reran as 7c3f9985-d997-45cb-a676-2c4cd750ca70: PASS, 18 steps, matching verdicts/stable environment and a different genesis. Replacement 0x925d5dca86867d283ae81cdd5cc9510f810411f0c7677fd7450e60ce2ea072f9 executed in block 67 and next sequence 0xa8a3d3d325ea8351efd73ce27ab00c8e462fc77f9506ce90bb1501b3cc256440 in block 68, both with two successful frames. No explorer-history gaps were reported.

Payer baseline acc1216e-0374-48a8-b4f0-5e724d264979 reran as d83300ca-8089-4c41-9c5e-c047228bb268: PASS, 16 steps, matching verdicts/stable environment and a different genesis. The fresh base maximum cost was 662898000000000 wei, differing from the old 662874000000000 wei observation. The newest entry was Cancelled by balance enforcement and the older remained New. This demonstrates matching asserted behavior, not identical raw execution or exact replay.

Both tests read and validate immutable saved reports and compare the offline CLI output with the replay output. Reviewed comparison-plus-rerun captures were copied byte-for-byte from private test outputs into docs/evidence/replay-keyed-nonce-lifecycle.json and replay-paymaster-solvency.json after checksum/schema/comparison validation. Exact fresh keys, mnemonic and JWT were checked for absence. Both test-level teardown checks and the final global aftershock.run inventory showed no remaining owned containers or networks. No new public-devnet transaction was sent. Captures remain filtered private-chain projections, not raw complete traces or independent attestations.


## Projected RPC journal checkpoint, 2026-11-06 local time

The existing Linux-home Node 24.22.2/npm 11.19.1 installation was used without package installation, image pulls or external deployment. Typecheck, Oxlint, formatting and all 51 unit/bootstrap tests passed. npm ls --all, application npm audit (zero vulnerabilities), both .mjs syntax checks and bash -n passed. The pinned sidecar advisories remain unresolved. No UI or new public-devnet transaction was created.

Initial live admission runs ec4f7427-eed9-4187-8351-b61649e21996 and e8dcb9ed-7585-4d5e-99ea-d3575cfaed57 were genuinely INCONCLUSIVE because the first journal design treated recovered startup failures as missing scenario evidence. They were not edited into passing results. The collector now labels readiness separately and accepts recovery only after a later same-channel readiness chain-ID response of 0x9; all failed attempts remain visible. Projection failures, omitted entries and unrecovered required scenario failures still prevent PASS.

After that fix, npm run test:integration passed both real admission/replacement cases (9.1/9.5 seconds), retaining BLOCKED for omitted mining while recording complete filtered journals. npm run test:replay passed its real non-mining comparison/export case (24.3 seconds). It verifies offline evidence export equals the saved journal. A separate unit test imports an unchanged historical capture into a temporary report store and verifies evidence export returns null/native 3, not fabricated data.

Both actual mined CLI cases were selected independently with the installed runner and executed concurrently:

```sh
./node_modules/.bin/tsx --test --test-name-pattern=keyed-nonce-lifecycle tests/lifecycle.integration.ts
./node_modules/.bin/tsx --test --test-name-pattern=paymaster-solvency tests/lifecycle.integration.ts
```

Both exited 0. Keyed run 60751072-f5ff-4752-ae54-de7370829a2c took 455.7 seconds and recorded 127 entries / 56,380 compact entry bytes, including two actual successful Frame Transaction receipts. Payer run b407dc18-99a8-46bb-a248-89d4c47c6e00 took 465.8 seconds and recorded 136 entries / 57,870 compact entry bytes, including three successful canonical transfer receipts. Both were PASS with zero omissions and complete recording. Their unavailable counts (8/9) are retained startup failures, all recovered under the same-channel readiness rule; they are not hidden or reclassified as successful RPC calls. These are test durations, not throughput benchmarks.

The final validator read both immutable checksum envelopes, validated journal fields/counters/identities/step references, exported each journal through the native evidence command and compared it deeply to the saved data. It confirmed projected receipts and compared action verdicts/stable environments with the earlier historical mined baselines: both remained PASS with matching verdicts. The filtered reports were copied byte-for-byte into docs/evidence/rpc-keyed-nonce-lifecycle.json and rpc-paymaster-solvency.json after checking exact fresh keys, mnemonic and JWT and forbidden payload fields for absence. Runtime projection normalizations are not raw byte-for-byte node transcripts. Full raw traces, private-state snapshot restoration and independent audit remain unfinished.

Both integration-level cleanup checks and a final global aftershock.run label inventory showed no remaining owned containers or networks. Private logs and wallets remain ignored in Linux .local/. Historical committed evidence was not rewritten, and Codex did not stage, commit or push.


## Offline selected-evidence consistency checkpoint, 2026-11-06 local time

Using the existing Linux-home Node 24.22.2/npm 11.19.1 tree, typecheck, Oxlint, formatting, all 58 unit/bootstrap tests, npm ls --all, npm audit (zero application vulnerabilities), both .mjs syntax checks and bash -n passed. No dependencies/images were installed, no Docker stack was started, no external deployment occurred and no new transaction was sent. Earlier live captures were checked offline; stateful integration tests were not rerun for this read-only checker.

Native CLI checks against the immutable existing reports exited 0: keyed run 60751072-f5ff-4752-ae54-de7370829a2c had two selected checks consistent and 16 steps not reevaluated; payer run b407dc18-99a8-46bb-a248-89d4c47c6e00 had seven selected checks consistent and nine steps not reevaluated. All saved-context requirements were satisfied. These are derived consistency results over previous genuine captures, not new protocol runs, independently verified findings or full scenario revalidation.

Regression tests deliberately altered copies of those captures to check reverted receipts, incorrect block/gas summaries, payer arithmetic, absent receipts and redacted amount exclusions. CLI tests wrote only temporary /tmp report stores and verified native exit 1 for a contradictory report with a valid recomputed checksum, and 3 for a historical journal-less capture. Mock labels and unknown execution-version assertions remain insufficient. Source reports are unchanged by checking. Duplicate/reserved scenario action IDs now reject at schema validation to prevent false action-completeness claims.

Repository inspection confirmed no custom .sol sources or deployed contract-based paymaster fixture. Current native Frame Transaction scenarios use EOAs and upstream protocol predeploys via the official profile. This satisfies the implemented scoped tests but is not contract-based paymaster coverage. UI, exact snapshot replay, broader edge cases, independent review and submission/demo work remain open. Codex did not stage, commit or push, and prompts remain deferred.

## Version 2 contract audit and native fixture checkpoint, 2026-11-06 local time

CONTRACT DECISION: new Solidity is NOT REQUIRED for the declared EOA shared-payer and keyed suites. [CONTRACT_FIXTURES](CONTRACT_FIXTURES.md) records the pinned source inventory, every action mapping, constructor/funding/nonce caveats, ABI/artifact fingerprints, compiler path and licensing limits. No workshop Solidity contract was deployed or rebuilt. Foundry/solc were absent from the tested PATH; no installation was necessary. No external deployment or new public transaction occurred.

The existing Linux-home Node 24.22.2/npm 11.19.1 tree passed typecheck, Oxlint, formatting, all 59 unit/bootstrap tests (49 TypeScript plus 10 bootstrap), npm ls --all, npm audit (zero application vulnerabilities), both .mjs syntax checks and bash -n. Pinned sidecar advisories remain unresolved. Historical full scenario captures were preserved; those full suites were not rerun at this checkpoint.

An initial capability attempt a90cee15-81f1-43dd-b34e-9f69d0fe5327 was deliberately interrupted during warm-up after source inspection exposed a wrong test assumption: the nonce manager is fork-installed, not a genesis.alloc entry. Only the owned sidecar was stopped after label/isolation verification, and fixture cleanup removed the remaining owned resources. That attempt exited 1 and produced no passing evidence. The test was corrected to compare against ethrex crates/vm/system_contracts.rs runtime 0x60006000fd before the fresh run below.

`npm run test:fixtures` then exited 0, one test, 448.5 seconds (test duration, not a performance benchmark). Fresh run 6cd65e0c-f256-489f-a0c9-0b22dff75dad recorded 2026-11-05T22:19:00.920Z through 22:27:00.237Z, which is 2026-11-06 local time. It used the existing cached isolated ethrex/Lighthouse/validator/sidecar stack on chain 9, with no published ports or image pulls. The nonempty nonce-manager runtime matched pinned source; fresh sender/payer code was empty. Genuine signed keyed transaction 0x80fce83c580619d141f3eab5280b7e8b74e147193035d125114f85981d1667ad was sidecar-admitted and canonically mined in block 67 with both frames successful and included lifecycle. Storage key 1 changed 0 -> 1; key 2 remained 0 and the ordinary sender nonce remained 0. A separate one-wei EIP-1559 transfer 0x1a1b37adcac8449dd63aac3fed9469a67ac19c9c440ae4186b8614e7d762208b succeeded in block 69 with 21000 gas; payer balance decreased including gas.

[Filtered capability capture](evidence/native-fixture-capabilities.json) is a standalone infrastructure observation, not a CLI RunReport or a third original scenario. Its strict journal has 119 entries / 47801 compact entry bytes, zero omissions and six retained recovered readiness failures; complete recording passed. A transient missing-receipt RPC error is also retained before the successful receipt response. Code is projected to byte length/SHA-256; storage preserves exact 32-byte words. Validation checked source pins, schema, chronology, runtime digest, slot-read count and included lifecycle. Exact fresh execution keys, mnemonic and JWT were checked for absence in the capture and Windows review checkout. The reviewed capture was copied byte-for-byte (SHA-256 1d7504c9bc07d448d0477dbc679ed60929c897ecf22fd53db3483aabe2e4de24). Integration teardown checks and the final global owned-resource inventory confirmed no remaining containers/networks. Private logs/keys remain ignored in Linux .local. No independent attestation, workshop contract integration or exact replay is claimed. Codex did not stage, commit or push; prompt commits remain deferred.

## Keyed replacement TTL checkpoint, 2026-11-06 local time

The new keyed-replacement-ttl CLI case covers live entry expiry/refresh separately from the two original suites. The local fixture explicitly configures 30 seconds and verifies that value through skandha_config; existing scenarios retain 300 seconds. No Solidity, timestamp/status injection, package installation, image pull, external deployment or public transaction was needed. Source review reconfirmed FrameTxMempoolEntry.canReplaceWithTTL and the preceding duplicate guard at sidecar 2e22ff0a2898e69ea4bf5275bce1be8581a8582a. Original definitions were compared deeply with both prior RPC captures and remain unchanged.

An initial genuine native CLI run 4a92ce39-f084-4326-aef5-0f971baa0a53 passed all declared TTL actions. Then npm run test:ttl exited 0 in 48.7 seconds. Its fresh run 5ededf77-aa85-419a-b11d-bef185919cbb was PASS with ten declared actions plus cleanup, recorded 2026-11-05T22:35:23.324Z through 22:36:09.620Z (2026-11-06 local time). The base 0xdea8bb433f3698eecf9e1e9ea103091ce3d6d2100a91b7de36a0146b604a4147 stayed New after the wait. The identical live hash was still DUPLICATE, while previously rejected below-bump candidate 0x9c22af4d2ead29c2e6a4d23c73693a0858962becbfc06fea9bf02445c95958b9 became the active replacement. Actual lastUpdatedTime advanced by 33605 milliseconds, exceeding the configured 30000. A subsequent below-bump candidate was rejected and left the replacement New with unchanged timestamp. No inclusion, exact boundary or terminal-status result is inferred.

The integration test checked native exit 0, strict report validation and every action, immutable report export, evidence export equality, replay planning and owned-resource teardown. Offline check-evidence correctly returned INSUFFICIENT/native 3 with zero covered checks and all 11 steps unreevaluated; no TTL-specific offline checker is claimed. [Reviewed capture](evidence/keyed-replacement-ttl.json) has 29 journal entries / 11440 compact entry bytes, zero omissions and seven retained recovered readiness failures. It was copied byte-for-byte from the real test output, SHA-256 1178d88b3814a02e515005e6280c73e6a6cb87bfabe52ff540347092172e0529. Exact execution keys from both new TTL runs and the admission regressions were checked absent from the capture/review checkout; forbidden payload fields were also checked. No validator mnemonic or JWT is generated by this two-process fixture.

Both existing admission/replacement regressions passed under npm run test:integration (12.3/12.5 seconds), retaining BLOCKED for their omitted mining actions. Full mined suites and the earlier native fixture capability test were not rerun for this admission-only addition. Typecheck, Oxlint, formatting, all 59 unit/bootstrap tests, npm ls --all, npm audit (zero application vulnerabilities), both .mjs syntax checks and bash -n passed using the existing Node 24.22.2/npm 11.19.1 tree. Upstream sidecar advisories remain unresolved. Test-level and final global Docker inventories confirmed no owned containers/networks remain. Existing evidence was not rewritten. No UI, independent audit, exact replay or terminal-state coverage was added; Codex did not stage, commit or push, and prompts remain deferred.

## Cancelled readmission and explorer finding checkpoint, 2026-11-06

The new cancelled-replacement case uses the existing cached four-process isolated mining fixture, official codec and fresh EOA sender/payer/funding accounts. No new Solidity, package installation, image pull, external deployment, public transaction, status injection or privileged method was needed. Pinned source inspection confirmed Cancelled > OnChain bypasses the live fee/duplicate guards while simulation and affordability remain required. Current source/images were left unchanged upstream.

Initial investigations were not promoted to conclusive evidence. Run 9644c3f9-a153-4adf-9b22-257363bdeffc failed a combined reactivation/explorer check and omitted 32 journal entries. The assertions were separated, preserving the explorer FAIL. Run 6a885e02-a17d-4f58-bba1-2806066bc412 was deliberately stopped during warm-up after the recording-budget issue was identified; only the owned sidecar was stopped after label/internal-network/no-port verification, and runner cleanup removed the owned resources. Run e96af843-9407-44a4-b096-268e62d545cb reproduced the separate explorer FAIL but still omitted four entries. Neither incomplete run was changed into a complete report or published as conclusive evidence.

The case now polls fork readiness every 15 seconds, retaining the original 5-second default elsewhere, and polls compact cancellation status before collecting full projected history. It keeps the original 256-entry/65536-byte evidence limit. Run e2769d14-3351-4870-8b09-74df1f7784d6 was BLOCKED after a roughly 35-minute wall-clock gap between scheduled two-second status polls; it did not establish the second cancellation. Polling deadlines now use a monotonic clock while actual node timestamps still govern protocol TTL eligibility. Failed/blocked runs remain private historical outputs and are not relabeled.

With the final implementation, npm run test:cancelled exited 0, one test, in 510.9 seconds (observed test duration, not a performance benchmark). Native scenario run 64305eac-6073-4f35-ba81-50a64fe8bc75 exited 1/FAIL as required for the precisely reproduced upstream explorer inconsistency. It recorded 2026-11-06T01:06:27.166Z through 01:14:56.101Z on private chain 9. All substantive checks except explorer-reactivation-consistency passed; the derived mined-state-transition summary was INCONCLUSIVE because it includes that failure. This is successful detection by the harness, not a passing protocol scenario.

Four ordinary canonical transfers mined successfully with 21000 gas each: drain 0xab02a8aaba89d9253bbbc34bfda8f7d338fe1c9b788966e8d37a5eb2d86dfd87 in block 69, restore 0xb14eddda82b221216d284b2cb56180485965df1e7f5ef812d20067e84eccd3d3 in block 71, second drain 0x67a3dd561e55502647b2cafc788e865a5a61ad781700e80ce3e85b005ce0596f in block 72 and second restore 0x85750098b0fb2cd6d62e829f12c657ac9d523e302509d6be832149b02afd4e9b in block 74. Each moved 800000000000000 wei; outgoing drains also consumed actual gas. Balance/simulation boundaries were checked before cancellation and after restoration. Both actual predecessor states were Cancelled with dropped history. Below-bump replacement occurred 6283 milliseconds after cancellation and identical resubmission 4325 milliseconds after cancellation, each below the configured 300000-millisecond TTL. Restored live duplicate/fee checks passed. The reactivated hash 0x55a9420e1a42a2079876d98eda89548fddc02224090711b4d50ca8eaac7b6f22 was active New while explorer admission reported replaced. Source cause and limits are in PROTOCOL_COMPATIBILITY.md; no frame inclusion or financial exploit is claimed.

The [reviewed complete capture](evidence/cancelled-replacement.json) contains 112 entries / 47819 compact entry bytes, zero omissions and ten retained recovered readiness failures. The test verified immutable JSON report/export equality, evidence export, replay planning, native scenario exit 1, the single expected FAIL, all remaining required actions and owned-resource cleanup. Offline check-evidence correctly returned INSUFFICIENT/native 3 with no covered Cancelled action checks. Final validation checked the current definition, schema, chronology, receipt count, actual matching-hash New/replaced responses and capture SHA-256 c24020cd106ca16f48a5719782e09015029f1a7bbf31f0741903ae44eab5a03c. Exact fresh execution keys, mnemonics and JWTs from investigation/final fixtures were checked absent from the selected capture and Windows review checkout; forbidden payload fields were absent. The capture was copied byte-for-byte, preserving all earlier evidence.

After the final timeout changes, both original admission regressions and the TTL integration test passed; original mining branches remain explicitly BLOCKED without --mine. The new case without mining was separately verified to exit native 3/BLOCKED with no scenario transaction submitted. Typecheck, Oxlint, formatting, all 59 unit/bootstrap tests, npm ls --all, npm audit (zero application vulnerabilities), both .mjs syntax checks and bash -n passed on the existing Node 24.22.2/npm 11.19.1 tree. The three prior scenario definitions/captures were compared deeply and remain unchanged. Full original mined suites and native nonce-manager capability coverage were not rerun at this checkpoint. Upstream sidecar advisories remain unresolved. Final global Docker inventory and test-level teardown confirmed no owned containers/networks remain. No UI, independent audit or exact replay was added. Codex did not stage, commit or push; prompt commits remain deferred.
