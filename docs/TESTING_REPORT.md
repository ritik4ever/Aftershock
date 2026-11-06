# Verified milestone: staked storage boundary

Checked on 2026-11-06 with the existing locked installation in `/home/ritik/aftershock-build`, Node 24.22.2. No packages were installed, no public contracts deployed and no Git changes staged or committed by Codex. This is a tested milestone, not a claim that submission or the final repository-wide audit is complete.

## Executed checks

| Command / review | Actual result |
| --- | --- |
| `npm run test:sponsor` | PASS: native CLI, fresh isolated ethrex/sidecar/consensus mining fixture; 1 integration test, approximately 501 seconds |
| `npm run test:upstream-rules` | PASS: 1 pinned source-method test covering TTL, status and integer fee boundaries; not new live admission evidence |
| `npm test` | PASS: 75 TypeScript and 10 JavaScript tests; 0 failed/skipped |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS: 0 errors/warnings |
| `npm run format:check` | PASS |
| `node --check` on viewer/app.js, scripts/probe-devnet.mjs and tests/probe-devnet.test.mjs | PASS |
| `npm audit --omit=dev --json` and `npm audit --json` | PASS: 0 Aftershock advisories at check time; separate upstream sidecar advisories remain disclosed |
| `npm ls --all` | PASS: existing tree valid; no clean reinstall performed |
| `git diff --check` | PASS; Git line-ending conversion notices are configuration notices |
| Secret-pattern scan | No candidates among 98 tracked/unignored files excluding deferred prompts; no private-key/signature/raw-request fields in the new export. Scoped scan, not a guarantee against every secret format |
| `.gitignore` probes | PASS: environment secrets, `.local/`, dependencies, build output, generated reports, private PEM and wallet state ignored; `.env.example` trackable |
| Viewer API / interaction tests | PASS: genuine sponsor report/Markdown export and existing security/interaction coverage |
| Automated visual/mobile QA | NOT VERIFIED: browser host unavailable; native fallback stopped on input/geometry guards. Prior user verification covered existing Scenarios, Runs, Compare and Markdown actions |

The native integration preceded a generic limitation-label correction and viewer sample registration. Subsequent changes passed the full default suite and static checks; the cold integration was not repeated for metadata-only changes.

## Genuine integration evidence

Unchanged filtered report: [staked-storage-boundary.json](evidence/staked-storage-boundary.json). Run `1d533d00-1d6c-411a-9131-5d4a242d3e0f` started at `2026-11-06T07:20:15.957Z` and completed at `2026-11-06T07:28:38.920Z`: 16 PASS steps, 96 journal entries, no omissions. Six temporary readiness failures were retained before recovery. Environment data records automatic bundling. An older generic limitation string incorrectly says manual bundling; new reports correct that label. The capture was not rewritten.

- Actual deployed runtime sizes: registry 1259 bytes, Foreign 76 bytes, wallet 2027 bytes. Successful receipt/address checks passed. Pinned upstream creation artifacts were reused; no custom Solidity or local compilation is claimed.
- Initial wallet nonce 8, balance 0.05 ETH, stake zero. Both interfaces rejected foreign validation storage with the inspected error families.
- Clean staking Frame Transaction `0xf53996091f7b2f6c0d01afe92b40d419247fd3e1b2184eebc321c6c9e6d9740d` mined at block `0x47`; both frames succeeded. Actual stake became 0.012 ETH, delay 86400, withdrawal time zero and wallet nonce 9. Configured minimum stake was 0.01 ETH, minimum delay 0.
- Candidate `0x4e03467ffc8a31514d97c631ab049809a3cc534248c7507dc9b38af7c062d102` was rejected by canonical storage policy, then admitted by the sidecar using the same signed candidate. It was included at block `0x48`, both frames successful, with storage checks passing without waivers.
- Recipient balance increased from `1000000000000000000` to `1000000000000000001` wei; wallet nonce increased from 9 to 10. Owned containers/network were removed and teardown assertions passed.

These private hashes have no public explorer URLs. The existing public baseline has its own genuine explorer link in README. The storage/staking example is adapted from the workshop; original contributions also include the shared-payer/keyed suites, evidence tooling and checkpoint replay.

An earlier native attempt, `3fd28fe0-c9af-4cc7-bc3f-c42c4eb0ec5e`, was BLOCKED by a checksummed-address parser defect and remains a private historical failure. That parser and a normalized-explorer double-parse defect were corrected, regression coverage added and the fresh successful native test above executed. No failed capture was relabeled PASS.

## Requirement assessment at this checkpoint

