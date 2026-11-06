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
