# Verification summary

Last executed checkpoint: 2026-11-06. Results describe tested scope, not a zero-bug guarantee.

| Check | Result |
| --- | --- |
| Default suite | PASS: 109 tests in the working Linux checkout; earlier 105-test checkpoint also passed in a separate clean-installed checkout |
| Typecheck, lint, formatting, dependency tree and JS/shell syntax | PASS |
| Aftershock full/production npm audits | Zero advisories at check time; upstream sidecar is separate |
| Native CLI/API workflow over genuine reports | PASS: 21 assertions |
| Pinned replacement-rule source test | PASS: exact method boundaries, not live admission evidence |
| Viewer desktop/mobile flows, downloads/comparison and Console | PASS, user-reported manual QA; no automated visual claim |

## Real execution evidence

| Case | Observation |
| --- | --- |
| Original shared payer | Run `1ac1c5da-0d40-497a-9ef3-361b95320654`: 16 PASS steps, 83 journal entries; [reviewed capture](evidence/rpc-paymaster-solvency.json) is a separate earlier run |
| Original keyed lifecycle | Run `690f500b-9527-4cb6-b58e-1f10b2d96cb7`: 18 PASS steps, 79 entries; [reviewed earlier capture](evidence/rpc-keyed-nonce-lifecycle.json) |
| TTL expiry/refresh | [Real passing admission capture](evidence/keyed-replacement-ttl.json); selected offline checks are partial |
| Sponsor storage/staking | [Passing isolated capture](evidence/staked-storage-boundary.json); fresh replay `a6fb04a8-6c02-4d1b-b428-e185b352a580` also PASS |
| Keyed checkpoint reset | Baseline `b90b3d75-55f7-4ad6-b40a-18f050513c7e`, restored `de922d0f-3a90-4994-8df6-1a480d816174`: PASS |
| Cancelled explorer | [Genuine FAIL](evidence/cancelled-replacement.json): active New versus explorer replaced. Passing reproducer does not clear the finding |
| Public baseline | [Our mined transaction](evidence/public-mined-2026-11-06.json): chain 1337, block 2020, overall and both frames success |

Public hash: `0x5609b38df43a2dc3eb354913434354a2cc656eac8cb5074b99ebb9d265f7b3d9`. The first receipt wait timed out; [original admission capture](evidence/public-admission-2026-11-06.json) is unchanged. A normal resubmission of the same signed hash later mined; native Aftershock inspection independently observed consistent results. The node commit is unknown, so source-specific verdict stays INCONCLUSIVE. Public baseline is attributed workshop functionality, not an original suite.

Public mined capture SHA-256: `11bc19302247f76430b7f7e99a2be85fd4994098f7e63320c958fbabd32ba37a`.

## Limits and unresolved results

Thirteen historical private reports have matching checksums but fail current validation: nine lack timestamps (seven also definitions), two have action-order conflicts, two lack RPC-purpose labels. Their verdicts are 11 BLOCKED/two INCONCLUSIVE; none PASS. Originals remain preserved; no observations were invented.

Sponsor offline checking returns INSUFFICIENT because it cannot reconstruct the full scenario from redacted data. Other selected checks also list unsupported steps. Complete journals/checksums are not independent authenticity proofs.

The implementing agent performed self-review; no independent audit/formal verification is claimed. Sidecar dependency advisories, unknown public source identity, broader protocol edges and exact historical replay remain limitations. Empty-host OS/WSL/Docker provisioning, dashboard eligibility/deadline, recording and submission acceptance are NOT VERIFIED. See [scope](PROJECT_SPEC.md) and [submission checklist](SUBMISSION.md).

## Static hosting preparation

`npm run build:static` passed in both Linux checkouts. It exports seven fixed reviewed real captures, precomputed checks/comparisons, JSON/Markdown/evidence downloads, replay guidance and the recorded public receipt. New regressions verify route mapping, compatible/invalid comparisons, retention of the known FAIL, exclusion of unreviewed/private files, and rejection of mocked/symlinked input. The local server retains its existing security boundary.

The generated artifact passed HTTP checks for all 84 data resources plus page/assets/public receipt; private paths returned 404. Sensitive-field scanning found no credentials or signing payloads. Typecheck, lint, formatting, 96 default tests, dependency/syntax checks and the full application audit (zero advisories) passed. No new dependencies, public transactions or contracts were needed; stateful chain suites were not rerun for this export change. Vercel deployment and its CSP were subsequently verified over HTTP. Hosted visual/mobile navigation remains separate from HTTP checks.

## Live reads and fresh browser execution

The deployed snapshot URL returned HTTP 200 with its expected CSP. Its archived records are genuine earlier executions, not mocked live data. New code separates them from explicit live checks and fresh local execution. `/api/live` queries only the fixed gateway's read allowlist; no result is loaded from an archive when RPC fails. Real requests observed chain 1337 and our public hash as OnChain/SUCCESS with complete projected evidence. The deployed Vercel function was subsequently verified: it returned live chain-1337 gateway data, a current observation timestamp and an honest unknown source commit.

The local browser endpoint was exercised through actual HTTP POST/job polling against real Docker fixtures:

| Fresh run | Result |
| --- | --- |
| TTL `a1bc244a-4648-4ba6-992a-4553017b9242` | PASS: 11 steps, 32 journal entries, complete; 11:04:57.612Z–11:05:44.066Z |
| Mined payer `210f8981-05f8-48f5-825d-bfc9850c9b2e` | PASS: 16 steps, 83 entries, complete; 11:06:30.822Z–11:14:48.678Z |

These 2026-11-06 runs saved new immutable reports; no reviewed example was substituted. Cleanup assertions and Docker label inventories confirmed no remaining resources for either run. Private keys/logs/reports remain in Linux. Unit tests separately cover pending/unknown receipts, identity mismatches, upstream errors, local job failures/concurrency, body limits and cross-origin/script rejection. One test's asynchronous completion wait was corrected after a loaded full-suite run exposed a timing race; the final suites passed.

The hosted execution link opens the user's loopback companion; Vercel does not run Docker. A public remote execution backend is not provisioned because the available execution host is WSL only. New controls still need manual visual verification; HTTP and shipped-script tests do not establish browser rendering. No packages, public mutations or external deployments were performed for this change.

## Execution progress and CI checkpoint

Actual engine stage changes and completed assertions now reach job polling and the local UI, with a bounded 64-event history, timestamps and safe failure guidance. Progress contains fixed identifiers and verdicts, not raw node data or diagnostics. Reports remain authoritative; there is no estimated completion percentage. Regression tests cover bounded history, defensive copies, concurrent context isolation, verdict-preserving guidance and failed-job display.

`npm run test:progress` passed both real HTTP-triggered scenarios, each observing SETUP, EXECUTING, CLEANUP and REPORT phases: TTL `918a1579-cc01-4c3d-a975-be45eef2126e` (11 PASS steps) and mined payer `8b9e7c4e-a844-49cb-8274-50d497c7e009` (16 PASS steps). Both saved new isolated reports and verified cleanup. The default suite passed 109 tests; typecheck, lint, formatting, dependency checks, JavaScript syntax and npm audit passed. Static export passed. These are API/script checks; the new progress rendering still needs manual visual confirmation.

The main-push/manual GitHub workflow uses pinned actions, read-only repository permission and the locked Node/dependency setup. It runs the standard gates and static export; native Docker suites remain explicit local integration checks. GitHub-hosted execution is NOT VERIFIED until the workflow is pushed and its first run completes.