| Addendum requirement | Assessment | Evidence / remaining limit |
| --- | --- | --- |
| Genuine signed Frame Transaction through real alternative interface | PASS | Official codec and actual native admission |
| Admission/explorer evidence or working submission code | PASS, technical evidence | Native submission/inclusion and projected explorer history; public baseline separately recorded. Sponsor approval NOT VERIFIED |
| Two original stateful scenarios with real observations | PASS for declared scope | Existing shared-payer/keyed lifecycle captures and native tests from prior milestones; not every cold suite rerun this checkpoint |
| Actual sidecar/EIP-8141-aware ethrex execution integration | PASS | Native sponsor integration and existing mined suites |
| Honest classification and reproducible evidence | PASS for reviewed milestone | Complete bounded journal, immutable capture and explicit limits; exact historical timing not claimed |
| CLI connected to scenario engine | PASS | Native CLI integration and command tests |
| Frontend displays genuine data | PASS for tested API/script behavior | Real samples/local reports; latest visual/mobile behavior NOT VERIFIED |
| Error handling, boundaries and redaction | PASS for executed coverage | Default security/regression tests, narrow errors and export review. Final exhaustive self-audit NOT VERIFIED |
| Setup and submission materials | Implemented; full clean-machine reproduction NOT VERIFIED | README, DEMO_GUIDE, SPONSOR_COMPLIANCE, SUBMISSION, AI_USAGE; dashboard/video/publication pending |
| Sponsor-specific necessity demonstration | PASS, local technical behavior | Stake transition, same-candidate canonical rejection/alternative inclusion and actual state change |
| Repository-wide self-audit by Codex | NOT VERIFIED / remaining | Changes critically reviewed; every existing source, dependency, fixture and claim has not been re-audited this checkpoint. No external independent audit claimed |
| Recording, Git publication and dashboard submission | NOT VERIFIED / user action | No video, acceptance, registered track or private-dashboard deadline claimed |

The known Cancelled explorer inconsistency remains a scenario FAIL and an upstream finding, even though its reproducer regression passes. Broader terminal states, contract-paymaster policy mutation and exact historical-clock replay are outside implemented coverage. Nothing in this milestone authorizes public adversarial tests or automatic Git publication.

## Follow-up hardening checkpoint, 2026-11-06

Two confirmed defects were reproduced with failing tests and fixed:

1. Fresh replay required manual bundling for every scenario, rejecting a genuine automatic-bundling sponsor report. Replay now requires automatic mining for this scenario and retains the original manual-mode requirements for other scenarios. Its prerequisites include the pinned workshop/sidecar source objects. Viewer replay planning is covered by an HTTP regression test.
2. Setup-error log write failure could bypass fixture teardown after a resource had been created. The diagnostic write is now optional, so cleanup still runs. A separate Linux process-boundary regression forces the write failure and verifies the owned template container's removal command. It uses a fake executable, never contacts Docker and never produces chain/admission evidence.

The viewer guide was also corrected to distinguish fresh-state replay from the existing checkpoint-backed keyed-nonce reset. No transaction controls were added.

Latest executed checks: `npm test` PASS (77 TypeScript + 10 JavaScript tests, zero failed/skipped); typecheck, lint, formatting, JavaScript syntax, shell syntax and `npm ls --all` PASS. Both Aftershock npm audits returned zero advisories. A scoped scan of 101 tracked/unignored files excluding deferred prompts found no secret-pattern candidates; ignore probes passed. No installation, external deployment or Git mutation was performed by Codex.

`npm run test:replay:sponsor` exited 0: 1 native integration test, approximately 501 seconds. Baseline `1d533d00-1d6c-411a-9131-5d4a242d3e0f` was replayed as **fresh-state** run `a6fb04a8-6c02-4d1b-b428-e185b352a580`, from `2026-11-06T07:44:24.268Z` to `2026-11-06T07:52:46.170Z`. Both runs passed, all action verdicts and compared stable environment fields matched, and the baseline report remained byte-for-byte unchanged. Fresh genesis differed; no snapshot or historical-clock reproduction is claimed.

The rerun has 16 PASS steps and 96 complete projected journal entries, with no omissions. Transaction `0xd8a3d73fec093e455721446121b90a0edf54de3142fcc03352115b541fd616ce` was canonically rejected and alternatively admitted, then included at block `0x48` with two successful frames and unwaived storage checks. The recipient gained one wei and wallet nonce increased from 9 to 10. Native teardown assertions and a subsequent check found no containers/network for this run. The full validated report remains in ignored Linux `reports/`; original published baseline evidence is unchanged. These are private-chain observations, without a public explorer URL.

