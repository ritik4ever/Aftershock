# Environment, 2026-11-05

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