| Follow-up requirement | Status |
| --- | --- |
| Sponsor fresh replay and native CLI comparison | PASS |
| Viewer sponsor replay-plan endpoint | PASS |
| Diagnostic-write failure cleanup regression | PASS, process-boundary unit test |
| Current default checks and Aftershock dependency audits | PASS |
| New public-devnet observation | NOT VERIFIED; not attempted this checkpoint |
| Exhaustive repository-wide self-audit, clean-machine install and visual/mobile QA | NOT VERIFIED; still remaining |

Review scope included report/observation persistence, RPC parsing and projections, replay/checkpoint boundaries, scenario verdicts, private fixture setup/teardown and viewer APIs/script handling. This focused review does not claim every dependency, existing test and documentation statement has received a complete fresh audit. Existing upstream advisories and the Cancelled explorer finding remain disclosed. No custom Solidity was necessary; the native replay reused the same pinned upstream artifacts.

## Clean setup and original-suite recheck, 2026-11-06

After explicit user authorization, `npm ci --ignore-scripts --offline` succeeded in a separate disposable Linux source checkout using the existing lockfile/cache: 26 packages installed, 29 audited and zero advisories reported. No new dependency was added and the working installation was untouched. This verifies a fresh application dependency installation on the existing host, not provisioning Docker/WSL/images from an empty machine. The reviewed source changes were copied into that checkout before validation. Its typecheck, lint, formatting, `npm ls --all` and full default suite passed: **80 TypeScript + 10 JavaScript tests, zero failed/skipped**.

The added `doctor --local` uses bounded fixed read commands to check runtime, dependencies, Linux Docker, cached image identities/revisions and pinned sponsor artifacts. It reports three readiness scopes and no scenario success. Its real CLI check passed in both Linux checkouts. Regression tests cover missing/duplicate prerequisites, failure redaction, malformed digests and mismatched revision metadata. Public `doctor` behavior is retained.

`npm run test:lifecycle` passed both original native mined suites, with complete genuine journals and verified teardown:

| Scenario | Run ID | Actual observations |
| --- | --- | --- |
| Shared-payer solvency | `1ac1c5da-0d40-497a-9ef3-361b95320654` | 16 PASS steps, 83 journal entries; completed `2026-11-06T08:10:28.539Z` |
| Keyed-nonce lifecycle | `690f500b-9527-4cb6-b58e-1f10b2d96cb7` | 18 PASS steps, 79 journal entries; completed `2026-11-06T08:18:35.030Z` |

These executions exercise the original stateful engine, not just the sponsor demo. Full validated reports remain in ignored Linux `reports/`; neither fresh keys nor raw logs were copied into the Windows checkout.

Browser checks used the current viewer at loopback port 4322. Actual Chrome observations verified scenario/report rendering, run-search filtering, a compatible sponsor comparison returning VERDICTS MATCH and an incompatible pair returning the expected error. Desktop and narrow layouts were inspected. The mobile emulation showed clipping whose cause was not established; it is **not a passed mobile check**. The user stopped Computer Use with Escape, and browser automation stopped immediately. Complete mobile validation and current browser-download interaction remain NOT VERIFIED; export routes and script behavior are covered by the automated suite and prior user checks.

Remaining: resolve mobile clipping, finish exhaustive review of all existing tests/dependencies/documentation claims, verify any remaining required browser actions, and complete user-owned recording/dashboard/publication steps. Broad optional protocol extensions remain explicitly outside the MVP scope. No new public-devnet mutation, custom Solidity or external deployment occurred.

## Final implemented-MVP checkpoint, 2026-11-06

This section supersedes earlier pending mobile/setup statuses. The user explicitly confirmed that lower scenario cards, run details, JSON/Markdown/evidence downloads and compatible-run comparison pass on desktop and mobile, with no whole-page sideways scrolling. After refreshing the updated viewer, the user also confirmed no red Console error. These are **user-reported manual checks**, not automated visual tests. The earlier automation clipping was not reproduced by the user; no speculative CSS fix was made.

Two final application fixes were implemented and regression-tested:

- An occupied viewer port now reports the port, the existing loopback URL and how to select another port. It does not terminate or replace another listener.
- Unavailable reports now expose bounded safe IDs and static reason categories. The UI explains the diagnostic without rendering file contents, filesystem paths, parser errors or HTML. Valid runs remain usable and original files are never rewritten. Tests cover malformed JSON, integrity failure, missing samples, safe rendering and refresh behavior.

The actual private report directory contained 74 valid reports and 13 reports rejected by current validation. A direct per-file recheck found nine captures missing required step timestamps (seven also missing the scenario definition), two keyed-nonce captures with actions out of declared order, and two captures missing RPC-purpose labels. All 13 stored SHA-256 checksums match their report contents; this establishes file consistency, not independently proven execution authenticity. Their recorded verdicts are 11 BLOCKED and two INCONCLUSIVE, with no PASS verdicts. The current keyed-nonce declaration matches its execution order, and 29 report/evidence/viewer regression tests passed on recheck. No correction, deletion or fabricated migration was applied to those captures. The warning is an honest historical-data diagnostic, not a failed current scenario.

### Final checks

| Check | Observed result |
| --- | --- |
| `npm test`, working Linux checkout | PASS: 83 TypeScript + 10 JavaScript tests; zero failed/skipped |
| Same suite in the separate clean-installed checkout | PASS: 93 tests; zero failed/skipped |
| Typecheck, Oxlint, formatting in both checkouts | PASS |
| Pinned upstream TTL/status/integer-fee source-method test | PASS: 1 test; distinct from live execution |
| JavaScript syntax, setup-shell syntax and installed dependency tree | PASS |
| Aftershock production and full npm audits | PASS: zero advisories at check time; upstream container dependencies are separate |
| Actual CLI/API workflow against genuine payer, keyed and sponsor reports | PASS: 21 assertions across JSON/Markdown/evidence exports, replay plans, selected evidence checks, compatible comparison, occupied-port error and report diagnostics |
| Desktop/mobile flows and Console after refresh | PASS, user-reported manual verification |
| Genuine state-changing integration | PASS within the declared cases; native original-suite and sponsor/replay IDs are recorded above |

The sponsor offline evidence checker correctly returns INSUFFICIENT/native 3 because it does not reconstruct that full scenario from redacted inputs. That expected limit is not converted to CONSISTENT or a new live PASS. The CLI/API workflow verifies this classification explicitly.

### Self-review and boundaries

The implemented-MVP self-review checkpoint is complete. It covered first-party source/static checks, test assertions and executed results, CLI arguments/exits, public/private transport separation, report persistence/integrity/limits, scenario verdicts, fixed signing paths, Docker ownership/isolation/cleanup, checkpoint/reset inputs, frontend text rendering/origin controls, dependency/lock metadata, source attribution and current documentation claims. Confirmed defects were fixed and checks rerun. Dependency metadata was inspected across the lockfile; the three runtime dependencies are used, versions are pinned, and the listed licenses are MIT/Apache-2.0. Install scripts remain disabled for the reproduced application install.

This is Codex reviewing its own implementation, not an external independent audit, formal verification, source-to-container attestation or a guarantee that no bugs exist. The separate pinned sidecar dependency advisories remain disclosed and prohibit treating isolation as a claim of production safety. Older failed/unsupported evidence remains preserved. The latest UI/status documentation now distinguishes completed MVP coverage from optional unimplemented protocol extensions.

| Final addendum requirement | Assessment |
| --- | --- |
| Genuine signed Frame Transaction through the actual alternative interface | PASS, native evidence above |
| Admission/explorer evidence or working submission code | PASS, technical evidence; sponsor approval NOT VERIFIED |
| At least two original stateful scenarios with real assertions/observations | PASS, both native original suites |
| Actual EIP-8141-aware ethrex and sidecar state integration | PASS |
| Honest classification and reproducible evidence | PASS within documented scope; exact historical timing not claimed |
| Working CLI attached to the engine | PASS |
| Functional frontend with genuine data | PASS, API/script tests plus user desktop/mobile checks |
| Tested error handling, boundaries and redaction | PASS for reviewed/executed coverage; independent security certification NOT VERIFIED |
| Setup and submission materials | PASS for application setup/docs; provisioning a completely empty OS/WSL/Docker host NOT VERIFIED |
| Sponsor necessity demonstration | PASS: same-candidate canonical rejection and alternative inclusion after real staking |
| Known Cancelled explorer invariant | FAIL retained as an upstream finding; reproducer behavior is expected and disclosed |
| Registered track, exact dashboard deadline and eligibility approval | NOT VERIFIED, user/dashboard action |
| Public Git publication, prompt disclosure decision, recording/upload and submission acceptance | NOT VERIFIED, user action |

The implemented MVP is ready for manual Git review and submission preparation. Optional recent-root coverage, broader terminal/Submitted/Pending edges, reset for every scenario, full raw request reconstruction and exact historical clocks remain outside verified coverage. No public deployment is required for the local read-only product, and no custom Solidity is necessary for the implemented cases.
